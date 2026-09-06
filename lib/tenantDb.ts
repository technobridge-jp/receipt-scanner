import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

// テナント・スコープのデータアクセスは必ずこの層を通す（取りこぼし防止＋RLS連動）。
//
// - 同一トランザクション内で先に app.current_tenant_id を設定し、PostgreSQL の
//   Row-Level Security ポリシーと噛み合わせる（DB層でもテナント分離を強制）。
// - set_config(..., true)（=トランザクション・ローカル）なので、Supabase の
//   プール接続（Supavisor）でもコネクションをまたいで設定が残らない。
//
// 注意: 全社共通テーブル（Tenant / User / UserTenant）はテナント・スコープ対象外。
//       それらは withTenant を通さず直接アクセスしてよい（RLS も掛けない）。
export function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    // 値はパラメータ化されるため SQL インジェクションの心配はない。
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
