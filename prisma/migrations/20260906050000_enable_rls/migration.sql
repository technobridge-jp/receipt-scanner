-- テナント分離の堅牢化: tenantId を持つテーブル（Receipt / ReceiptItem）で Row-Level Security を強制する。
-- アプリは app.current_tenant_id（トランザクション・ローカル）を設定してからアクセスする（withTenant）。
-- 未設定時は current_setting(...,true)=NULL となり、どの行にも一致しない＝ゼロ件（deny / 安全側）。
-- Tenant / User / UserTenant は全社共通の制御テーブルなので意図的に RLS 対象外とする
-- （アクセスは必ず明示的な where 句で絞る。参照実装: securebase）。

ALTER TABLE "Receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Receipt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Receipt";
CREATE POLICY tenant_isolation ON "Receipt"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ReceiptItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReceiptItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReceiptItem";
CREATE POLICY tenant_isolation ON "ReceiptItem"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
