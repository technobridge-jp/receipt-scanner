-- AXIS証憑管理機能: レシートの確認ステータス（未確認/要確認/確認済）を追加
CREATE TYPE "ReceiptStatus" AS ENUM ('UNCONFIRMED', 'NEEDS_REVIEW', 'CONFIRMED');
ALTER TABLE "Receipt" ADD COLUMN "status" "ReceiptStatus" NOT NULL DEFAULT 'UNCONFIRMED';
CREATE INDEX "Receipt_tenantId_status_idx" ON "Receipt"("tenantId", "status");
