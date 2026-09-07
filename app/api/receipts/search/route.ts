import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext, isAuthContext } from "@/lib/authContext";
import { withTenant } from "@/lib/tenantDb";
import { toApiReceipt, toDbStatus } from "@/lib/receiptDb";
import { ReceiptStatus } from "@/lib/types";
import type { Prisma } from "@prisma/client";

const MAX_RESULTS = 300;

// GET: 日付/金額/支払先/社員/勘定科目/ステータスで横断検索する
// クエリパラメータはすべて任意。指定されたものだけAND条件で絞り込む。
export async function GET(req: NextRequest) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from"); // YYYY-MM-DD
  const to = sp.get("to");
  const store = sp.get("store");
  const category = sp.get("category");
  const userId = sp.get("userId");
  const status = sp.get("status") as ReceiptStatus | null;
  const minAmount = sp.get("minAmount");
  const maxAmount = sp.get("maxAmount");

  const where: Prisma.ReceiptWhereInput = {};
  if (from || to) {
    where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }
  if (store) where.storeName = { contains: store, mode: "insensitive" };
  if (userId) where.userId = userId;
  if (status) where.status = toDbStatus(status);
  if (minAmount || maxAmount) {
    where.total = { ...(minAmount ? { gte: Number(minAmount) } : {}), ...(maxAmount ? { lte: Number(maxAmount) } : {}) };
  }
  if (category) where.items = { some: { category } };

  try {
    const receipts = await withTenant(auth.tenantId, (tx) =>
      tx.receipt.findMany({
        where,
        include: { items: true, user: { select: { name: true, email: true } } },
        orderBy: { date: "desc" },
        take: MAX_RESULTS,
      }),
    );
    return NextResponse.json({ receipts: receipts.map(toApiReceipt), truncated: receipts.length === MAX_RESULTS });
  } catch (error) {
    console.error("receipts search error:", error);
    return NextResponse.json({ error: "Failed to search receipts" }, { status: 500 });
  }
}
