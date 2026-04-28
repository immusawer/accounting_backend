import { Module } from '@nestjs/common';
import { TrialBalanceController } from './trial-balance.controller';
import { TrialBalanceService } from './trial-balance.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TrialBalanceController],
  providers: [TrialBalanceService, PrismaService],
})
export class TrialBalanceModule {}
