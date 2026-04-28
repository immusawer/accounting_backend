import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateVendorAccountDto,
  UpdateVendorAccountDto,
} from './dto/vendor.dto';
import { AccountType } from '@prisma/client';

@Injectable()
export class VendorService {
  constructor(private prisma: PrismaService) {}

  private isUniqueCodeError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  async findAll() {
    return this.prisma.chart_of_accounts.findMany({
      where: { deleted_at: null, isVendor: true },
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

  async findOne(id: number) {
    const account = await this.prisma.chart_of_accounts.findFirst({
      where: { id, deleted_at: null, isVendor: true },
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
    if (!account) throw new NotFoundException('Vendor account not found');
    return account;
  }

  async create(data: CreateVendorAccountDto, userId?: number) {
    const name = data.account_name.trim();
    const code = data.code.trim();

    // Run checks in parallel
    const [existingCode, existingName] = await Promise.all([
      this.prisma.chart_of_accounts.findUnique({ where: { code } }),
      this.prisma.chart_of_accounts.findFirst({
        where: {
          account_name: { equals: name, mode: 'insensitive' },
          category: data.category ?? null,
          deleted_at: null,
        },
      }),
    ]);

    if (existingName) {
      throw new ConflictException(
        'A account with this name already exists in this category',
      );
    }

    if (existingCode) {
      throw new ConflictException('A account with this code already exists');
    }
    let accountType: AccountType = 'main';

    if (data.parent_id) {
      const parent = await this.prisma.chart_of_accounts.findUnique({
        where: { id: data.parent_id },
      });

      if (!parent) {
        throw new NotFoundException('Parent account not found.');
      }

      if (parent.type === 'main') accountType = 'sub1';
      else if (parent.type === 'sub1') accountType = 'sub2';
      else if (parent.type === 'sub2') accountType = 'sub3';
      else {
        throw new ConflictException('Cannot create child for sub3 account');
      }
    }

    // Validate parent
    if (data.parent_id) {
      const parent = await this.prisma.chart_of_accounts.findUnique({
        where: { id: data.parent_id },
      });

      if (!parent) {
        throw new NotFoundException('Parent account not found.');
      }
    }
    if (data.parent_id === undefined || data.parent_id === null) {
      throw new ConflictException('Please select a parent account');
    }
    // Create account
    try {
      const account = await this.prisma.chart_of_accounts.create({
        data: {
          account_name: name,
          code,
          type: accountType, // or remove if backend controls it
          category: data.category ?? null,
          isVendor: true,
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
        message: 'Vendor account created successfully',
        account,
      };
    } catch (error) {
      if (this.isUniqueCodeError(error)) {
        throw new ConflictException('A account with this code already exists');
      }
      throw error;
    }
  }
  async update(id: number, data: UpdateVendorAccountDto, userId?: number) {
    const existing = await this.prisma.chart_of_accounts.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) throw new NotFoundException('Vendor account not found');
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
        throw new ConflictException(
          'A vendor account with this code already exists',
        );
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
          category:
            typeof data.category !== 'undefined'
              ? (data.category ?? null)
              : existing.category,
          deleted_at: null,
          NOT: { id },
        },
      });

      if (conflict) {
        throw new ConflictException(
          'A account with this name already exists in this category',
        );
      }
    }

    if (data.parent_id != null && data.parent_id !== existing.parent_id) {
      const parent = await this.prisma.chart_of_accounts.findUnique({
        where: { id: data.parent_id },
      });
      if (!parent) throw new NotFoundException('Parent account not found.');
    }

    try {
      const account = await this.prisma.chart_of_accounts.update({
        where: { id },
        data: {
          account_name: trimmedName,
          code: trimmedCode,
          isVendor: data.isVendor || true,
          type: data.type,
          category: data.category ?? null,
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
              isVendor: true,
            },
          },
          children: {
            where: { deleted_at: null, isVendor: true },
            select: {
              id: true,
              account_name: true,
              code: true,
              type: true,
              isVendor: true,
            },
          },
        },
      });
      return { message: 'Vendor account updated successfully', account };
    } catch (error) {
      if (this.isUniqueCodeError(error)) {
        throw new ConflictException('A account with this code already exists');
      }
      throw error;
    }
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.chart_of_accounts.findFirst({
      where: { id, deleted_at: null, isVendor: true },
    });
    if (!existing) throw new NotFoundException('Vendor account not found');

    await this.prisma.chart_of_accounts.update({
      where: { id, isVendor: true },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { message: 'Vendor account deleted successfully' };
  }
}
