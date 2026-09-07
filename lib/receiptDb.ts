import "server-only";
import type { Prisma, Classification as DbClassification } from "@prisma/client";
import { Classification, Receipt, ReceiptItem } from "./types";

// DB(Prisma、camelCase・enum大文字)⇔ アプリ(snake_case、AIのOCR出力形式)の変換層。
// フロントエンド(app/components/ExpenseScanner.tsx)の型・表示ロジックは変更せずに
// 保存先だけGoogle DriveからこのDBへ差し替えられるようにするための橋渡し。

type PrismaReceiptWithItems = Prisma.ReceiptGetPayload<{ include: { items: true } }>;
type PrismaReceiptItem = PrismaReceiptWithItems["items"][number];

export function toApiReceipt(r: PrismaReceiptWithItems): Receipt {
  return {
    id: r.id,
    store_name: r.storeName ?? "",
    date: r.date,
    items: r.items.map(toApiItem),
    subtotal: r.subtotal ?? 0,
    tax_8: r.tax8 ?? 0,
    tax_10: r.tax10 ?? 0,
    total: r.total ?? 0,
    payment_method: r.paymentMethod ?? "",
    confidence: r.confidence ?? 0,
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
    has_image: Boolean(r.imagePath),
  };
}

function toApiItem(i: PrismaReceiptItem): ReceiptItem {
  return {
    name: i.name,
    quantity: i.quantity ?? 0,
    unit_price: i.unitPrice ?? 0,
    amount: i.amount ?? 0,
    tax_rate: i.taxRate ?? 0,
    confidence: i.confidence ?? 0,
    category: i.category ?? "不明",
    classification: i.classification.toLowerCase() as Classification,
    split_ratio: i.splitRatio,
  };
}

function toDbClassification(c: Classification): DbClassification {
  return c.toUpperCase() as DbClassification;
}

// Receipt作成用のネストしたcreate入力(tenantId/userIdは呼び出し側で付与)を組み立てる
export function toItemCreateInput(item: ReceiptItem, tenantId: string) {
  return {
    tenantId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    amount: item.amount,
    taxRate: item.tax_rate,
    confidence: item.confidence,
    category: item.category,
    classification: toDbClassification(item.classification),
    splitRatio: item.split_ratio,
  };
}

export function toReceiptCreateInput(receipt: Receipt, tenantId: string, userId: string, imagePath?: string | null) {
  return {
    id: receipt.id,
    tenantId,
    userId,
    storeName: receipt.store_name,
    date: receipt.date,
    subtotal: receipt.subtotal,
    tax8: receipt.tax_8,
    tax10: receipt.tax_10,
    total: receipt.total,
    paymentMethod: receipt.payment_method,
    confidence: receipt.confidence,
    warnings: receipt.warnings ?? [],
    imagePath: imagePath ?? null,
    items: { create: receipt.items.map((item) => toItemCreateInput(item, tenantId)) },
  };
}

// レシートの品目から証憑ファイル名用の「主要勘定科目」を決める
// (複数科目にまたがる場合は先頭の品目の科目を使う)。
export function primaryCategory(receipt: Receipt): string {
  return receipt.items[0]?.category || "不明";
}
