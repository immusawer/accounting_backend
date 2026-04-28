import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountCategory } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const categories = [
      AccountCategory.ASSET,
      AccountCategory.LIABILITY,
      AccountCategory.EQUITY,
      AccountCategory.REVENUE,
      AccountCategory.EXPENSE,
    ];
    const [
      baseSetting,
      totalCustomers,
      totalInvoices,
      totalExpenses,
      totalPayments,
      monthInvoices,
      monthPayments,
      monthExpenses,
      monthCustomers,
      overdueInvoices,
      recentTransactions,
      categoryTotalsRaw,
    ] = await Promise.all([
      // Base currency
      this.prisma.app_setting.findUnique({
        where: { key: 'baseCurrency' },
      }),

      // Counts
      this.prisma.customer.count({
        where: { deletedAt: null, isActive: true },
      }),

      this.prisma.invoice.count({
        where: { deletedAt: null },
      }),

      this.prisma.expense.count({
        where: { deleted_at: null },
      }),

      this.prisma.payment.count({
        where: { deletedAt: null },
      }),

      // Monthly stats
      this.prisma.invoice.count({
        where: { deletedAt: null, createdAt: { gte: startOfMonth } },
      }),

      this.prisma.payment.count({
        where: { deletedAt: null, createdAt: { gte: startOfMonth } },
      }),

      this.prisma.expense.count({
        where: { deleted_at: null, created_at: { gte: startOfMonth } },
      }),

      this.prisma.customer.count({
        where: { deletedAt: null, createdAt: { gte: startOfMonth } },
      }),

      // Overdue invoices
      this.prisma.invoice.findMany({
        where: {
          deletedAt: null,
          dueDate: {
            lt: new Date(), // ⬅️ past due date
          },
          balanceDue: {
            gt: 0, // ⬅️ still unpaid
          },
        },
        orderBy: {
          dueDate: 'asc',
        },
        take: 5,
        include: {
          customer: {
            select: {
              name: true,
            },
          },
        },
      }),

      // Recent transactions
      this.prisma.transactions_data.findMany({
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' },
        take: 8,
        include: {
          chart_of_account: {
            select: { account_name: true, code: true },
          },
        },
      }),

      // ✅ Category totals aggregation
      Promise.all(
        categories.map((category) =>
          this.prisma.transactions_data.aggregate({
            _sum: {
              base_currency_debit: true,
              base_currency_credit: true,
            },
            where: {
              deleted_at: null,
              chart_of_account: { category: category },
            },
          }),
        ),
      ),
    ]);

    const baseCurrency = baseSetting?.value ?? 'USD';

    // ✅ Format category totals
    const categoryTotals = categories.reduce(
      (acc, category, index) => {
        acc[category] = {
          debit: Number(categoryTotalsRaw[index]._sum.base_currency_debit || 0),
          credit: Number(
            categoryTotalsRaw[index]._sum.base_currency_credit || 0,
          ),
        };
        return acc;
      },
      {} as Record<AccountCategory, { debit: number; credit: number }>,
    );

    // ✅ KPI calculations
    const totalIncome = categoryTotals.REVENUE?.credit || 0;
    const totalExpenseAmount = categoryTotals.EXPENSE?.debit || 0;
    const totalSalaryAmount = 0; // adjust if needed

    // Outstanding invoices (optimized)
    const outstandingAgg = await this.prisma.invoice.aggregate({
      _sum: { balanceDue: true },
      where: { deletedAt: null, balanceDue: { gt: 0 } },
    });

    const totalOutstanding = Number(outstandingAgg._sum.balanceDue || 0);

    // Payment status breakdown for the dashboard.
    const [pendingCount, reviewedCount, approvedCount] = await Promise.all([
      this.prisma.payment.count({
        where: { deletedAt: null, status: 'PENDING' },
      }),
      this.prisma.payment.count({
        where: { deletedAt: null, status: 'REVIEWED' },
      }),
      this.prisma.payment.count({
        where: { deletedAt: null, status: 'APPROVED' },
      }),
    ]);

    return {
      baseCurrency,

      kpis: {
        totalIncome,
        totalExpenseAmount,
        totalSalaryAmount,
        totalAllExpenses: totalExpenseAmount + totalSalaryAmount,
        totalOutstanding,
        totalCustomers,
        totalInvoices,
        totalPayments,
        totalExpenses,
        netProfit: totalIncome - totalExpenseAmount - totalSalaryAmount,
      },

      // ✅ NEW (for charts / reports)
      categoryTotals,

      thisMonth: {
        invoices: monthInvoices,
        payments: monthPayments,
        expenses: monthExpenses,
        newCustomers: monthCustomers,
        pendingPayments: pendingCount,
      },

      paymentsByStatus: {
        pending: pendingCount,
        reviewed: reviewedCount,
        approved: approvedCount,
      },

      overdueInvoices: overdueInvoices.map((inv) => ({
        id: inv.invoiceNumber,
        customer: inv.customer?.name ?? '',
        amount: inv.balanceDue,
        daysOverdue: inv.dueDate
          ? Math.max(
              0,
              Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000),
            )
          : 0,
      })),

      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        ref: tx.system_ref,
        account: tx.chart_of_account?.account_name ?? '',
        code: tx.chart_of_account?.code ?? '',
        debit: Number(tx.base_currency_debit),
        credit: Number(tx.base_currency_credit),
        narration: tx.narration,
        date: tx.voucher_date,
      })),
    };
  }
}
