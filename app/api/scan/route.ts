import { NextRequest } from "next/server";
import { logUsage } from "@/lib/logUsage";
import { ai, GEMINI_MODEL } from "@/lib/gemini";

export const maxDuration = 120;

const SYSTEM_PROMPT = `あなたはレシート読み取りの専門AIです。画像またはPDFに含まれる全てのレシートを個別に識別して読み取り、以下のJSON配列形式で出力してください。

## 重要：複数レシートの処理
- 1枚の画像/PDFに複数のレシートが含まれている場合は、それぞれを個別のオブジェクトとして配列に含める
- レシートが1枚だけの場合も必ず配列で返す（要素が1つの配列）
- PDFの場合は全ページを走査して全レシートを抽出する

## 出力形式（必ずこのJSON配列形式で）
[
  {
    "store_name": "店舗名",
    "date": "YYYY-MM-DD",
    "items": [
      {
        "name": "商品名",
        "quantity": 1,
        "unit_price": 100,
        "amount": 100,
        "tax_rate": 10,
        "confidence": 0.95,
        "category": "勘定科目"
      }
    ],
    "subtotal": 1000,
    "tax_8": 0,
    "tax_10": 100,
    "total": 1100,
    "payment_method": "現金 or クレジット or 電子マネー or 不明",
    "confidence": 0.92,
    "warnings": ["信頼度が低い箇所の説明"]
  }
]

## 勘定科目の判定ルール（各明細itemごとに設定）
- 食料品・飲食 → "会議費" (業務用1人) or "交際費" (2人以上) or "食料品費" (家庭用)
- 文房具・オフィス用品 → "消耗品費"
- 書籍・技術書 → "新聞図書費"
- 交通費（タクシー・電車・バス）→ "旅費交通費"
- 通信費（電話・インターネット）→ "通信費"
- ガソリン・駐車場 → "車両費"
- 宅配・郵便 → "荷造運賃"
- ソフトウェア・サブスク → "支払手数料"
- 日用品・生活雑貨 → "消耗品費"
- その他業務関連 → "雑費"
- 明らかに家庭用 → "家庭費"
- 判定できない場合 → "不明"

## 注意事項
- 金額は必ず数値（整数）で出力
- 読み取れない文字がある場合、confidenceを下げてwarningsに記載
- 軽減税率（8%）と標準税率（10%）を区別（※マークは軽減税率8%）
- JSON以外の文字は一切出力しないこと

## 最重要ルール: 推測禁止
- 画像から読み取れた文字だけを使うこと。推測・補完は絶対にしない
- 読み取れない場合は "不明" とする`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && process.env.GEMINI_BACKEND !== 'vertex') {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500 });
  }

  try {
    const { image, mimeType } = await req.json();

    if (!image || !mimeType) {
      return new Response(JSON.stringify({ error: "image and mimeType are required" }), { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inlineData: {
                mimeType: mimeType,
                data: image,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) {
      console.error("Gemini returned empty response");
      return new Response(JSON.stringify({ error: "AI returned empty response" }), { status: 502 });
    }

    logUsage({
      project: "receipt-scanner",
      model: GEMINI_MODEL,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    });

    const receipts = JSON.parse(text);
    const receiptsArray = Array.isArray(receipts) ? receipts : [receipts];
    return new Response(JSON.stringify({ receipts: receiptsArray }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Scan error:", error);
    return new Response(JSON.stringify({ error: "Failed to process receipt", detail: String(error) }), { status: 500 });
  }
}
