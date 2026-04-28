import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('profit-loss')
  profitAndLoss(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.profitAndLoss(from, to);
  }

  @Get('balance-sheet')
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.service.balanceSheet(asOf);
  }

  @Get('cash-flow')
  cashFlow(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.cashFlow(from, to);
  }
}
