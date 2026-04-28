import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
} from './dto/chart-of-accounts.dto';
import { AccountType } from '@prisma/client';

@Injectable()
export class ChartOfAccountsService {
  constructor(private prisma: PrismaService) {}

  private isUniqueCodeError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  async findAllAccounts() {
    return this.prisma.chart_of_accounts.findMany({
      where: { deleted_at: null },
      orderBy: { code: 'asc' },
      include: {
        parent: {
          select: { id: true, account_name: true, code: true, type: true },
        },
        children: {
          where: { deleted_at: null },
          select: { id: true, account_name: true, code: true, type: true },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.chart_of_accounts.findMany({
      where: { deleted_at: null, isVendor: false },
      orderBy: { code: 'asc' },
      include: {
        parent: {
          select: {
            id: true,
            account_name: true,
            code: true,
            type: true,
            category: true,
          },
        },
        children: {
          where: { deleted_at: null },
          select: {
            id: true,
            account_name: true,
            code: true,
            type: true,
            category: true,
          },
        },
      },
    });
  }

  async findOne(id: number) {
    const account = await this.prisma.chart_of_accounts.findFirst({
      where: { id, deleted_at: null, isVendor: false },
      include: {
        parent: {
          select: {
            id: true,
            account_name: true,
            code: true,
            type: true,
            category: true,
          },
        },
        children: {
          where: { deleted_at: null },
          select: { id: true, account_name: true, code: true, type: true },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }
  async create(data: CreateChartOfAccountDto, userId?: number) {
    const name = data.account_name.trim();
    const code = data.code.trim();

    // Check duplicates in parallel
    const [existingCode, existingName] = await Promise.all([
      this.prisma.chart_of_accounts.findUnique({ where: { code } }),
      this.prisma.chart_of_accounts.findFirst({
        where: {
          account_name: {
            equals: name,
            mode: 'insensitive',
          },
          deleted_at: null,
          category: data.category ? data.category : null,
        },
      }),
    ]);

    if (existingName) {
      throw new ConflictException(
        'An account with this name already exists in this category',
      );
    }

    if (existingCode) {
      throw new ConflictException('An account with this code already exists');
    }

    // Determine account type
    let accountType: AccountType = 'main';

    if (data.parent_id) {
      const parent = await this.prisma.chart_of_accounts.findUnique({
        where: { id: data.parent_id, isVendor: false },
      });

      if (!parent) {
        throw new NotFoundException('Parent account not found.');
      }

      const nextTypeMap: Record<AccountType, AccountType | null> = {
        main: 'sub1',
        sub1: 'sub2',
        sub2: 'sub3',
        sub3: null,
      };

      const nextType = nextTypeMap[parent.type];

      if (!nextType) {
        throw new ConflictException('Cannot create child for sub3 account');
      }

      accountType = nextType;
    }
    if (data.parent_id === undefined || data.parent_id === null) {
      throw new ConflictException('Please select a parent account');
    }

    try {
      const account = await this.prisma.chart_of_accounts.create({
        data: {
          account_name: name,
          code,
          type: accountType,
          category: data.category ?? null,
          parent_id: data.parent_id ?? null,
          company_id: data.company_id ?? null,
          created_at: new Date(),
          created_by: userId,
        },
        include: {
          parent: {
            select: { id: true, account_name: true, code: true, type: true },
          },
          children: {
            where: { deleted_at: null },
            select: { id: true, account_name: true, code: true, type: true },
          },
        },
      });
      return {
        message: 'Account created successfully',
        account,
      };
    } catch (error) {
      if (this.isUniqueCodeError(error)) {
        throw new ConflictException('An account with this code already exists');
      }
      throw error;
    }
  }

  async update(id: number, data: UpdateChartOfAccountDto, userId?: number) {
    const existing = await this.prisma.chart_of_accounts.findFirst({
      where: { id, deleted_at: null, isVendor: false },
    });
    if (!existing) throw new NotFoundException('Account not found');

    const trimmedCode = data.code?.trim();
    const trimmedName = data.account_name?.trim();

    if (trimmedCode && trimmedCode !== existing.code) {
      const conflict = await this.prisma.chart_of_accounts.findFirst({
        where: {
          code: trimmedCode,
          NOT: { id },
        },
      });
      if (conflict)
        throw new ConflictException('An account with this code already exists');
    }

    if (
      trimmedName &&
      trimmedName.toLowerCase() !== existing.account_name.toLowerCase()
    ) {
      const conflict = await this.prisma.chart_of_accounts.findFirst({
        where: {
          account_name: {
            equals: trimmedName,
            mode: 'insensitive',
          },
          deleted_at: null,
          category:
            typeof data.category !== 'undefined'
              ? (data.category ?? null)
              : existing.category,
          NOT: { id },
        },
      });

      if (conflict) {
        throw new ConflictException(
          'An account with this name already exists in this category',
        );
      }
    }

    if (data.parent_id != null && data.parent_id !== existing.parent_id) {
      const parent = await this.prisma.chart_of_accounts.findUnique({
        where: { id: data.parent_id, isVendor: false },
      });
      if (!parent) throw new NotFoundException('Parent account not found.');
    }

    try {
      const account = await this.prisma.chart_of_accounts.update({
        where: { id, isVendor: false },
        data: {
          account_name: trimmedName,
          code: trimmedCode,
          type: data.type,
          category: typeof data.category === 'string' ? data.category : null,
          parent_id: data.parent_id,
          company_id: data.company_id,
          updated_by: userId,
        },
        include: {
          parent: {
            select: {
              id: true,
              account_name: true,
              code: true,
              type: true,
              category: true,
            },
          },
          children: {
            where: { deleted_at: null },
            select: {
              id: true,
              account_name: true,
              code: true,
              type: true,
              category: true,
            },
          },
        },
      });
      return { message: 'Account updated successfully', account };
    } catch (error) {
      if (this.isUniqueCodeError(error)) {
        throw new ConflictException('An account with this code already exists');
      }
      throw error;
    }
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.chart_of_accounts.findFirst({
      where: { id, deleted_at: null, isVendor: false },
    });
    if (!existing) throw new NotFoundException('Account not found');

    await this.prisma.chart_of_accounts.update({
      where: { id, isVendor: false },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { message: 'Account deleted successfully' };
  }
}
