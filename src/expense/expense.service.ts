import {
  BadRequestException,
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
import { CreateExpenseDto } from './dto/expense.dto';

@Injectable()
export class ExpenseService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private workflow: ReviewWorkflowService,
  ) {}

  onModuleInit() {
    this.workflow.registerBuilder('EXPENSE', async (id, tx) => {
      const e = await tx.expense.findUnique({ where: { id } });
      if (!e || e.deleted_at) return null;
      const debit = await tx.chart_of_accounts.findUnique({
        where: { id: e.debitAccountId },
        select: { account_name: true },
      });
      const rate = await this.getRate(e.currency);
      const narration = `Expense - ${debit?.account_name?.trim() ?? 'Expense'}${
        e.category ? ` (${e.category})` : ''
      }`;
      return {
        date: e.date,
        voucherNumber: `EXP-${e.id}`,
        systemRef: systemRef('EXPENSE', e.id),
        narration,
        currency: e.currency,
        exchangeRate: rate,
        lines: [
          { account: { id: e.debitAccountId }, debit: e.amount, credit: 0 },
          { account: { id: e.creditAccountId }, debit: 0, credit: e.amount },
        ],
      };
    });
  }

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
    const currency = data.currency || 'AFN';
    const debitAccount = await this.prisma.chart_of_accounts.findUnique({
      where: { id: data.debitAccountId },
      select: { account_name: true },
    });
    if (!debitAccount) throw new NotFoundException('Debit account not found');

    const expense = await this.prisma.expense.create({
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
        reviewStatus: 'PENDING',
      },
    });

    return { message: 'Expense recorded (pending review)', expense };
  }

  async update(id: number, data: Partial<CreateExpenseDto>, userId?: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Expense not found');
    this.workflow.ensureEditable(existing.reviewStatus, 'update');

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        description: data.description?.trim() ?? undefined,
        amount: data.amount,
        category: data.category?.trim() ?? undefined,
        vendor: data.vendor?.trim() ?? undefined,
        currency: data.currency,
        reference: data.reference?.trim() ?? undefined,
        debitAccountId: data.debitAccountId,
        creditAccountId: data.creditAccountId,
        date: data.date ? new Date(data.date) : undefined,
      },
    });
    return { message: 'Expense updated successfully', expense, userId };
  }

  async updateStatus(id: number, next: ReviewStatus, userId?: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Expense not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.workflow.applyTransition({
        kind: 'EXPENSE',
        recordId: id,
        current: existing.reviewStatus,
        next,
        tx,
        userId,
      });
      return tx.expense.update({
        where: { id },
        data: { reviewStatus: next },
      });
    });
    return { message: `Expense moved to ${next}`, expense: updated };
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Expense not found');
    this.workflow.ensureEditable(existing.reviewStatus, 'delete');

    await this.prisma.expense.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { message: 'Expense deleted successfully' };
  }
}
