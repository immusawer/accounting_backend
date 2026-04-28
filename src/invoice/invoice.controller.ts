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
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  findAll() {
    return this.invoiceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.invoiceService.findOne(id);
  }

  @AuditLog({ action: 'CREATE', module: 'invoice' })
  @Post()
  create(@Body() data: CreateInvoiceDto, @Req() req: AuthRequest) {
    return this.invoiceService.create(data, req.user.id);
  }

  @AuditLog({ action: 'UPDATE', module: 'invoice' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    return this.invoiceService.update(id, data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'invoice' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.invoiceService.remove(id, String(req.user.id));
  }
}
