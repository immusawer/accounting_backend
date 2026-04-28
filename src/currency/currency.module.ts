import { Module } from '@nestjs/common';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CurrencyController],
  providers: [CurrencyService, PrismaService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
