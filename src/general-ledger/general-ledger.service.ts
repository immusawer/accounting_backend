import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeneralLedgerService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    from_date?: string;
    to_date?: string;
    account_id?: number;
    search?: string;
  }) {
    const where: Prisma.transactions_dataWhereInput = { deleted_at: null };

    // Date filters
    const dateFilter: Prisma.DateTimeFilter = {};
    if (params.from_date) dateFilter.gte = new Date(params.from_date);
    if (params.to_date) dateFilter.lte = new Date(params.to_date);
    if (params.from_date || params.to_date) where.voucher_date = dateFilter;

    // Account filter
    if (params.account_id) where.account_id = params.account_id;

    // Search filter
    if (params.search) {
      where.OR = [
        {
          chart_of_account: {
            account_name: { contains: params.search, mode: 'insensitive' },
          },
        },
        {
          chart_of_account: {
            code: { contains: params.search, mode: 'insensitive' },
          },
        },
        { narration: { contains: params.search, mode: 'insensitive' } },
        { system_ref: { contains: params.search, mode: 'insensitive' } },
        { voucher_number: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const transactions = await this.prisma.transactions_data.findMany({
      where,
      orderBy: [{ voucher_date: 'asc' }, { id: 'asc' }],
      include: {
        chart_of_account: {
          select: {
            id: true,
            account_name: true,
            code: true,
            type: true,
            category: true,
          },
        },
      },
    });

    // Calculate running balance and totals
    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const data = transactions.map((tx) => {
      const debit = Number(tx.base_currency_debit);
      const credit = Number(tx.base_currency_credit);
      totalDebit += debit;
      totalCredit += credit;
      runningBalance += debit - credit;

      return {
        id: tx.id,
        voucher_date: tx.voucher_date,
        voucher_number: tx.voucher_number,
        system_ref: tx.system_ref,
        account_id: tx.account_id,
        account_name: tx.chart_of_account?.account_name ?? '',
        account_code: tx.chart_of_account?.code ?? '',
        category: tx.chart_of_account?.category ?? null,
        debit: Number(tx.debit),
        credit: Number(tx.credit),
        base_currency_debit: debit,
        base_currency_credit: credit,
        currency: tx.currency,
        narration: tx.narration,
        running_balance: runningBalance,
      };
    });

    return {
      data,
      totals: {
        total_debit: totalDebit,
        total_credit: totalCredit,
      },
      total: data.length,
    };
  }
}
