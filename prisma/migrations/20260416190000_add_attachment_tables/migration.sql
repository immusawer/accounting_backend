-- CreateTable: expense_attachments
CREATE TABLE "expense_attachments" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(128),
    "expense_id" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_attachments_expense_id_idx" ON "expense_attachments"("expense_id");

ALTER TABLE "expense_attachments"
    ADD CONSTRAINT "expense_attachments_expense_id_fkey"
    FOREIGN KEY ("expense_id") REFERENCES "expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable: employee_attachments
CREATE TABLE "employee_attachments" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(128),
    "employee_id" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_attachments_employee_id_idx" ON "employee_attachments"("employee_id");

ALTER TABLE "employee_attachments"
    ADD CONSTRAINT "employee_attachments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable: payment_attachments
CREATE TABLE "payment_attachments" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(128),
    "payment_id" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_attachments_payment_id_idx" ON "payment_attachments"("payment_id");

ALTER TABLE "payment_attachments"
    ADD CONSTRAINT "payment_attachments_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
