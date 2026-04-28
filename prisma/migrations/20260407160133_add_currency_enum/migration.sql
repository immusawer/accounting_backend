/*
  Warnings:

  - The `currency` column on the `general_journal` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "general_journal" DROP COLUMN "currency",
ADD COLUMN     "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';

-- DropEnum
DROP TYPE "GeneralJournalCurrency";
