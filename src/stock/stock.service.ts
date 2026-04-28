import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockDto } from './dto/stock.dto';
import { baseFields } from '../currency/convert';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  private async getBaseCurrencyCode(): Promise<string> {
    const s = await this.prisma.app_setting.findUnique({
      where: { key: 'baseCurrency' },
    });
    return s?.value ?? 'USD';
  }

  async findAll() {
    return this.prisma.stock.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(data: CreateStockDto, userId?: number) {
    const totalValue = data.quantity * data.price;
    const stockDate = data.date ? new Date(data.date) : new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.stock.create({
        data: {
          name: data.name.trim(),
          description: data.description?.trim() || null,
          type: data.type,
          quantity: data.quantity,
          price: data.price,
          totalValue,
          reference: data.reference?.trim() || null,
          debitAccountId: data.debitAccountId,
          creditAccountId: data.creditAccountId,
          date: stockDate,
          created_by: userId,
        },
      });

      // Auto-generate transactions_data (double-entry)
      const narration = `Stock ${data.type} - ${data.name.trim()} x${data.quantity}`;
      const refNum = `STK-${entry.id}`;

      const baseCur = await this.getBaseCurrencyCode();

      await tx.transactions_data.create({
        data: {
          voucher_date: stockDate,
          voucher_number: refNum,
          system_ref: `STK:${entry.id}`,
          account_id: data.debitAccountId,
          ...baseFields(totalValue, 0, baseCur, 1),
          narration,
          created_by: userId,
        },
      });
      await tx.transactions_data.create({
        data: {
          voucher_date: stockDate,
          voucher_number: refNum,
          system_ref: `STK:${entry.id}`,
          account_id: data.creditAccountId,
          ...baseFields(0, totalValue, baseCur, 1),
          narration,
          created_by: userId,
        },
      });

      return entry;
    });

    return { message: 'Stock entry recorded successfully', stock: result };
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.stock.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Stock entry not found');

    await this.prisma.$transaction(async (tx) => {
      // 1. Soft-delete the stock entry
      await tx.stock.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: userId },
      });

      // 2. Soft-delete related journal entries so they don't affect reports
      await tx.transactions_data.updateMany({
        where: { system_ref: `STK:${id}`, deleted_at: null },
        data: { deleted_at: new Date(), deleted_by: userId },
      });
    });

    return {
      message: 'Stock entry deleted and journal entries reversed successfully',
    };
  }
}
