import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(data: CreateProductDto) {
    if (data.sku) {
      const existing = await this.prisma.product.findUnique({
        where: { sku: data.sku.trim() },
      });
      if (existing && !existing.deletedAt) {
        throw new ConflictException('A product with this SKU already exists');
      }
    }

    const product = await this.prisma.product.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        sku: data.sku?.trim() || null,
        price: data.price,
        cost: data.cost ?? 0,
        taxRate: data.taxRate ?? 0,
        category: data.category?.trim() || null,
        supplier: data.supplier?.trim() || null,
        unit: data.unit?.trim() || 'pcs',
      },
    });
    return { message: 'Product created successfully', product };
  }

  async update(id: number, data: UpdateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Product not found');

    if (data.sku && data.sku.trim() !== existing.sku) {
      const conflict = await this.prisma.product.findFirst({
        where: { sku: data.sku.trim(), deletedAt: null, NOT: { id } },
      });
      if (conflict)
        throw new ConflictException('A product with this SKU already exists');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description?.trim(),
        sku: data.sku?.trim(),
        price: data.price,
        cost: data.cost,
        taxRate: data.taxRate,
        category: data.category?.trim(),
        supplier: data.supplier?.trim(),
        unit: data.unit?.trim(),
      },
    });
    return { message: 'Product updated successfully', product };
  }

  async remove(id: number, deletedBy?: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Product not found');

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    return { message: 'Product deleted successfully' };
  }
}
