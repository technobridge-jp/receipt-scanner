// レシートデータの共通型定義（フロントエンド・API両方から参照）

export type Classification = "business" | "personal" | "split";
export type ReceiptStatus = "unconfirmed" | "needs_review" | "confirmed";

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_rate: number;
  confidence: number;
  category: string;
  classification: Classification;
  split_ratio: number;
}

export interface Receipt {
  id: string;
  store_name: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  tax_8: number;
  tax_10: number;
  total: number;
  payment_method: string;
  confidence: number;
  warnings: string[];
  has_image?: boolean; // 元のレシート画像がSupabase Storageに保存されているか
  status?: ReceiptStatus; // 確認ステータス（未指定時はunconfirmed扱い）
  user_name?: string; // 検索結果でスキャンした担当者名を表示するために含める場合がある
}

// 勘定科目リスト
export const CATEGORIES = [
  "会議費", "交際費", "消耗品費", "新聞図書費", "旅費交通費",
  "通信費", "車両費", "荷造運賃", "支払手数料", "雑費", "家庭費", "不明"
];

export const STATUS_LABELS: Record<ReceiptStatus, string> = {
  unconfirmed: "未確認",
  needs_review: "要確認",
  confirmed: "確認済",
};

// 業務金額を計算（仕事:全額 / 家庭:0円 / 按分:split_ratio%）
export function businessAmount(item: ReceiptItem): number {
  const amount = typeof item.amount === "number" && !isNaN(item.amount) ? item.amount : 0;
  if (item.classification === "business") return amount;
  if (item.classification === "personal") return 0;
  return Math.round(amount * item.split_ratio / 100);
}
