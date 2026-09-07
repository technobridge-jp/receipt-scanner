import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext, isAuthContext } from "@/lib/authContext";
import { withTenant } from "@/lib/tenantDb";
import { toItemCreateInput, toDbStatus } from "@/lib/receiptDb";
import { Receipt } from "@/lib/types";
import { deleteReceiptImage } from "@/lib/storage";

// PUT: 1件のレシートを更新（品目は全入れ替え。分類・按分率の編集などで使う）
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;
  const { id } = await params;

  try {
    const receipt = (await req.json()) as Receipt;

    await withTenant(auth.tenantId, async (tx) => {
      await tx.receiptItem.deleteMany({ where: { receiptId: id } });
      await tx.receipt.update({
        where: { id },
        data: {
          storeName: receipt.store_name,
          date: receipt.date,
          subtotal: receipt.subtotal,
          tax8: receipt.tax_8,
          tax10: receipt.tax_10,
          total: receipt.total,
          paymentMethod: receipt.payment_method,
          confidence: receipt.confidence,
          warnings: receipt.warnings ?? [],
          ...(receipt.status ? { status: toDbStatus(receipt.status) } : {}),
          items: { create: receipt.items.map((item) => toItemCreateInput(item, auth.tenantId)) },
        },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("receipts PUT error:", error);
    return NextResponse.json({ error: "Failed to update receipt" }, { status: 500 });
  }
}

// DELETE: 1件のレシートを削除
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;
  const { id } = await params;

  try {
    const deleted = await withTenant(auth.tenantId, (tx) =>
      tx.receipt.delete({ where: { id }, select: { imagePath: true } }),
    );
    if (deleted.imagePath) await deleteReceiptImage(deleted.imagePath);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("receipts DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete receipt" }, { status: 500 });
  }
}
