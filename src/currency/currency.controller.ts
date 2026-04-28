import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLog } from '../audit-log/audit-log.interceptor';

@Controller('currencies')
@UseGuards(JwtAuthGuard)
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('base')
  getBase() {
    return this.service.getBaseCurrency();
  }

  @AuditLog({ action: 'CREATE', module: 'currency' })
  @Post()
  upsert(
    @Body()
    data: {
      code: string;
      name: string;
      symbol?: string;
      exchangeRate: number;
    },
  ) {
    return this.service.upsert(data);
  }

  @Post('seed')
  seed() {
    return this.service.seed();
  }

  @AuditLog({ action: 'UPDATE', module: 'currency' })
  @Patch(':code/base')
  setBase(@Param('code') code: string) {
    return this.service.setBaseCurrency(code);
  }

  @AuditLog({ action: 'UPDATE', module: 'currency' })
  @Patch(':code/rate')
  updateRate(
    @Param('code') code: string,
    @Body() body: { exchangeRate: number },
  ) {
    return this.service.updateRate(code, body.exchangeRate);
  }

  @AuditLog({ action: 'DELETE', module: 'currency' })
  @Delete(':code')
  remove(@Param('code') code: string) {
    return this.service.remove(code);
  }
}
