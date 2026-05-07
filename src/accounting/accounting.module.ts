import { Module, Global } from '@nestjs/common';
import { AccountingHelper } from './accounting.helper';
import { ReviewWorkflowService } from './review-workflow.service';

@Global()
@Module({
  providers: [AccountingHelper, ReviewWorkflowService],
  exports: [AccountingHelper, ReviewWorkflowService],
})
export class AccountingModule {}
