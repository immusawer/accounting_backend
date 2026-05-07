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
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ExpenseController {
  constructor(private readonly service: ExpenseService) {}

  @RequirePermission('purchases.view')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @RequirePermission('purchases.create')
  @AuditLog({ action: 'CREATE', module: 'expense' })
  @Post()
  create(@Body() data: CreateExpenseDto, @Req() req: AuthRequest) {
    return this.service.create(data, req.user.id);
  }

  @RequirePermission('purchases.update')
  @AuditLog({ action: 'UPDATE', module: 'expense' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<CreateExpenseDto>,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, data, req.user.id);
  }

  @RequirePermission('purchases.change_status')
  @AuditLog({ action: 'UPDATE', module: 'expense' })
  @Patch(':id/review-status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: ReviewStatus },
    @Req() req: AuthRequest,
  ) {
    return this.service.updateStatus(id, body.status, req.user.id);
  }

  @RequirePermission('purchases.delete')
  @AuditLog({ action: 'DELETE', module: 'expense' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user.id);
  }
}
