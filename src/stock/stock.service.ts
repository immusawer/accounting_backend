import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReviewWorkflowService,
  systemRef,
} from '../accounting/review-workflow.service';
import { CreateStockDto } from './dto/stock.dto';

@Injectable()
export class StockService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private workflow: ReviewWorkflowService,
  ) {}

  onModuleInit() {
    this.workflow.registerBuilder('STOCK', async (id, tx) => {
      const s = await tx.stock.findUnique({ where: { id } });
      if (!s || s.deleted_at) return null;
      const baseCur = await this.getBaseCurrencyCode();
      const narration = `Stock ${s.type} - ${s.name} x${s.quantity}`;
      return {
        date: s.date,
        voucherNumber: `STK-${s.id}`,
        systemRef: systemRef('STOCK', s.id),
        narration,
        currency: baseCur,
        exchangeRate: 1,
        lines: [
          { account: { id: s.debitAccountId }, debit: s.totalValue, credit: 0 },
          {
            account: { id: s.creditAccountId },
            debit: 0,
            credit: s.totalValue,
          },
        ],
      };
    });
  }

  private async getBaseCurrencyCode(): Promise<string> {
    const s = await this.prisma.app_setting.findUnique({
      where: { key: 'baseCurrency' },
    });
    return s?.value ?? 'AFN';
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
    const entry = await this.prisma.stock.create({
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
        reviewStatus: 'PENDING',
      },
    });
    return { message: 'Stock entry recorded (pending review)', stock: entry };
  }

  async update(id: number, data: Partial<CreateStockDto>, userId?: number) {
    const existing = await this.prisma.stock.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Stock entry not found');
    this.workflow.ensureEditable(existing.reviewStatus, 'update');

    const quantity = data.quantity ?? existing.quantity;
    const price = data.price ?? existing.price;
    const totalValue = quantity * price;

    const entry = await this.prisma.stock.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description?.trim() ?? undefined,
        type: data.type,
        quantity,
        price,
        totalValue,
        reference: data.reference?.trim() ?? undefined,
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        date: data.date ? new Date(data.date) : undefined,
      },
    });
    return { message: 'Stock entry updated successfully', stock: entry, userId };
  }

  async updateStatus(id: number, next: ReviewStatus, userId?: number) {
    const existing = await this.prisma.stock.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Stock entry not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.workflow.applyTransition({
        kind: 'STOCK',
        recordId: id,
        current: existing.reviewStatus,
        next,
        tx,
        userId,
      });
      return tx.stock.update({
        where: { id },
        data: { reviewStatus: next },
      });
    });
    return { message: `Stock entry moved to ${next}`, stock: updated };
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.stock.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Stock entry not found');
    this.workflow.ensureEditable(existing.reviewStatus, 'delete');

    await this.prisma.stock.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { message: 'Stock entry deleted successfully' };
  }
}
