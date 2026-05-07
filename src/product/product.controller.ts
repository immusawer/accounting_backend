import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('products')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @RequirePermission('inventory.view')
  @Get()
  findAll() {
    return this.productService.findAll();
  }

  @RequirePermission('inventory.view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }

  @RequirePermission('inventory.create')
  @AuditLog({ action: 'CREATE', module: 'product' })
  @Post()
  create(@Body() data: CreateProductDto) {
    return this.productService.create(data);
  }

  @RequirePermission('inventory.update')
  @AuditLog({ action: 'UPDATE', module: 'product' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateProductDto,
  ) {
    return this.productService.update(id, data);
  }

  @RequirePermission('inventory.change_status')
  @AuditLog({ action: 'UPDATE', module: 'product' })
  @Patch(':id/review-status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: ReviewStatus },
    @Req() req: AuthRequest,
  ) {
    return this.productService.updateStatus(id, body.status, req.user.id);
  }

  @RequirePermission('inventory.delete')
  @AuditLog({ action: 'DELETE', module: 'product' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.productService.remove(id, String(req.user.id));
  }
}
