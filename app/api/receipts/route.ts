import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext, isAuthContext } from "@/lib/authContext";
import { withTenant } from "@/lib/tenantDb";
import { toApiReceipt, toReceiptCreateInput } from "@/lib/receiptDb";
import { Receipt } from "@/lib/types";

// GET: 指定月(YYYY-MM)のレシートを取得（現在のテナントにスコープ）
export async function GET(req: NextRequest) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;

  const month = req.nextUrl.searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

  try {
    const receipts = await withTenant(auth.tenantId, (tx) =>
      tx.receipt.findMany({
        where: { date: { startsWith: month } },
        include: { items: true },
        orderBy: { date: "asc" },
      }),
    );
    return NextResponse.json({ receipts: receipts.map(toApiReceipt) });
  } catch (error) {
    console.error("receipts GET error:", error);
    return NextResponse.json({ error: "Failed to read receipts" }, { status: 500 });
  }
}

// POST: 新規レシートを追加（既存分の上書きはしない。IDはクライアント発行のものをそのまま使う）
export async function POST(req: NextRequest) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;

  try {
    const { receipts } = (await req.json()) as { receipts?: Receipt[] };
    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return NextResponse.json({ error: "receipts required" }, { status: 400 });
    }

    await withTenant(auth.tenantId, async (tx) => {
      for (const receipt of receipts) {
        await tx.receipt.create({ data: toReceiptCreateInput(receipt, auth.tenantId, auth.userId) });
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("receipts POST error:", error);
    return NextResponse.json({ error: "Failed to save receipts" }, { status: 500 });
  }
}
