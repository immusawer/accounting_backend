import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { baseFields } from '../currency/convert';

/**
 * Reusable helper for auto-generating double-entry journal entries.
 *
 * Usage from any module:
 *   await this.accounting.createDoubleEntry({ ... })
 *
 * Account resolution:
 *   - Looks up accounts by name (case-insensitive partial match)
 *   - Falls back to category-based lookup if name not found
 *   - Caches resolved account IDs per transaction for performance
 *
 * Designed for reuse across Invoice, Payment, Purchase, Expense, etc.
 */

export type AccountRef =
  | { id: number }                            // explicit account ID
  | { name: string; category?: string }       // lookup by name + optional category

export interface JournalLine {
  account: AccountRef;
  debit: number;
  credit: number;
}

export interface CreateDoubleEntryParams {
  /** Date for the voucher */
  date: Date;
  /** e.g. "INV-00001", "PMT-5" */
  voucherNumber: string;
  /** e.g. "INV:1", "PMT:5" — used for linking and reversal */
  systemRef: string;
  /** Human-readable description */
  narration: string;
  /** Currency code */
  currency: string;
  /** Exchange rate to base currency (default 1) */
  exchangeRate?: number;
  /** Journal lines (must balance: total debit === total credit) */
  lines: JournalLine[];
  /** Optional company_id */
  companyId?: number;
  /** Optional user who triggered this */
  userId?: number;
  /** Prisma transaction client (to run inside an existing transaction) */
  tx?: any;
}

@Injectable()
export class AccountingHelper {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve an AccountRef to an actual account ID.
   */
  async resolveAccount(ref: AccountRef, tx?: any): Promise<number> {
    if ('id' in ref) return ref.id;

    const db = tx || this.prisma;
    const { name, category } = ref;

    // Try exact match first, then partial match (case-insensitive)
    const where: any = { deleted_at: null };
    if (category) where.category = category;

    // Exact match
    let account = await db.chart_of_accounts.findFirst({
      where: {
        ...where,
        account_name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });

    // Partial match fallback
    if (!account) {
      account = await db.chart_of_accounts.findFirst({
        where: {
          ...where,
          account_name: { contains: name, mode: 'insensitive' },
        },
        select: { id: true },
      });
    }

    if (!account) {
      throw new NotFoundException(
        `Account "${name}"${category ? ` (category: ${category})` : ''} not found in chart of accounts. Please create it first.`,
      );
    }

    return account.id;
  }

  /**
   * Create balanced double-entry journal entries.
   * Can be called inside an existing Prisma transaction by passing `tx`,
   * or it will use the default prisma client.
   */
  async createDoubleEntry(params: CreateDoubleEntryParams): Promise<void> {
    const {
      date,
      voucherNumber,
      systemRef,
      narration,
      currency,
      exchangeRate = 1,
      lines,
      companyId,
      userId,
      tx,
    } = params;

    const db = tx || this.prisma;

    for (const line of lines) {
      const accountId = await this.resolveAccount(line.account, db);

      await db.transactions_data.create({
        data: {
          voucher_date: date,
          voucher_number: voucherNumber,
          system_ref: systemRef,
          account_id: accountId,
          ...baseFields(line.debit, line.credit, currency, exchangeRate),
          narration,
          company_id: companyId,
          created_by: userId,
        },
      });
    }
  }

  /**
   * Reverse (soft-delete) all journal entries linked to a system_ref.
   */
  async reverseEntries(systemRef: string, tx?: any): Promise<void> {
    const db = tx || this.prisma;
    await db.transactions_data.updateMany({
      where: { system_ref: systemRef, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  }
}
