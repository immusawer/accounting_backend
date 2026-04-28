import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GeneralLedgerService } from './general-ledger.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('general-ledger')
@UseGuards(JwtAuthGuard)
export class GeneralLedgerController {
  constructor(private readonly service: GeneralLedgerService) {}

  @Get()
  findAll(
    @Query('from_date') from_date?: string,
    @Query('to_date') to_date?: string,
    @Query('account_id') account_id?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({
      from_date,
      to_date,
      account_id: account_id ? Number(account_id) : undefined,
      search,
    });
  }
}
