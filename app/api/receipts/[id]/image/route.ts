import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext, isAuthContext } from "@/lib/authContext";
import { withTenant } from "@/lib/tenantDb";
import { getSignedImageUrl, buildDisplayFilename, extForMimeType } from "@/lib/storage";

// レシート画像の閲覧窓口。Supabase Storageのバケットは非公開なので、必ずここで
// ログイン＋テナント一致を確認してから中身を取得して返す。
// リダイレクトではなく自前でストリームを返すのは、ダウンロード時のファイル名
// （日付_店舗名_金額_勘定科目、日本語を含む）を正しく付与するため
// （Supabase側のcreateSignedUrlのdownloadオプションは日本語を正しく扱えなかった）。
// 経費帳ExcelのハイパーリンクもこのURL(自ドメイン)を指す。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(req);
  if (!isAuthContext(auth)) return auth;
  const { id } = await params;

  try {
    const receipt = await withTenant(auth.tenantId, (tx) =>
      tx.receipt.findUnique({
        where: { id },
        select: { imagePath: true, storeName: true, date: true, total: true, items: { select: { category: true }, take: 1 } },
      }),
    );
    if (!receipt?.imagePath) {
      return NextResponse.json({ error: "画像がありません" }, { status: 404 });
    }

    const signedUrl = await getSignedImageUrl(receipt.imagePath, 60);
    if (!signedUrl) return NextResponse.json({ error: "画像の取得に失敗しました" }, { status: 502 });

    const upstream = await fetch(signedUrl);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "画像の取得に失敗しました" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const ext = receipt.imagePath.split(".").pop() || extForMimeType(contentType);
    const filename = buildDisplayFilename({
      date: receipt.date,
      storeName: receipt.storeName ?? "不明",
      total: receipt.total ?? 0,
      category: receipt.items[0]?.category ?? "不明",
      ext,
    });
    const encoded = encodeURIComponent(filename);

    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        // 表示(プレビュー)にも使うのでinline。ダウンロードボタンでは元のファイル名(日本語可)が使われる。
        "Content-Disposition": `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("receipt image GET error:", error);
    return NextResponse.json({ error: "Failed to load image" }, { status: 500 });
  }
}
