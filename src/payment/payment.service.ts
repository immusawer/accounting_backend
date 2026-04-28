import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingHelper } from '../accounting/accounting.helper';
import { CreatePaymentDto, UpdatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingHelper,
  ) {}

  private async getRate(code: string): Promise<number> {
    const c = await this.prisma.currency_setting.findUnique({
      where: { code: code.toUpperCase() },
    });
    return c?.exchangeRate ?? 1;
  }

  /**
   * Resolve the debit account based on payment method.
   * CASH → "Cash" account, BANK_TRANSFER/CREDIT_CARD → "Bank" account.
   */
  private getDebitAccountRef(paymentMethod: string) {
    switch (paymentMethod) {
      case 'CASH':
        return { name: 'Cash', category: 'ASSET' as const };
      case 'BANK_TRANSFER':
      case 'CREDIT_CARD':
        return { name: 'Bank Account', category: 'ASSET' as const };
      default:
        return { name: 'Cash', category: 'ASSET' as const };
    }
  }

  async findAll() {
    return this.prisma.payment.findMany({
      where: { deletedAt: null },
      orderBy: { paymentDate: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true } },
      },
    });
  }

  async findOne(id: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            balanceDue: true,
          },
        },
        attachments: { orderBy: { uploaded_at: 'desc' } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /**
   * Create a PENDING payment. No journal entries are generated yet —
   * the user has to explicitly move the payment to REVIEWED to trigger
   * the double-entry postings.
   */
  async create(data: CreatePaymentDto, _userId?: number) {
    const currency = data.currency || 'USD';
    const paymentDate = data.paymentDate
      ? new Date(data.paymentDate)
      : new Date();

    const payment = await this.prisma.$transaction(async (tx) => {
      if (data.invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: data.invoiceId },
        });
        if (!invoice) throw new NotFoundException('Invoice not found');
        if (invoice.deletedAt)
          throw new BadRequestException('Cannot pay a deleted invoice');
        if (invoice.status === 'CANCELLED')
          throw new BadRequestException('Cannot pay a cancelled invoice');
        if (data.amount > invoice.balanceDue) {
          throw new BadRequestException(
            `Payment amount (${data.amount}) exceeds invoice balance due (${invoice.balanceDue})`,
          );
        }
      }

      return tx.payment.create({
        data: {
          customerId: data.customerId,
          invoiceId: data.invoiceId || null,
          amount: data.amount,
          currency,
          paymentDate,
          paymentMethod: data.paymentMethod,
          reference: data.reference || null,
          notes: data.notes || null,
          status: 'PENDING',
        },
        include: {
          customer: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      });
    });

    return {
      message: 'Payment recorded (pending review)',
      payment,
    };
  }

  /**
   * Edit a payment. Only allowed while status is PENDING — once the
   * accountant has reviewed / approved the payment, we freeze it to
   * keep the generated journal entries faithful to what was recorded.
   */
  async update(id: number, data: UpdatePaymentDto) {
    const existing = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot edit a ${existing.status} payment. Revert to PENDING is not allowed — delete and recreate if this was wrong.`,
      );
    }

    // If the amount changes and an invoice was linked, re-validate against
    // the current balance (the invoice's own balance was never touched for
    // a PENDING payment, so we can compare directly).
    if (data.amount != null && existing.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: existing.invoiceId },
      });
      if (invoice && data.amount > invoice.balanceDue) {
        throw new BadRequestException(
          `Payment amount (${data.amount}) exceeds invoice balance due (${invoice.balanceDue})`,
        );
      }
    }

    const payment = await this.prisma.payment.update({
      where: { id },
      data: {
        amount: data.amount,
        currency: data.currency,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        notes: data.notes,
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
    return { message: 'Payment updated successfully', payment };
  }

  /**
   * Drive the review workflow:
   *   PENDING → REVIEWED  : generate double-entry journal + roll invoice balance
   *   REVIEWED → APPROVED : final sign-off, no side effects
   * Any other transition is blocked.
   */
  async updateStatus(id: number, next: PaymentStatus, userId?: number) {
    const existing = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Payment not found');

    const current = existing.status;
    const allowed: Record<PaymentStatus, PaymentStatus[]> = {
      PENDING: ['REVIEWED'],
      REVIEWED: ['APPROVED'],
      APPROVED: [],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Invalid status transition: ${current} → ${next}. Allowed from ${current}: ${allowed[current].join(', ') || '(none)'}.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Only PENDING → REVIEWED generates accounting side effects.
      if (current === 'PENDING' && next === 'REVIEWED') {
        // 1. Roll the invoice balance forward if this payment is linked.
        if (existing.invoiceId) {
          const invoice = await tx.invoice.findUnique({
            where: { id: existing.invoiceId },
          });
          if (invoice && !invoice.deletedAt) {
            const newPaid = invoice.paidAmount + existing.amount;
            const newBalance = Math.max(0, invoice.total - newPaid);
            const newStatus: InvoiceStatus =
              newBalance <= 0
                ? 'PAID'
                : newPaid > 0
                  ? 'PARTIALLY_PAID'
                  : invoice.status;
            await tx.invoice.update({
              where: { id: existing.invoiceId },
              data: {
                paidAmount: newPaid,
                balanceDue: newBalance,
                status: newStatus,
              },
            });
          }
        }

        // 2. Post the double-entry journal.
        const customer = await tx.customer.findUnique({
          where: { id: existing.customerId },
          select: { name: true },
        });
        const invoice = existing.invoiceId
          ? await tx.invoice.findUnique({
              where: { id: existing.invoiceId },
              select: { invoiceNumber: true },
            })
          : null;
        const narration = `Payment from ${customer?.name ?? 'customer'}${
          invoice ? ` for ${invoice.invoiceNumber}` : ''
        }`;
        const rate = await this.getRate(existing.currency);
        await this.accounting.createDoubleEntry({
          date: existing.paymentDate,
          voucherNumber: `PMT-${existing.id}`,
          systemRef: `PMT:${existing.id}`,
          narration,
          currency: existing.currency,
          exchangeRate: rate,
          companyId: existing.customerId,
          userId,
          tx,
          lines: [
            {
              account: this.getDebitAccountRef(existing.paymentMethod),
              debit: existing.amount,
              credit: 0,
            },
            {
              account: {
                name: 'Accounts Receivable',
                category: 'ASSET',
              },
              debit: 0,
              credit: existing.amount,
            },
          ],
        });
      }

      return tx.payment.update({
        where: { id },
        data: { status: next },
        include: {
          customer: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      });
    });

    return {
      message: `Payment moved to ${next}`,
      payment: updated,
    };
  }

  /**
   * Delete a payment. Only PENDING payments can be deleted — REVIEWED
   * and APPROVED payments have posted journal entries that are audit
   * records; don't let them be wiped silently.
   */
  async remove(id: number, deletedBy?: string) {
    const existing = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot delete a ${existing.status} payment. Only PENDING payments can be deleted.`,
      );
    }
    // PENDING payments don't have journal entries or an invoice balance
    // update yet, so nothing to reverse — just soft-delete the row.
    await this.prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
    return { message: 'Payment deleted successfully' };
  }
}
