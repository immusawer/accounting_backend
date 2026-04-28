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
import { PaymentService } from './payment.service';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  UpdatePaymentStatusDto,
} from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @RequirePermission('payments.view')
  @Get()
  findAll() {
    return this.paymentService.findAll();
  }

  @RequirePermission('payments.view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paymentService.findOne(id);
  }

  @RequirePermission('payments.create')
  @AuditLog({ action: 'CREATE', module: 'payment' })
  @Post()
  create(@Body() data: CreatePaymentDto, @Req() req: AuthRequest) {
    return this.paymentService.create(data, req.user.id);
  }

  @RequirePermission('payments.update')
  @AuditLog({ action: 'UPDATE', module: 'payment' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdatePaymentDto,
  ) {
    return this.paymentService.update(id, data);
  }

  // Review / approve workflow. Two distinct permissions so you can give
  // a junior accountant "review" rights without letting them sign off.
  // Both permissions are accepted on the same route; the service enforces
  // which transitions each status allows.
  @RequirePermission('payments.review', 'payments.approve')
  @AuditLog({ action: 'UPDATE', module: 'payment' })
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePaymentStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.paymentService.updateStatus(id, body.status, req.user.id);
  }

  @RequirePermission('payments.delete')
  @AuditLog({ action: 'DELETE', module: 'payment' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.paymentService.remove(id, String(req.user.id));
  }
}
