import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TrialBalanceService } from './trial-balance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('trial-balance')
@UseGuards(JwtAuthGuard)
export class TrialBalanceController {
  constructor(private readonly service: TrialBalanceService) {}

  @Get()
  findAll(
    @Query('from_date') from_date?: string,
    @Query('to_date') to_date?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({ from_date, to_date, search });
  }
}
