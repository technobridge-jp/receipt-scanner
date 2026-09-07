import "server-only";
import { createClient } from "@supabase/supabase-js";

// レシート画像の保存先(Supabase Storage, プライベートバケット)。
//
// 注意: Supabase StorageのオブジェクトキーはASCII以外(日本語など)を受け付けない
// (実測で確認済み。"Invalid key"エラーになる)。そのため:
//   - 実際の保存キーは {tenantId}/{YYYY-MM}/{receiptId}.{ext} という安全な形にする
//   - AXISの要望にある「日付_店舗名_金額_勘定科目」という人間可読なファイル名は、
//     ダウンロード時のファイル名(Content-Disposition)として自前で付与する
//     (Supabase側のcreateSignedUrlのdownloadオプションは日本語を二重エンコードして
//     しまい正しく表示できなかったため使わない。/api/receipts/[id]/image で
//     署名付きURLの中身を取得し、自分でヘッダーを付けて返す)
//   - 「月別/社員別/証憑種別/勘定科目別」の自動整理は、物理フォルダではなく
//     DB上のdate/userId/categoryから動的に導出する（勘定科目を後から直しても
//     フォルダ移動が要らず、複数の切り口で見られるという利点がある）
const BUCKET = "receipt-images";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function sanitizeSegment(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "").trim();
  return cleaned.slice(0, 50) || "不明";
}

export function extForMimeType(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

// 実際の保存キー(ASCIIのみ)
export function buildStorageKey(params: { tenantId: string; date: string; receiptId: string; ext: string }): string {
  const { tenantId, date, receiptId, ext } = params;
  const month = date.slice(0, 7); // YYYY-MM
  return `${tenantId}/${month}/${receiptId}.${ext}`;
}

// 人間可読な論理ファイル名(ダウンロード時に付与する。日本語を含んでよい)
export function buildDisplayFilename(params: {
  date: string; // YYYY-MM-DD
  storeName: string;
  total: number;
  category: string;
  ext: string;
}): string {
  const { date, storeName, total, category, ext } = params;
  const dateCompact = date.replace(/-/g, "");
  return `${dateCompact}_${sanitizeSegment(storeName)}_${total}円_${sanitizeSegment(category)}.${ext}`;
}

export async function uploadReceiptImage(key: string, data: Buffer, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(key, data, { contentType, upsert: true });
  if (error) {
    console.error("uploadReceiptImage error:", error);
    throw error;
  }
}

export async function deleteReceiptImage(key: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([key]);
  if (error) console.error("deleteReceiptImage error:", error);
}

// 短期間の署名付きURL(自分のサーバーからのみ使う。クライアントには絶対返さない)
export async function getSignedImageUrl(key: string, expiresInSeconds = 60): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, expiresInSeconds);
  if (error) {
    console.error("getSignedImageUrl error:", error);
    return null;
  }
  return data.signedUrl;
}
