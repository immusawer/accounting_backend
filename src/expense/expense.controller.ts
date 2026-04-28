import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpenseController {
  constructor(private readonly service: ExpenseService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @AuditLog({ action: 'CREATE', module: 'expense' })
  @Post()
  create(@Body() data: CreateExpenseDto, @Req() req: AuthRequest) {
    return this.service.create(data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'expense' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user.id);
  }
}
