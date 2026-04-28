import { Module, Global } from '@nestjs/common';
import { AccountingHelper } from './accounting.helper';

@Global()
@Module({
  providers: [AccountingHelper],
  exports: [AccountingHelper],
})
export class AccountingModule {}
