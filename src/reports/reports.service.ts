import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async getBaseCurrency(): Promise<string> {
    const s = await this.prisma.app_setting.findUnique({
      where: { key: 'baseCurrency' },
    });
    return s?.value ?? 'USD';
  }

  async profitAndLoss(from?: string, to?: string) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = endOfDay(new Date(to));
    const txWhere: Prisma.transactions_dataWhereInput = { deleted_at: null };
    if (from || to) txWhere.voucher_date = dateFilter;

    // Pull every revenue & expense account in the chart — we keep parent
    // rows even with zero direct movement so the hierarchy stays intact
    // after rollup.
    const accounts = await this.prisma.chart_of_accounts.findMany({
      where: {
        deleted_at: null,
        category: { in: ['REVENUE', 'EXPENSE'] },
      },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        account_name: true,
        code: true,
        category: true,
        type: true,
        parent_id: true,
      },
    });

    type AccountAccum = {
      id: number;
      account: string;
      code: string;
      category: 'REVENUE' | 'EXPENSE';
      type: string;
      parent_id: number | null;
      amount: number;
    };

    const accMap = new Map<number, AccountAccum>();
    for (const a of accounts) {
      accMap.set(a.id, {
        id: a.id,
        account: a.account_name,
        code: a.code,
        category: a.category as 'REVENUE' | 'EXPENSE',
        type: a.type,
        parent_id: a.parent_id,
        amount: 0,
      });
    }

    // Sum transactions into each account's direct balance. Revenue uses
    // natural credit balance (credits − debits); expense uses natural
    // debit balance (debits − credits).
    const transactions = await this.prisma.transactions_data.findMany({
      where: txWhere,
      select: {
        account_id: true,
        base_currency_debit: true,
        base_currency_credit: true,
      },
    });

    for (const tx of transactions) {
      const acc = accMap.get(tx.account_id);
      if (!acc) continue;
      const debit = Number(tx.base_currency_debit);
      const credit = Number(tx.base_currency_credit);
      if (acc.category === 'REVENUE') acc.amount += credit - debit;
      else acc.amount += debit - credit;
    }

    // Snapshot each account's own (leaf-level) contribution before rollup,
    // so the propagation loop doesn't compound partially-accumulated values.
    const leafAmount = new Map<number, number>();
    for (const [id, a] of accMap) leafAmount.set(id, a.amount);

    // Walk every account up to its root, adding its leaf amount to each
    // ancestor. After this loop, each parent holds the sum of all
    // descendants.
    for (const a of accMap.values()) {
      const own = leafAmount.get(a.id) ?? 0;
      if (own === 0) continue;
      let pid = a.parent_id;
      const visited = new Set<number>();
      while (pid != null && !visited.has(pid)) {
        visited.add(pid);
        const parent = accMap.get(pid);
        if (!parent) break;
        parent.amount += own;
        pid = parent.parent_id;
      }
    }

    const baseCurrency = await this.getBaseCurrency();
    const shape = (a: AccountAccum) => ({
      id: a.id,
      account: a.account,
      code: a.code,
      amount: a.amount,
      parent_id: a.parent_id,
      type: a.type,
    });

    const all = [...accMap.values()];
    // Keep any account whose rolled-up amount is non-zero — parents appear
    // when their descendants have movement, even without direct postings.
    const income = all
      .filter((a) => a.category === 'REVENUE' && a.amount !== 0)
      .map(shape);
    const expenses = all
      .filter((a) => a.category === 'EXPENSE' && a.amount !== 0)
      .map(shape);

    // Totals come from each category's orphan roots — rows whose parent is
    // either null or outside the same category. Covers charts where main
    // income/expense accounts aren't present or weren't categorised.
    const categoryRootTotal = (
      rows: AccountAccum[],
      cat: 'REVENUE' | 'EXPENSE',
    ) => {
      const inCat = rows.filter((r) => r.category === cat);
      const ids = new Set(inCat.map((r) => r.id));
      return inCat
        .filter((r) => r.parent_id === null || !ids.has(r.parent_id))
        .reduce((s, r) => s + r.amount, 0);
    };
    const totalIncome = categoryRootTotal(all, 'REVENUE');
    const totalExpenses = categoryRootTotal(all, 'EXPENSE');

    return {
      baseCurrency,
      income,
      expenses,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
    };
  }

  async balanceSheet(asOf?: string) {
    const txWhere: Prisma.transactions_dataWhereInput = { deleted_at: null };
    if (asOf) txWhere.voucher_date = { lte: endOfDay(new Date(asOf)) };

    // Fetch every non-deleted account. Classification happens in TS below so
    // accounts missing an explicit `category` (legacy or imported data) still
    // land in the right section via code-prefix fallback.
    const accounts = await this.prisma.chart_of_accounts.findMany({
      where: { deleted_at: null },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        account_name: true,
        code: true,
        category: true,
        type: true,
        parent_id: true,
      },
    });

    // Resolve the balance-sheet section for an account:
    //   1. Explicit category wins (ASSET / LIABILITY / EQUITY).
    //   2. Otherwise fall back to the first significant digit of the code —
    //      standard chart-of-accounts numbering uses 1xxx for assets and
    //      2xxx for liabilities. We don't guess EQUITY from the prefix
    //      because different charts use 3xxx or 5xxx.
    const sectionOf = (
      code: string,
      category: string | null,
    ): 'ASSET' | 'LIABILITY' | 'EQUITY' | null => {
      if (
        category === 'ASSET' ||
        category === 'LIABILITY' ||
        category === 'EQUITY'
      )
        return category;
      const match = code.match(/\d/);
      const firstDigit = match ? match[0] : '';
      if (firstDigit === '1') return 'ASSET';
      if (firstDigit === '2') return 'LIABILITY';
      if (firstDigit === '3') return 'EQUITY';
      return null;
    };

    type AccountAccum = {
      id: number;
      account: string;
      code: string;
      category: 'ASSET' | 'LIABILITY' | 'EQUITY';
      type: string;
      parent_id: number | null;
      balance: number;
    };

    const accMap = new Map<number, AccountAccum>();
    for (const a of accounts) {
      const category = sectionOf(a.code, a.category);
      if (!category) continue;
      accMap.set(a.id, {
        id: a.id,
        account: a.account_name,
        code: a.code,
        category,
        type: a.type,
        parent_id: a.parent_id,
        balance: 0,
      });
    }

    const transactions = await this.prisma.transactions_data.findMany({
      where: txWhere,
      select: {
        account_id: true,
        base_currency_debit: true,
        base_currency_credit: true,
      },
    });

    // Apply each account's natural balance direction. Assets are natural
    // debit (debit − credit); liabilities and equity are natural credit
    // (credit − debit). Signs are preserved — a negative rolled-up balance
    // is a real signal worth surfacing, not something to hide with abs().
    for (const tx of transactions) {
      const acc = accMap.get(tx.account_id);
      if (!acc) continue;
      const debit = Number(tx.base_currency_debit);
      const credit = Number(tx.base_currency_credit);
      if (acc.category === 'ASSET') acc.balance += debit - credit;
      else acc.balance += credit - debit;
    }

    // Snapshot leaf balances before roll-up so ancestors don't compound
    // partially-accumulated values during the walk.
    const leafBalance = new Map<number, number>();
    for (const [id, a] of accMap) leafBalance.set(id, a.balance);

    for (const a of accMap.values()) {
      const own = leafBalance.get(a.id) ?? 0;
      if (own === 0) continue;
      let pid = a.parent_id;
      const visited = new Set<number>();
      while (pid != null && !visited.has(pid)) {
        visited.add(pid);
        const parent = accMap.get(pid);
        if (!parent) break;
        parent.balance += own;
        pid = parent.parent_id;
      }
    }

    const baseCurrency = await this.getBaseCurrency();
    const shape = (a: AccountAccum) => ({
      id: a.id,
      account: a.account,
      code: a.code,
      balance: a.balance,
      parent_id: a.parent_id,
      type: a.type,
    });

    const all = [...accMap.values()];
    const assets = all
      .filter((a) => a.category === 'ASSET' && a.balance !== 0)
      .map(shape);
    const liabilities = all
      .filter((a) => a.category === 'LIABILITY' && a.balance !== 0)
      .map(shape);
    const equity = all
      .filter((a) => a.category === 'EQUITY' && a.balance !== 0)
      .map(shape);

    // Totals come from each category's orphan roots — rows whose parent is
    // either null or lives outside the same category. Summing every row
    // would double-count (parents already include descendants after rollup),
    // while `parent_id === null` alone under-counts when the main parent is
    // missing from the chart.
    const categoryRootTotal = (
      rows: AccountAccum[],
      category: 'ASSET' | 'LIABILITY' | 'EQUITY',
    ) => {
      const inCategory = rows.filter((r) => r.category === category);
      const inCategoryIds = new Set(inCategory.map((r) => r.id));
      return inCategory
        .filter(
          (r) =>
            r.parent_id === null || !inCategoryIds.has(r.parent_id),
        )
        .reduce((s, r) => s + r.balance, 0);
    };
    const totalAssets = categoryRootTotal(all, 'ASSET');
    const totalLiabilities = categoryRootTotal(all, 'LIABILITY');
    const totalEquity = categoryRootTotal(all, 'EQUITY');

    // Retained earnings is the balancing plug: the accumulated net income
    // that explains any gap between recorded equity and (Assets − Liabilities).
    const retainedEarnings = totalAssets - totalLiabilities - totalEquity;

    return {
      baseCurrency,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      retainedEarnings,
      // Real balance check against the fundamental equation
      // Assets = Liabilities + Equity, BEFORE any plug. If this is false,
      // the books have an unposted gap that the user should investigate.
      isBalanced:
        Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  async cashFlow(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? endOfDay(new Date(to)) : null;
    const dateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) dateFilter.gte = fromDate;
    if (toDate) dateFilter.lte = toDate;
    const txWhere: Prisma.transactions_dataWhereInput = { deleted_at: null };
    if (fromDate || toDate) txWhere.voucher_date = dateFilter;

    // 1. Identify cash & bank accounts — cash flow is the movement ON
    //    these accounts. We match by account name (case-insensitive) since
    //    the schema has no dedicated "cash" flag.
    const cashAccounts = await this.prisma.chart_of_accounts.findMany({
      where: {
        deleted_at: null,
        OR: [
          { account_name: { contains: 'cash', mode: 'insensitive' } },
          { account_name: { contains: 'bank', mode: 'insensitive' } },
        ],
      },
      select: { id: true, account_name: true },
    });
    const cashIds = new Set(cashAccounts.map((a) => a.id));

    const baseCurrency = await this.getBaseCurrency();
    const emptySection = () => ({
      inflows: 0,
      outflows: 0,
      details: new Map<string, number>(),
    });
    const operating = emptySection();
    const investing = emptySection();
    const financing = emptySection();

    // If the chart has no cash/bank accounts yet, return zeros rather than
    // hallucinating cash flow from every journal line.
    if (cashIds.size === 0) {
      const fmt = (s: ReturnType<typeof emptySection>) => ({
        inflows: 0,
        outflows: 0,
        net: 0,
        details: [] as { source: string; amount: number }[],
      });
      return {
        baseCurrency,
        operating: fmt(operating),
        investing: fmt(investing),
        financing: fmt(financing),
        totalInflows: 0,
        totalOutflows: 0,
        netCashFlow: 0,
      };
    }

    // 2. Pull just the cash-account legs — this is the key correctness fix.
    //    Previously EVERY transaction was counted, which double-counted
    //    both sides of every journal entry.
    const cashTransactions = await this.prisma.transactions_data.findMany({
      where: {
        ...txWhere,
        account_id: { in: [...cashIds] },
      },
      select: {
        id: true,
        account_id: true,
        voucher_id: true,
        general_journal_id: true,
        system_ref: true,
        base_currency_debit: true,
        base_currency_credit: true,
      },
      orderBy: { voucher_date: 'asc' },
    });

    // 3. Fetch the counterpart legs (same voucher / journal, non-cash
    //    account). Their category tells us how to classify the cash move.
    const voucherIds = [
      ...new Set(
        cashTransactions
          .map((t) => t.voucher_id)
          .filter((v): v is number => v != null),
      ),
    ];
    const journalIds = [
      ...new Set(
        cashTransactions
          .map((t) => t.general_journal_id)
          .filter((v): v is number => v != null),
      ),
    ];
    const counterparts =
      voucherIds.length + journalIds.length === 0
        ? []
        : await this.prisma.transactions_data.findMany({
            where: {
              deleted_at: null,
              account_id: { notIn: [...cashIds] },
              OR: [
                voucherIds.length
                  ? { voucher_id: { in: voucherIds } }
                  : undefined,
                journalIds.length
                  ? { general_journal_id: { in: journalIds } }
                  : undefined,
              ].filter(Boolean) as Prisma.transactions_dataWhereInput[],
            },
            select: {
              voucher_id: true,
              general_journal_id: true,
              base_currency_debit: true,
              base_currency_credit: true,
              chart_of_account: {
                select: { account_name: true, category: true },
              },
            },
          });

    const cpByVoucher = new Map<number, typeof counterparts>();
    const cpByJournal = new Map<number, typeof counterparts>();
    for (const cp of counterparts) {
      if (cp.voucher_id != null) {
        const list = cpByVoucher.get(cp.voucher_id) ?? [];
        list.push(cp);
        cpByVoucher.set(cp.voucher_id, list);
      }
      if (cp.general_journal_id != null) {
        const list = cpByJournal.get(cp.general_journal_id) ?? [];
        list.push(cp);
        cpByJournal.set(cp.general_journal_id, list);
      }
    }

    // 4. Classify each cash movement. Direct method: debit on cash = inflow,
    //    credit from cash = outflow. Bucket into Operating / Investing /
    //    Financing using system_ref (when set) or the counterpart category.
    type Section = typeof operating;
    const classify = (
      ref: string,
      counterpartCategory: string | null,
    ): { section: Section; label: string } => {
      if (ref.startsWith('PMT:'))
        return { section: operating, label: 'Payments received (customers)' };
      if (ref.startsWith('EXP:'))
        return { section: operating, label: 'Operating expenses' };
      if (ref.startsWith('SAL:'))
        return { section: operating, label: 'Salaries & payroll' };
      if (ref.startsWith('STK:'))
        // Inventory is working-capital / operating, not investing.
        return { section: operating, label: 'Inventory purchases' };
      switch (counterpartCategory) {
        case 'REVENUE':
          return { section: operating, label: 'Revenue settlements' };
        case 'EXPENSE':
          return { section: operating, label: 'Expenses' };
        case 'EQUITY':
          return { section: financing, label: 'Equity transactions' };
        case 'LIABILITY':
          return { section: financing, label: 'Debt / loans' };
        case 'ASSET':
          return { section: investing, label: 'Asset movements' };
        default:
          return { section: operating, label: 'Other' };
      }
    };

    for (const tx of cashTransactions) {
      const bd = Number(tx.base_currency_debit);
      const bc = Number(tx.base_currency_credit);
      if (bd === 0 && bc === 0) continue;

      // Pick the most informative counterpart (any non-cash leg of the
      // same entry). For multi-leg journals the first non-cash leg is used.
      const legs =
        (tx.voucher_id != null && cpByVoucher.get(tx.voucher_id)) ||
        (tx.general_journal_id != null &&
          cpByJournal.get(tx.general_journal_id)) ||
        [];
      const counterpart = Array.isArray(legs) ? legs[0] : undefined;
      const counterpartCategory = counterpart?.chart_of_account?.category ?? null;

      const { section, label } = classify(tx.system_ref ?? '', counterpartCategory);

      if (bd > 0) {
        section.inflows += bd;
        section.details.set(
          label,
          (section.details.get(label) ?? 0) + bd,
        );
      }
      if (bc > 0) {
        section.outflows += bc;
        section.details.set(
          label,
          (section.details.get(label) ?? 0) - bc,
        );
      }
    }

    const formatSection = (s: Section) => ({
      inflows: s.inflows,
      outflows: s.outflows,
      net: s.inflows - s.outflows,
      details: [...s.details.entries()].map(([source, amount]) => ({
        source,
        amount,
      })),
    });

    const totalInflows =
      operating.inflows + investing.inflows + financing.inflows;
    const totalOutflows =
      operating.outflows + investing.outflows + financing.outflows;

    return {
      baseCurrency,
      operating: formatSection(operating),
      investing: formatSection(investing),
      financing: formatSection(financing),
      totalInflows,
      totalOutflows,
      netCashFlow: totalInflows - totalOutflows,
    };
  }
}

// Round a Date up to the final millisecond of its local day so a `lte`
// filter includes every transaction posted on that day.
function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
