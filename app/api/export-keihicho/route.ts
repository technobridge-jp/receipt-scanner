import { NextRequest, NextResponse } from "next/server";
import { generateKeihichoWorkbook, KeihichoVariant } from "@/lib/keihicho";
import { Receipt } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { receipts, variant } = await req.json() as { receipts?: Receipt[]; variant?: KeihichoVariant };
    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return NextResponse.json({ error: "receipts is required" }, { status: 400 });
    }
    const v: KeihichoVariant = variant === "invoice" ? "invoice" : "standard";

    const buffer = await generateKeihichoWorkbook(receipts, v);
    const filename = `経費帳_${v === "invoice" ? "インボイス仕様_" : ""}${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("keihicho export error:", error);
    const message = error instanceof Error ? error.message : "経費帳の生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
