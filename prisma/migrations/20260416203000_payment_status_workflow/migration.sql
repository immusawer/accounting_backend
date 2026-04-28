-- =====================================================================
-- 1. Drop the obsolete status column + enum from transactions_data.
--    Status is now tracked on Payment (PaymentStatus workflow) instead.
-- =====================================================================
ALTER TABLE "transactions_data" DROP COLUMN IF EXISTS "status";
DROP TYPE IF EXISTS "TransactionStatus";


-- =====================================================================
-- 2. Replace PaymentStatus enum values.
--    Old: PENDING, COMPLETED, FAILED, REFUNDED
--    New: PENDING, REVIEWED, APPROVED
--
--    Postgres can't redefine enum values in place while columns still use
--    the old type, so we rename → create new → migrate data → drop old.
--    Value mapping: PENDING stays PENDING; everything else lands on
--    PENDING so the user can manually re-review those records.
-- =====================================================================
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPROVED');

ALTER TABLE "Payment"
    ALTER COLUMN "status" DROP DEFAULT,
    ALTER COLUMN "status" TYPE "PaymentStatus"
        USING (
            CASE "status"::text
                WHEN 'PENDING' THEN 'PENDING'::"PaymentStatus"
                ELSE 'PENDING'::"PaymentStatus"
            END
        ),
    ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "PaymentStatus_old";
