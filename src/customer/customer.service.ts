import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomerService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.customer.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { invoices: true, payments: true } },
      },
    });
  }

  async findOne(id: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { invoices: true, payments: true } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(data: CreateCustomerDto) {
    if (data.email) {
      const existing = await this.prisma.customer.findUnique({
        where: { email: data.email.toLowerCase().trim() },
      });
      if (existing && !existing.deletedAt) {
        throw new ConflictException(
          'A customer with this email already exists',
        );
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        name: data.name.trim(),
        email: data.email?.toLowerCase().trim() || null,
        phone: data.phone?.trim() || null,
        companyName: data.companyName?.trim() || null,
        currency: data.currency || 'USD',
        creditLimit: data.creditLimit ?? 0,
        taxNumber: data.taxNumber?.trim() || null,
        isTaxable: data.isTaxable ?? false,
        billingAddress: data.billingAddress?.trim() || null,
        shippingAddress: data.shippingAddress?.trim() || null,
        city: data.city?.trim() || null,
        country: data.country?.trim() || null,
      },
    });
    return { message: 'Customer created successfully', customer };
  }

  async update(id: number, data: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Customer not found');

    if (data.email && data.email.toLowerCase().trim() !== existing.email) {
      const conflict = await this.prisma.customer.findFirst({
        where: {
          email: data.email.toLowerCase().trim(),
          deletedAt: null,
          NOT: { id },
        },
      });
      if (conflict)
        throw new ConflictException(
          'A customer with this email already exists',
        );
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        email: data.email?.toLowerCase().trim(),
        phone: data.phone?.trim() || null,
        companyName: data.companyName?.trim() || null,
        currency: data.currency,
        creditLimit: data.creditLimit,
        taxNumber: data.taxNumber?.trim() || null,
        isTaxable: data.isTaxable,
        billingAddress: data.billingAddress?.trim() || null,
        shippingAddress: data.shippingAddress?.trim() || null,
        city: data.city?.trim() || null,
        country: data.country?.trim() || null,
      },
    });
    return { message: 'Customer updated successfully', customer };
  }

  async remove(id: number, deletedBy?: string) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Customer not found');

    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    return { message: 'Customer deleted successfully' };
  }
}
