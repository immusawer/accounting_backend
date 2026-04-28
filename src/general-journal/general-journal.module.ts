import { Module } from '@nestjs/common';
import { GeneralJournalController } from './general-journal.controller';
import { GeneralJournalService } from './general-journal.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [GeneralJournalController],
  providers: [GeneralJournalService, PrismaService],
})
export class GeneralJournalModule {}
