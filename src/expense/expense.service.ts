import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/expense.dto';
import { baseFields } from '../currency/convert';

@Injectable()
export class ExpenseService {
  constructor(private prisma: PrismaService) {}

  private async getRate(code: string): Promise<number> {
    const c = await this.prisma.currency_setting.findUnique({
      where: { code: code.toUpperCase() },
    });
    return c?.exchangeRate ?? 1;
  }

  async findAll() {
    return this.prisma.expense.findMany({
      where: { deleted_at: null },
      orderBy: { date: 'desc' },
    });
  }

  async create(data: CreateExpenseDto, userId?: number) {
    const expenseDate = data.date ? new Date(data.date) : new Date();
    const currency = data.currency || 'USD';
    const rate = await this.getRate(currency);
    const debitAccount = await this.prisma.chart_of_accounts.findUnique({
      where: { id: data.debitAccountId },
      select: { account_name: true },
    });

    if (!debitAccount) {
      throw new Error('Debit account not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.expense.create({
        data: {
          name: debitAccount.account_name.trim(),
          description: data.description?.trim() || null,
          amount: data.amount,
          category: data.category?.trim() || null,
          vendor: data.vendor?.trim() || null,
          currency,
          reference: data.reference?.trim() || null,
          debitAccountId: data.debitAccountId,
          creditAccountId: data.creditAccountId,
          date: expenseDate,
          created_by: userId,
        },
      });

      // Auto-generate transactions_data (double-entry)
      // Debit: Expense account, Credit: Cash/Bank/Payable
      const narration = `Expense - ${debitAccount.account_name.trim()}${data.category ? ` (${data.category})` : ''}`;
      const refNum = `EXP-${entry.id}`;

      await tx.transactions_data.create({
        data: {
          voucher_date: expenseDate,
          voucher_number: refNum,
          system_ref: `EXP:${entry.id}`,
          account_id: data.debitAccountId,
          ...baseFields(data.amount, 0, currency, rate),
          narration,
          created_by: userId,
        },
      });
      await tx.transactions_data.create({
        data: {
          voucher_date: expenseDate,
          voucher_number: refNum,
          system_ref: `EXP:${entry.id}`,
          account_id: data.creditAccountId,
          ...baseFields(0, data.amount, currency, rate),
          narration,
          created_by: userId,
        },
      });

      return entry;
    });

    return { message: 'Expense recorded successfully', expense: result };
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Expense not found');

    await this.prisma.$transaction(async (tx) => {
      // 1. Soft-delete the expense
      await tx.expense.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: userId },
      });

      // 2. Soft-delete related journal entries so they don't affect reports
      await tx.transactions_data.updateMany({
        where: { system_ref: `EXP:${id}`, deleted_at: null },
        data: { deleted_at: new Date(), deleted_by: userId },
      });
    });

    return {
      message: 'Expense deleted and journal entries reversed successfully',
    };
  }
}
