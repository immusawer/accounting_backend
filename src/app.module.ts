// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { CustomerModule } from './customer/customer.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';
import { VendorModule } from './vendor/vendor.module';
import { TransactionsDataModule } from './transactions-data/transactions-data.module';
import { InvoiceModule } from './invoice/invoice.module';
import { PaymentModule } from './payment/payment.module';
import { ProductModule } from './product/product.module';
import { StockModule } from './stock/stock.module';
import { ExpenseModule } from './expense/expense.module';
import { ReportsModule } from './reports/reports.module';
import { CurrencyModule } from './currency/currency.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HrModule } from './hr/hr.module';
import { AccountingModule } from './accounting/accounting.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditLogInterceptor } from './audit-log/audit-log.interceptor';
import { GeneralJournalModule } from './general-journal/general-journal.module';
import { GeneralLedgerModule } from './general-ledger/general-ledger.module';
import { TrialBalanceModule } from './trial-balance/trial-balance.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccountingModule,
    AuditLogModule,
    UsersModule,
    AuthModule,
    CustomerModule,
    ChartOfAccountsModule,
    VendorModule,
    TransactionsDataModule,
    InvoiceModule,
    PaymentModule,
    ProductModule,
    StockModule,
    ExpenseModule,
    ReportsModule,
    CurrencyModule,
    DashboardModule,
    HrModule,
    GeneralJournalModule,
    GeneralLedgerModule,
    TrialBalanceModule,
    StorageModule,
    AttachmentsModule,
  ],
  providers: [
    // Register globally — only fires on handlers decorated with @AuditLog()
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
