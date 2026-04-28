import { Module } from '@nestjs/common';
import { TransactionsDataController } from './transactions-data.controller';
import { TransactionsDataService } from './transactions-data.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TransactionsDataController],
  providers: [TransactionsDataService, PrismaService],
})
export class TransactionsDataModule {}
