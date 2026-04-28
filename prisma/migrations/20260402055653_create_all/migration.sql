-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'deactive');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('main', 'sub1', 'sub2', 'sub3');

-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'reviewed');

-- CreateEnum
CREATE TYPE "InvoiceTransactionStatus" AS ENUM ('reverted', 'pending_revert');

-- CreateEnum
CREATE TYPE "GeneralJournalCurrency" AS ENUM ('USD', 'AED', 'OMR', 'GEL', 'CAD', 'AFN');

-- CreateEnum
CREATE TYPE "StockType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "SalaryPaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "user_email" VARCHAR(128),
    "user_name" VARCHAR(128),
    "action" VARCHAR(20) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "record_id" INTEGER,
    "summary" VARCHAR(500),
    "old_data" JSONB,
    "new_data" JSONB,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_setting" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(10),
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" VARCHAR(500) NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "first_name" VARCHAR(64),
    "last_name" VARCHAR(64),
    "email" VARCHAR(64) NOT NULL,
    "password" VARCHAR(128) NOT NULL,
    "profile_image" VARCHAR(512),
    "role_id" INTEGER,
    "status" "user_status" NOT NULL DEFAULT 'deactive',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "updated_by" INTEGER,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "label" VARCHAR(255),
    "group_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" INTEGER,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxNumber" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "city" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" TEXT,
    "supplier" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "StockType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reference" TEXT,
    "debitAccountId" INTEGER NOT NULL,
    "creditAccountId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "departmentId" INTEGER,
    "baseSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "hireDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "taxId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_payment" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "allowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SalaryPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidDate" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "debitAccountId" INTEGER NOT NULL,
    "creditAccountId" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "salary_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "vendor" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reference" TEXT,
    "debitAccountId" INTEGER NOT NULL,
    "creditAccountId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" SERIAL NOT NULL,
    "account_name" TEXT NOT NULL,
    "isVendor" BOOLEAN NOT NULL DEFAULT false,
    "code" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "category" "AccountCategory",
    "parent_id" INTEGER,
    "company_id" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "updated_by" INTEGER,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_journal" (
    "id" SERIAL NOT NULL,
    "journal_number" TEXT NOT NULL,
    "journal_date" TIMESTAMPTZ(6) NOT NULL,
    "currency" "GeneralJournalCurrency" NOT NULL DEFAULT 'USD',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "remark" VARCHAR(500),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" INTEGER,

    CONSTRAINT "general_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_type" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "last_voucher_number" VARCHAR(255),
    "remark" VARCHAR(500),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "updated_by" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" INTEGER,

    CONSTRAINT "voucher_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions_data" (
    "id" SERIAL NOT NULL,
    "voucher_date" TIMESTAMPTZ(6) NOT NULL,
    "voucher_id" INTEGER,
    "voucher_number" VARCHAR(255),
    "system_ref" VARCHAR(255),
    "company_id" INTEGER,
    "cpt_id" INTEGER,
    "from" VARCHAR(255),
    "to" VARCHAR(255),
    "from_location_id" INTEGER,
    "to_location_id" INTEGER,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "revert_status" "InvoiceTransactionStatus",
    "account_id" INTEGER NOT NULL,
    "general_journal_id" INTEGER,
    "base_currency_credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "base_currency_debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "narration" VARCHAR(255),
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" INTEGER,
    "updated_at" TIMESTAMP(3),
    "updated_by" INTEGER,

    CONSTRAINT "transactions_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserPermissions" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserPermissions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PermissionsRoles" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PermissionsRoles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_module_idx" ON "audit_log"("module");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "currency_setting_code_key" ON "currency_setting"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_setting_key_key" ON "app_setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_created_by_idx" ON "user"("created_by");

-- CreateIndex
CREATE INDEX "user_updated_by_idx" ON "user"("updated_by");

-- CreateIndex
CREATE INDEX "user_role_id_idx" ON "user"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_group_name_key" ON "permissions"("name", "group_name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "department_name_key" ON "department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_email_key" ON "employee"("email");

-- CreateIndex
CREATE INDEX "employee_departmentId_idx" ON "employee"("departmentId");

-- CreateIndex
CREATE INDEX "salary_payment_employeeId_idx" ON "salary_payment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payment_employeeId_period_key" ON "salary_payment"("employeeId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_of_accounts_parent_id_idx" ON "chart_of_accounts"("parent_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_company_id_idx" ON "chart_of_accounts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "general_journal_journal_number_key" ON "general_journal"("journal_number");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_type_code_key" ON "voucher_type"("code");

-- CreateIndex
CREATE INDEX "transactions_data_account_id_idx" ON "transactions_data"("account_id");

-- CreateIndex
CREATE INDEX "transactions_data_general_journal_id_idx" ON "transactions_data"("general_journal_id");

-- CreateIndex
CREATE INDEX "transactions_data_voucher_id_idx" ON "transactions_data"("voucher_id");

-- CreateIndex
CREATE INDEX "_UserPermissions_B_index" ON "_UserPermissions"("B");

-- CreateIndex
CREATE INDEX "_PermissionsRoles_B_index" ON "_PermissionsRoles"("B");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payment" ADD CONSTRAINT "salary_payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions_data" ADD CONSTRAINT "transactions_data_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "voucher_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions_data" ADD CONSTRAINT "transactions_data_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions_data" ADD CONSTRAINT "transactions_data_general_journal_id_fkey" FOREIGN KEY ("general_journal_id") REFERENCES "general_journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserPermissions" ADD CONSTRAINT "_UserPermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserPermissions" ADD CONSTRAINT "_UserPermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionsRoles" ADD CONSTRAINT "_PermissionsRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionsRoles" ADD CONSTRAINT "_PermissionsRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
