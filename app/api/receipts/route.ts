import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext, isAuthContext } from "@/lib/authContext";
import { withTenant } from "@/lib/tenantDb";
import { toApiReceipt, toReceiptCreateInput } from "@/lib/receiptDb";
import { Receipt } from "@/lib/types";
import { buildStorageKey, uploadReceiptImage, extForMimeType } from "@/lib/storage";

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
// image を渡すと、その画像をSupabase Storageへアップロードする。1枚の画像から複数レシートを
// 検出した場合も、レシートごとに(バイト列は同じまま)個別のオブジェクトとして保存し紐付ける
// （キー自体はASCIIのみ。人間可読なファイル名は閲覧/ダウンロード時に別途付与する）。
export async function POST(req: NextRequest) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;

  try {
    const { receipts, image } = (await req.json()) as {
      receipts?: Receipt[];
      image?: { data: string; mimeType: string };
    };
    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return NextResponse.json({ error: "receipts required" }, { status: 400 });
    }

    const imageBuffer = image?.data ? Buffer.from(image.data, "base64") : null;
    const ext = image?.mimeType ? extForMimeType(image.mimeType) : null;

    await withTenant(auth.tenantId, async (tx) => {
      for (const receipt of receipts) {
        let imagePath: string | null = null;
        if (imageBuffer && ext && image) {
          imagePath = buildStorageKey({ tenantId: auth.tenantId, date: receipt.date, receiptId: receipt.id, ext });
          await uploadReceiptImage(imagePath, imageBuffer, image.mimeType);
        }
        await tx.receipt.create({ data: toReceiptCreateInput(receipt, auth.tenantId, auth.userId, imagePath) });
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("receipts POST error:", error);
    return NextResponse.json({ error: "Failed to save receipts" }, { status: 500 });
  }
}
