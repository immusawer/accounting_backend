import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingHelper } from '../accounting/accounting.helper';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';

@Injectable()
export class InvoiceService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingHelper,
  ) {}

  private async nextInvoiceNumber(): Promise<string> {
    const last = await this.prisma.invoice.findFirst({
      orderBy: { id: 'desc' },
      select: { invoiceNumber: true },
    });
    const num = last
      ? parseInt(last.invoiceNumber.replace(/\D/g, ''), 10) + 1
      : 1;
    return `INV-${String(num).padStart(5, '0')}`;
  }

  private async getRate(code: string): Promise<number> {
    const c = await this.prisma.currency_setting.findUnique({
      where: { code: code.toUpperCase() },
    });
    return c?.exchangeRate ?? 1;
  }

  async findAll() {
    return this.prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        _count: { select: { payments: true } },
      },
    });
  }

  async findOne(id: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        payments: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async create(data: CreateInvoiceDto, userId?: number) {
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('At least one item is required');
    }

    const invoiceNumber = await this.nextInvoiceNumber();
    const currency = data.currency || 'USD';
    const rate = await this.getRate(currency);

    // Look up all products
    const productIds = data.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Build line items from products
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const itemsData = data.items.map((line) => {
      const product = productMap.get(line.productId);
      if (!product) {
        throw new NotFoundException(
          `Product with ID ${line.productId} not found`,
        );
      }

      const unitPrice = line.unitPrice ?? product.price;
      const lineTotal = line.quantity * unitPrice;
      const lineTax = lineTotal * (product.taxRate / 100);
      const lineDiscount = line.discount ?? 0;
      const itemTotal = lineTotal + lineTax - lineDiscount;

      subtotal += lineTotal;
      totalTax += lineTax;
      totalDiscount += lineDiscount;

      return {
        productId: product.id,
        description: product.name,
        quantity: line.quantity,
        unitPrice,
        taxRate: product.taxRate,
        discount: lineDiscount,
        total: itemTotal,
      };
    });

    const total = subtotal + totalTax - totalDiscount;
    const issueDate = data.issueDate ? new Date(data.issueDate) : new Date();

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: data.customerId,
          issueDate,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          currency,
          notes: data.notes || null,
          subtotal,
          tax: totalTax,
          discount: totalDiscount,
          total,
          paidAmount: 0,
          balanceDue: total,
          items: { create: itemsData },
        },
        include: {
          customer: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });

      // Auto-generate double-entry journal entries
      // Debit: Accounts Receivable (asset increases)
      // Credit: Revenue (income earned)
      await this.accounting.createDoubleEntry({
        date: issueDate,
        voucherNumber: invoiceNumber,
        systemRef: `INV:${inv.id}`,
        narration: `Invoice ${invoiceNumber} to ${inv.customer.name}`,
        currency,
        exchangeRate: rate,
        companyId: data.customerId,
        userId,
        tx,
        lines: [
          {
            account: { name: 'Accounts Receivable', category: 'ASSET' },
            debit: total,
            credit: 0,
          },
          {
            account: { name: 'Revenue', category: 'REVENUE' },
            debit: 0,
            credit: total,
          },
        ],
      });

      return inv;
    });

    return { message: 'Invoice created successfully', invoice, userId };
  }

  async update(id: number, data: UpdateInvoiceDto, userId?: number) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { customer: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundException('Invoice not found');

    const invoice = await this.prisma.$transaction(async (tx) => {
      // Update basic fields
      const updateData: any = {};
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      if (data.notes !== undefined) updateData.notes = data.notes || null;
      if (data.currency !== undefined) updateData.currency = data.currency;

      // If items provided, recalculate totals
      if (data.items && data.items.length > 0) {
        const productIds = data.items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, deletedAt: null },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        let subtotal = 0;
        let totalTax = 0;
        let totalDiscount = 0;

        const itemsData = data.items.map((line) => {
          const product = productMap.get(line.productId);
          if (!product) {
            throw new NotFoundException(`Product with ID ${line.productId} not found`);
          }
          const unitPrice = line.unitPrice ?? product.price;
          const lineTotal = line.quantity * unitPrice;
          const lineTax = lineTotal * (product.taxRate / 100);
          const lineDiscount = line.discount ?? 0;
          const itemTotal = lineTotal + lineTax - lineDiscount;

          subtotal += lineTotal;
          totalTax += lineTax;
          totalDiscount += lineDiscount;

          return {
            productId: product.id,
            description: product.name,
            quantity: line.quantity,
            unitPrice,
            taxRate: product.taxRate,
            discount: lineDiscount,
            total: itemTotal,
          };
        });

        const total = subtotal + totalTax - totalDiscount;
        const paidAmount = existing.paidAmount;
        const balanceDue = total - paidAmount;

        // Delete old items and create new ones
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

        updateData.subtotal = subtotal;
        updateData.tax = totalTax;
        updateData.discount = totalDiscount;
        updateData.total = total;
        updateData.balanceDue = balanceDue;
        updateData.items = { create: itemsData };

        // Reverse old journal entries and create new ones
        const currency = data.currency || existing.currency;
        const rate = await this.getRate(currency);

        await this.accounting.reverseEntries(`INV:${id}`, tx);
        await this.accounting.createDoubleEntry({
          date: existing.issueDate,
          voucherNumber: existing.invoiceNumber,
          systemRef: `INV:${id}`,
          narration: `Invoice ${existing.invoiceNumber} to ${existing.customer?.name ?? 'Customer'}`,
          currency,
          exchangeRate: rate,
          companyId: existing.customerId,
          userId,
          tx,
          lines: [
            {
              account: { name: 'Accounts Receivable', category: 'ASSET' },
              debit: total,
              credit: 0,
            },
            {
              account: { name: 'Revenue', category: 'REVENUE' },
              debit: 0,
              credit: total,
            },
          ],
        });
      }

      return tx.invoice.update({
        where: { id },
        data: updateData,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });
    });

    return { message: 'Invoice updated successfully', invoice };
  }

  async remove(id: number, deletedBy?: string) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Invoice not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy },
      });

      // Reverse journal entries
      await this.accounting.reverseEntries(`INV:${id}`, tx);
    });

    return { message: 'Invoice deleted successfully' };
  }
}
