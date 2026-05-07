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
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @RequirePermission('sales.view')
  @Get()
  findAll() {
    return this.invoiceService.findAll();
  }

  @RequirePermission('sales.view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.invoiceService.findOne(id);
  }

  @RequirePermission('sales.create')
  @AuditLog({ action: 'CREATE', module: 'invoice' })
  @Post()
  create(@Body() data: CreateInvoiceDto, @Req() req: AuthRequest) {
    return this.invoiceService.create(data, req.user.id);
  }

  @RequirePermission('sales.update')
  @AuditLog({ action: 'UPDATE', module: 'invoice' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    return this.invoiceService.update(id, data, req.user.id);
  }

  @RequirePermission('sales.change_status')
  @AuditLog({ action: 'UPDATE', module: 'invoice' })
  @Patch(':id/review-status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: ReviewStatus },
    @Req() req: AuthRequest,
  ) {
    return this.invoiceService.updateStatus(id, body.status, req.user.id);
  }

  @RequirePermission('sales.delete')
  @AuditLog({ action: 'DELETE', module: 'invoice' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.invoiceService.remove(id, String(req.user.id));
  }
}
