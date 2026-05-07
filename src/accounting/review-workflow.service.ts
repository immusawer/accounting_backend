import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingHelper, JournalLine } from './accounting.helper';

export type ReviewKind =
  | 'EXPENSE'
  | 'PAYMENT'
  | 'INVOICE'
  | 'SALARY'
  | 'STOCK'
  | 'PRODUCT';

interface JournalSpec {
  date: Date;
  voucherNumber: string;
  systemRef: string;
  narration: string;
  currency: string;
  exchangeRate: number;
  companyId?: number;
  lines: JournalLine[];
}

/**
 * Builder is responsible for translating a record into a journal spec.
 * Returning `null` means this kind has no journal side effects (e.g. PRODUCT).
 */
export type JournalBuilder = (
  recordId: number,
  tx: any,
) => Promise<JournalSpec | null>;

const FORWARD: Record<ReviewStatus, ReviewStatus[]> = {
  PENDING: ['REVIEWED'],
  REVIEWED: ['APPROVED', 'PENDING'],
  // APPROVED is the final sign-off. Reverting requires admin intervention —
  // not an in-app action — so the workflow blocks this transition.
  APPROVED: [],
};

@Injectable()
export class ReviewWorkflowService {
  private builders = new Map<ReviewKind, JournalBuilder>();

  constructor(
    private prisma: PrismaService,
    private accounting: AccountingHelper,
  ) {}

  registerBuilder(kind: ReviewKind, builder: JournalBuilder) {
    this.builders.set(kind, builder);
  }

  validateTransition(current: ReviewStatus, next: ReviewStatus) {
    if (current === next) {
      throw new BadRequestException(`Already in ${current}.`);
    }
    // Special-case the most common user attempt so the message is useful.
    if (current === 'APPROVED' && next === 'PENDING') {
      throw new BadRequestException(
        'Approved records are locked. Contact your administrator to revert.',
      );
    }
    if (!FORWARD[current].includes(next)) {
      throw new BadRequestException(
        `Invalid status transition: ${current} → ${next}. Allowed from ${current}: ${
          FORWARD[current].join(', ') || '(none)'
        }.`,
      );
    }
  }

  /** Generate the journal entry for a record (called on PENDING → REVIEWED). */
  async generateForRecord(
    kind: ReviewKind,
    recordId: number,
    tx: any,
    userId?: number,
  ): Promise<void> {
    const builder = this.builders.get(kind);
    if (!builder) return;
    const spec = await builder(recordId, tx);
    if (!spec) return;
    await this.accounting.createDoubleEntry({
      ...spec,
      userId,
      tx,
    });
  }

  /** Reverse the journal entry for a record (called on REVIEWED/APPROVED → PENDING). */
  async reverseForRecord(
    kind: ReviewKind,
    recordId: number,
    tx: any,
    userId?: number,
  ): Promise<void> {
    await this.accounting.reverseEntries(systemRef(kind, recordId), tx, userId);
  }

  /**
   * Apply a status transition with side effects.
   * Forward (PENDING → REVIEWED) generates journal.
   * Backward (* → PENDING) reverses journal.
   * APPROVED ↔ REVIEWED has no accounting side effects.
   */
  async applyTransition(args: {
    kind: ReviewKind;
    recordId: number;
    current: ReviewStatus;
    next: ReviewStatus;
    tx: any;
    userId?: number;
  }) {
    const { kind, recordId, current, next, tx, userId } = args;
    this.validateTransition(current, next);

    if (current === 'PENDING' && next === 'REVIEWED') {
      await this.generateForRecord(kind, recordId, tx, userId);
    } else if (next === 'PENDING') {
      await this.reverseForRecord(kind, recordId, tx, userId);
    }
  }

  /** Throw if a record is not in PENDING (used by update/delete guards). */
  ensureEditable(reviewStatus: ReviewStatus, action: 'update' | 'delete') {
    if (reviewStatus !== 'PENDING') {
      throw new BadRequestException(
        `Cannot ${action} a ${reviewStatus} record. Change status to PENDING first.`,
      );
    }
  }
}

export const SYSTEM_REF_PREFIX: Record<ReviewKind, string> = {
  EXPENSE: 'EXP',
  PAYMENT: 'PMT',
  INVOICE: 'INV',
  SALARY: 'SAL',
  STOCK: 'STK',
  PRODUCT: 'PRD',
};

export function systemRef(kind: ReviewKind, id: number): string {
  return `${SYSTEM_REF_PREFIX[kind]}:${id}`;
}

// Re-export so consumers don't need to know NotFoundException origin
export { NotFoundException };
