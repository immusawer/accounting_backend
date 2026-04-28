import { Module } from '@nestjs/common';
import { GeneralLedgerController } from './general-ledger.controller';
import { GeneralLedgerService } from './general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [GeneralLedgerController],
  providers: [GeneralLedgerService, PrismaService],
})
export class GeneralLedgerModule {}
