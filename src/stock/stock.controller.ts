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
import { StockService } from './stock.service';
import { CreateStockDto } from './dto/stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

interface AuthRequest extends Request {
  user: { id: number; email: string };
}

@Controller('stock')
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  findAll() {
    return this.stockService.findAll();
  }

  @AuditLog({ action: 'CREATE', module: 'stock' })
  @Post()
  create(@Body() data: CreateStockDto, @Req() req: AuthRequest) {
    return this.stockService.create(data, req.user.id);
  }

  @AuditLog({ action: 'DELETE', module: 'stock' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.stockService.remove(id, req.user.id);
  }
}
