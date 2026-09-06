import "server-only";
import { NextRequest } from "next/server";
import { db } from "./db";

// ログイン中スタッフが見ている「現在のテナント（テクノブリッジ自身、将来的には顧問先企業）」を解決する。
// アクセスモデル（最小権限）:
//   - ADMIN は全テナントへアクセス可。
//   - STAFF は UserTenant で割当られたテナントのみアクセス可。
// 選択中テナントは Cookie で保持するが、必ず「そのスタッフがアクセス可能か」を検証してから採用する。
// あらゆるクエリは必ずここで取得した tenantId でスコープすること（RLS と連動）。

export const TENANT_COOKIE = "rs_tenant";

export async function getAccessibleTenants(userId: string, role: string) {
  if (role === "ADMIN") {
    return db.tenant.findMany({ orderBy: { name: "asc" } });
  }
  const rows = await db.userTenant.findMany({
    where: { userId },
    include: { tenant: true },
    orderBy: { tenant: { name: "asc" } },
  });
  return rows.map((r) => r.tenant);
}

export async function canAccessTenant(userId: string, role: string, tenantId: string): Promise<boolean> {
  if (role === "ADMIN") {
    const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    return Boolean(t);
  }
  const a = await db.userTenant.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { tenantId: true },
  });
  return Boolean(a);
}

// req: Cookie の選択（アクセス可能な場合のみ）を、無ければアクセス可能な先頭テナントを返す。
// アクセス可能なテナントが無ければ null（先頭テナントへの無条件フォールバックはしない）。
export async function getCurrentTenantId(req: NextRequest, userId: string, role: string): Promise<string | null> {
  const selected = req.cookies.get(TENANT_COOKIE)?.value;
  if (selected && (await canAccessTenant(userId, role, selected))) return selected;

  const accessible = await getAccessibleTenants(userId, role);
  return accessible[0]?.id ?? null;
}
