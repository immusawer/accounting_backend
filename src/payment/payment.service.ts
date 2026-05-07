import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReviewWorkflowService,
  systemRef,
} from '../accounting/review-workflow.service';
import { CreatePaymentDto, UpdatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private workflow: ReviewWorkflowService,
  ) {}

  onModuleInit() {
    this.workflow.registerBuilder('PAYMENT', async (id, tx) => {
      const p = await tx.payment.findUnique({
        where: { id },
        include: {
          customer: { select: { name: true } },
          invoice: { select: { invoiceNumber: true } },
        },
      });
      if (!p || p.deletedAt) return null;
      const rate = await this.getRate(p.currency);
      const narration = `Payment from ${p.customer?.name ?? 'customer'}${
        p.invoice ? ` for ${p.invoice.invoiceNumber}` : ''
      }`;
      return {
        date: p.paymentDate,
        voucherNumber: `PMT-${p.id}`,
        systemRef: systemRef('PAYMENT', p.id),
        narration,
        currency: p.currency,
        exchangeRate: rate,
        companyId: p.customerId,
        lines: [
          {
            account: this.getDebitAccountRef(p.paymentMethod),
            debit: p.amount,
            credit: 0,
          },
          {
            account: { name: 'Accounts Receivable', category: 'ASSET' as const },
            debit: 0,
            credit: p.amount,
          },
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

  async create(data: CreatePaymentDto, _userId?: number) {
    const currency = data.currency || 'AFN';
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

  async update(id: number, data: UpdatePaymentDto) {
    const existing = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    this.workflow.ensureEditable(existing.status as any, 'update');

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
   * Status transitions:
   *   PENDING ↔ REVIEWED  (forward generates journal + invoice roll; reverse undoes)
   *   REVIEWED → APPROVED (no side effects)
   *   APPROVED → PENDING  (reverse undoes journal + invoice roll)
   */
  async updateStatus(id: number, next: PaymentStatus, userId?: number) {
    const existing = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Payment not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.workflow.applyTransition({
        kind: 'PAYMENT',
        recordId: id,
        current: existing.status as any,
        next: next as any,
        tx,
        userId,
      });

      // Roll invoice balance forward (PENDING → REVIEWED) or backward (any → PENDING).
      if (existing.invoiceId) {
        const goingForward =
          existing.status === 'PENDING' && next === 'REVIEWED';
        const goingBackward =
          (existing.status === 'REVIEWED' || existing.status === 'APPROVED') &&
          next === 'PENDING';
        if (goingForward || goingBackward) {
          const invoice = await tx.invoice.findUnique({
            where: { id: existing.invoiceId },
          });
          if (invoice && !invoice.deletedAt) {
            const delta = goingForward ? existing.amount : -existing.amount;
            const newPaid = invoice.paidAmount + delta;
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

  async remove(id: number, deletedBy?: string) {
    const existing = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    this.workflow.ensureEditable(existing.status as any, 'delete');

    await this.prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
    return { message: 'Payment deleted successfully' };
  }
}
