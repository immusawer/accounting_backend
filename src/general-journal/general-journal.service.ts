import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateGeneralJournalDto,
  UpdateGeneralJournalDto,
} from './dto/general-journal.dto';
import { toBase } from '../currency/convert';

@Injectable()
export class GeneralJournalService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.general_journal.findMany({
      where: { deleted_at: null },
      orderBy: { journal_date: 'desc' },
      include: {
        transactions_data: {
          where: { deleted_at: null },
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
        },
      },
    });
  }

  async findOne(id: number) {
    const journal = await this.prisma.general_journal.findFirst({
      where: { id, deleted_at: null },
      include: {
        transactions_data: {
          where: { deleted_at: null },
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
        },
      },
    });
    if (!journal) throw new NotFoundException('Journal not found');
    return journal;
  }

  async create(data: CreateGeneralJournalDto, userId?: number) {
    // Validate double-entry: total debit must equal total credit
    const totalDebit = data.transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredit = data.transactions.reduce((s, t) => s + t.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        'Total debit must equal total credit (double-entry)',
      );
    }

    // Generate journal number
    const lastJournal = await this.prisma.general_journal.findFirst({
      orderBy: { id: 'desc' },
    });
    const nextId = (lastJournal?.id ?? 0) + 1;
    const journalNumber = `GJ-${String(nextId).padStart(5, '0')}`;

    const rate = data.exchange_rate ?? 1;

    const journal = await this.prisma.general_journal.create({
      data: {
        journal_number: journalNumber,
        journal_date: new Date(data.journal_date),
        currency: data.currency ?? 'USD',
        exchange_rate: rate,
        remark: data.remark || null,
        created_by: userId,
        transactions_data: {
          create: data.transactions.map((t) => ({
            voucher_date: new Date(data.journal_date),
            account_id: t.account_id,
            debit: t.debit,
            credit: t.credit,
            base_currency_debit: toBase(t.debit, rate),
            base_currency_credit: toBase(t.credit, rate),
            currency: data.currency ?? 'USD',
            exchange_rate: rate,
            narration: t.narration || null,
            system_ref: `JE:${journalNumber}`,
            created_by: userId,
          })),
        },
      },
      include: {
        transactions_data: {
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
        },
      },
    });

    return { message: 'Journal created successfully', journal };
  }

  async update(id: number, data: UpdateGeneralJournalDto, userId?: number) {
    const existing = await this.prisma.general_journal.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Journal not found');

    // Validate double-entry
    const totalDebit = data.transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredit = data.transactions.reduce((s, t) => s + t.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        'Total debit must equal total credit (double-entry)',
      );
    }

    const rate = data.exchange_rate ?? 1;

    // Soft-delete old transaction lines
    await this.prisma.transactions_data.updateMany({
      where: { general_journal_id: id, deleted_at: null },
      data: { deleted_at: new Date(), deleted_by: userId },
    });

    // Update journal and create new transaction lines
    const journal = await this.prisma.general_journal.update({
      where: { id },
      data: {
        journal_date: new Date(data.journal_date),
        currency: data.currency ?? 'USD',
        exchange_rate: rate,
        remark: data.remark || null,
        updated_by: userId,
        transactions_data: {
          create: data.transactions.map((t) => ({
            voucher_date: new Date(data.journal_date),
            account_id: t.account_id,
            debit: t.debit,
            credit: t.credit,
            base_currency_debit: toBase(t.debit, rate),
            base_currency_credit: toBase(t.credit, rate),
            currency: data.currency ?? 'USD',
            exchange_rate: rate,
            narration: t.narration || null,
            system_ref: `JE:${existing.journal_number}`,
            created_by: userId,
          })),
        },
      },
      include: {
        transactions_data: {
          where: { deleted_at: null },
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
        },
      },
    });

    return { message: 'Journal updated successfully', journal };
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.general_journal.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Journal not found');

    // Soft-delete journal and its transaction lines
    await this.prisma.$transaction([
      this.prisma.transactions_data.updateMany({
        where: { general_journal_id: id, deleted_at: null },
        data: { deleted_at: new Date(), deleted_by: userId },
      }),
      this.prisma.general_journal.update({
        where: { id },
        data: { deleted_at: new Date(), deleted_by: userId },
      }),
    ]);

    return { message: 'Journal deleted successfully' };
  }
}
