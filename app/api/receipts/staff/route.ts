import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext, isAuthContext } from "@/lib/authContext";
import { withTenant } from "@/lib/tenantDb";

// GET: 検索フィルタの「社員」選択肢用に、このテナントで実際にレシートを
// スキャンしたことがある担当者一覧を返す(重複除去)。
export async function GET(req: NextRequest) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;

  try {
    const receipts = await withTenant(auth.tenantId, (tx) =>
      tx.receipt.findMany({
        distinct: ["userId"],
        select: { userId: true, user: { select: { name: true, email: true } } },
      }),
    );
    const staff = receipts.map((r) => ({ id: r.userId, name: r.user.name ?? r.user.email }));
    return NextResponse.json({ staff });
  } catch (error) {
    console.error("receipts staff error:", error);
    return NextResponse.json({ error: "Failed to load staff list" }, { status: 500 });
  }
}
