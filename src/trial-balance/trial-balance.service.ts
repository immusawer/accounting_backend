import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AccountAccumulator {
  account_id: number;
  account_name: string;
  account_code: string;
  category: string | null;
  type: string;
  parent_id: number | null;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
}

@Injectable()
export class TrialBalanceService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    from_date?: string;
    to_date?: string;
    search?: string;
  }) {
    // Always fetch ALL non-deleted accounts so parents are available for tree/rollup.
    // We apply `search` filtering in-memory later so we don't drop parent rows needed
    // to keep the hierarchy intact.
    const accounts = await this.prisma.chart_of_accounts.findMany({
      where: { deleted_at: null },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        account_name: true,
        code: true,
        type: true,
        category: true,
        parent_id: true,
      },
    });

    // Build account map
    const accountMap = new Map<number, AccountAccumulator>();
    for (const acc of accounts) {
      accountMap.set(acc.id, {
        account_id: acc.id,
        account_name: acc.account_name,
        account_code: acc.code,
        category: acc.category,
        type: acc.type,
        parent_id: acc.parent_id,
        opening_debit: 0,
        opening_credit: 0,
        period_debit: 0,
        period_credit: 0,
      });
    }

    // Get all non-deleted transactions
    const allTransactions = await this.prisma.transactions_data.findMany({
      where: { deleted_at: null },
      select: {
        account_id: true,
        voucher_date: true,
        base_currency_debit: true,
        base_currency_credit: true,
      },
    });

    const fromDate = params.from_date ? new Date(params.from_date) : null;
    const toDate = params.to_date ? new Date(params.to_date) : null;

    for (const tx of allTransactions) {
      const acc = accountMap.get(tx.account_id);
      if (!acc) continue;

      const debit = Number(tx.base_currency_debit);
      const credit = Number(tx.base_currency_credit);
      const txDate = new Date(tx.voucher_date);

      if (fromDate && toDate) {
        // With date range: opening = before from_date, period = between from and to
        if (txDate < fromDate) {
          acc.opening_debit += debit;
          acc.opening_credit += credit;
        } else if (txDate <= toDate) {
          acc.period_debit += debit;
          acc.period_credit += credit;
        }
      } else if (fromDate) {
        // Only from_date: opening = before from_date, period = from_date onwards
        if (txDate < fromDate) {
          acc.opening_debit += debit;
          acc.opening_credit += credit;
        } else {
          acc.period_debit += debit;
          acc.period_credit += credit;
        }
      } else if (toDate) {
        // Only to_date: no opening, period = everything up to to_date
        if (txDate <= toDate) {
          acc.period_debit += debit;
          acc.period_credit += credit;
        }
      } else {
        // No date filters: everything is period (cumulative)
        acc.period_debit += debit;
        acc.period_credit += credit;
      }
    }

    // Roll up each account's own balances into all of its ancestors so parent
    // rows (main / sub1 / sub2) show the aggregated value of their descendants.
    // We walk each leaf up the parent chain and add its *own* totals (not the
    // accumulated ones) to every ancestor.
    const ownTotals = new Map<
      number,
      {
        opening_debit: number;
        opening_credit: number;
        period_debit: number;
        period_credit: number;
      }
    >();
    for (const acc of accountMap.values()) {
      ownTotals.set(acc.account_id, {
        opening_debit: acc.opening_debit,
        opening_credit: acc.opening_credit,
        period_debit: acc.period_debit,
        period_credit: acc.period_credit,
      });
    }
    for (const acc of accountMap.values()) {
      const own = ownTotals.get(acc.account_id);
      if (!own) continue;
      let parentId = acc.parent_id;
      const seen = new Set<number>();
      while (parentId != null && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = accountMap.get(parentId);
        if (!parent) break;
        parent.opening_debit += own.opening_debit;
        parent.opening_credit += own.opening_credit;
        parent.period_debit += own.period_debit;
        parent.period_credit += own.period_credit;
        parentId = parent.parent_id;
      }
    }

    // Optional search filter — apply after roll-up, but keep each matching
    // account's ancestors so the tree stays connected.
    let keepIds: Set<number> | null = null;
    if (params.search) {
      const q = params.search.toLowerCase();
      keepIds = new Set<number>();
      for (const acc of accountMap.values()) {
        if (
          acc.account_name.toLowerCase().includes(q) ||
          acc.account_code.toLowerCase().includes(q)
        ) {
          keepIds.add(acc.account_id);
          let pid = acc.parent_id;
          const seen = new Set<number>();
          while (pid != null && !seen.has(pid)) {
            seen.add(pid);
            keepIds.add(pid);
            const parent = accountMap.get(pid);
            if (!parent) break;
            pid = parent.parent_id;
          }
        }
      }
    }

    // Build result rows. Keep accounts with any non-zero balance (after
    // rollup) so parent rows appear. Drop zero-balance accounts that have no
    // movement at all.
    const data = [...accountMap.values()]
      .filter((a) => {
        if (keepIds && !keepIds.has(a.account_id)) return false;
        return (
          a.opening_debit > 0 ||
          a.opening_credit > 0 ||
          a.period_debit > 0 ||
          a.period_credit > 0
        );
      })
      .map((a) => ({
        account_id: a.account_id,
        account_name: a.account_name,
        account_code: a.account_code,
        category: a.category,
        type: a.type,
        parent_id: a.parent_id,
        opening_debit: a.opening_debit,
        opening_credit: a.opening_credit,
        period_debit: a.period_debit,
        period_credit: a.period_credit,
        closing_debit: a.opening_debit + a.period_debit,
        closing_credit: a.opening_credit + a.period_credit,
      }));

    // Totals from the root (main) accounts only, to avoid double-counting
    // after the rollup.
    const totals = data
      .filter((r) => r.parent_id === null)
      .reduce(
        (t, row) => ({
          opening_debit: t.opening_debit + row.opening_debit,
          opening_credit: t.opening_credit + row.opening_credit,
          period_debit: t.period_debit + row.period_debit,
          period_credit: t.period_credit + row.period_credit,
          closing_debit: t.closing_debit + row.closing_debit,
          closing_credit: t.closing_credit + row.closing_credit,
        }),
        {
          opening_debit: 0,
          opening_credit: 0,
          period_debit: 0,
          period_credit: 0,
          closing_debit: 0,
          closing_credit: 0,
        },
      );

    return { data, totals };
  }
}
