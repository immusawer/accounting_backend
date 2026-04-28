import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTransactionDataDto,
  UpdateTransactionDataDto,
} from './dto/transactions-data.dto';
import { toBase } from '../currency/convert';

@Injectable()
export class TransactionsDataService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.transactions_data.findMany({
      where: { deleted_at: null },
      orderBy: { voucher_date: 'desc' },
      include: {
        chart_of_account: {
          select: { id: true, account_name: true, code: true, type: true },
        },
      },
    });
  }

  async findOne(id: number) {
    const tx = await this.prisma.transactions_data.findFirst({
      where: { id, deleted_at: null },
      include: {
        chart_of_account: {
          select: { id: true, account_name: true, code: true, type: true },
        },
      },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async create(data: CreateTransactionDataDto, userId?: number) {
    const rate = data.exchange_rate ?? 1;
    const tx = await this.prisma.transactions_data.create({
      data: {
        voucher_date: new Date(data.voucher_date),
        voucher_id: data.voucher_id,
        voucher_number: data.voucher_number || null,
        system_ref: data.system_ref || null,
        account_id: data.account_id,
        debit: data.debit,
        credit: data.credit,
        currency: data.currency,
        exchange_rate: rate,
        base_currency_debit: data.base_currency_debit ?? toBase(data.debit, rate),
        base_currency_credit: data.base_currency_credit ?? toBase(data.credit, rate),
        narration: data.narration || null,
        remark: data.remark || null,
        general_journal_id: data.general_journal_id,
        company_id: data.company_id,
        from: data.from || null,
        to: data.to || null,
        created_by: userId,
      },
    });
    return { message: 'Transaction created successfully', transaction: tx };
  }

  async update(id: number, data: UpdateTransactionDataDto, userId?: number) {
    const existing = await this.prisma.transactions_data.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Transaction not found');

    const rate = data.exchange_rate ?? Number(existing.exchange_rate);
    const debit = data.debit ?? Number(existing.debit);
    const credit = data.credit ?? Number(existing.credit);
    const tx = await this.prisma.transactions_data.update({
      where: { id },
      data: {
        voucher_date: data.voucher_date
          ? new Date(data.voucher_date)
          : undefined,
        voucher_id: data.voucher_id,
        voucher_number: data.voucher_number,
        system_ref: data.system_ref,
        account_id: data.account_id,
        debit: data.debit,
        credit: data.credit,
        currency: data.currency,
        exchange_rate: rate,
        base_currency_debit: data.base_currency_debit ?? toBase(debit, rate),
        base_currency_credit: data.base_currency_credit ?? toBase(credit, rate),
        narration: data.narration,
        remark: data.remark,
        general_journal_id: data.general_journal_id,
        company_id: data.company_id,
        from: data.from,
        to: data.to,
        updated_by: userId,
      },
    });
    return { message: 'Transaction updated successfully', transaction: tx };
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.transactions_data.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Transaction not found');

    await this.prisma.transactions_data.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { message: 'Transaction deleted successfully' };
  }
}
