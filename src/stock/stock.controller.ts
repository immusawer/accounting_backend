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
import { StockService } from './stock.service';
import { CreateStockDto } from './dto/stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('stock')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @RequirePermission('inventory.view')
  @Get()
  findAll() {
    return this.stockService.findAll();
  }

  @RequirePermission('inventory.create')
  @AuditLog({ action: 'CREATE', module: 'stock' })
  @Post()
  create(@Body() data: CreateStockDto, @Req() req: AuthRequest) {
    return this.stockService.create(data, req.user.id);
  }

  @RequirePermission('inventory.update')
  @AuditLog({ action: 'UPDATE', module: 'stock' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<CreateStockDto>,
    @Req() req: AuthRequest,
  ) {
    return this.stockService.update(id, data, req.user.id);
  }

  @RequirePermission('inventory.change_status')
  @AuditLog({ action: 'UPDATE', module: 'stock' })
  @Patch(':id/review-status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: ReviewStatus },
    @Req() req: AuthRequest,
  ) {
    return this.stockService.updateStatus(id, body.status, req.user.id);
  }

  @RequirePermission('inventory.delete')
  @AuditLog({ action: 'DELETE', module: 'stock' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.stockService.remove(id, req.user.id);
  }
}
