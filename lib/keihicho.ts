// 弥生株式会社「経費帳」エクセルテンプレートへの自動転記
//
// テンプレートの設計上の制約: 1シート＝1勘定科目（D2セルに科目名を書き、
// 以降の行はすべて同じ科目の明細を並べる）。本アプリは品目ごとに異なる
// 勘定科目を自動判定するため、勘定科目ごとにシートを複製して転記する。
//
// テンプレート原本: templates/keihicho.xlsx（通常版）/ templates/keihicho_invoice.xlsx（インボイス制度対応版）
// 提供元: 弥生株式会社 https://www.yayoi-kk.co.jp/keihi/template/keihicho/

import ExcelJS from "exceljs";
import path from "path";
import { CATEGORIES, Receipt, businessAmount } from "./types";

export type KeihichoVariant = "standard" | "invoice";

const TEMPLATE_PATH: Record<KeihichoVariant, string> = {
  standard: path.join(process.cwd(), "templates", "keihicho.xlsx"),
  invoice: path.join(process.cwd(), "templates", "keihicho_invoice.xlsx"),
};

const SOURCE_SHEET_NAME: Record<KeihichoVariant, string> = {
  standard: "経費帳",
  invoice: "経費帳 (インボイス仕様)",
};

// 列番号(1-indexed)。両テンプレートとも A=月, B=日, C=相手科目, D=摘要 は共通。
const COLUMNS: Record<KeihichoVariant, { amount: number; total: number; reducedRate?: number; invoiceMark?: number }> = {
  standard: { amount: 5, total: 6 }, // E=金額, F=金額合計
  invoice: { amount: 7, total: 8, reducedRate: 5, invoiceMark: 6 }, // E=軽減税率, F=インボイス, G=金額, H=金額合計
};

const HEADER_ROWS = 5; // 1〜5行目がタイトル・科目名・見出し（この範囲のスタイル/結合をコピーする）
const DATA_START_ROW = 6;

// 支払方法 → 相手科目（貸方科目）マッピング。未対応の支払方法は空欄にして手入力を促す
const COUNTER_ACCOUNT_BY_PAYMENT_METHOD: Record<string, string> = {
  "現金": "現金",
  "クレジット": "未払金",
  "電子マネー": "電子マネー",
};

interface LedgerEntry {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  counterAccount: string;
  taxRate: number;
}

// 品目を勘定科目ごとにグルーピングし、日付昇順に並べる
function groupByCategory(receipts: Receipt[]): Map<string, LedgerEntry[]> {
  const grouped = new Map<string, LedgerEntry[]>();
  for (const receipt of receipts) {
    const counterAccount = COUNTER_ACCOUNT_BY_PAYMENT_METHOD[receipt.payment_method] ?? "";
    for (const item of receipt.items) {
      const amount = businessAmount(item);
      if (amount === 0) continue; // 家庭費按分・按分0円は経費帳に載せない
      const category = item.category || "不明";
      const entries = grouped.get(category) ?? [];
      entries.push({
        date: receipt.date,
        description: `${item.name}　${receipt.store_name || ""}`.trim(),
        amount,
        counterAccount,
        taxRate: item.tax_rate,
      });
      grouped.set(category, entries);
    }
  }
  for (const entries of grouped.values()) {
    entries.sort((a, b) => a.date.localeCompare(b.date));
  }
  // CATEGORIES の並び順を優先し、リストにない科目は末尾に追加
  const ordered = new Map<string, LedgerEntry[]>();
  for (const c of CATEGORIES) {
    if (grouped.has(c)) ordered.set(c, grouped.get(c)!);
  }
  for (const [c, entries] of grouped) {
    if (!ordered.has(c)) ordered.set(c, entries);
  }
  return ordered;
}

// Excelシート名に使えない文字を除去し、31文字に切り詰める
function sanitizeSheetName(name: string, usedNames: Set<string>): string {
  let sheetName = name.replace(/[\\/*?[\]:]/g, "").slice(0, 31) || "科目未設定";
  let suffix = 2;
  while (usedNames.has(sheetName)) {
    const base = name.slice(0, 31 - String(suffix).length - 1);
    sheetName = `${base}${suffix}`;
    suffix++;
  }
  usedNames.add(sheetName);
  return sheetName;
}

function columnLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// row範囲 top〜bottom がヘッダー範囲(1〜HEADER_ROWS)に収まる結合セルだけ複製する
function copyHeaderMerges(source: ExcelJS.Worksheet, dest: ExcelJS.Worksheet) {
  for (const range of source.model.merges ?? []) {
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) continue;
    const topRow = Number(m[2]);
    if (topRow <= HEADER_ROWS) dest.mergeCells(range);
  }
}

function copyRowStyle(source: ExcelJS.Row, dest: ExcelJS.Row, copyValue: boolean) {
  source.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const destCell = dest.getCell(colNumber);
    destCell.style = JSON.parse(JSON.stringify(cell.style));
    if (copyValue) destCell.value = cell.value;
  });
  dest.height = source.height;
}

export async function generateKeihichoWorkbook(receipts: Receipt[], variant: KeihichoVariant): Promise<Buffer> {
  const grouped = groupByCategory(receipts);
  if (grouped.size === 0) {
    throw new Error("出力対象の明細がありません（家庭費・按分0円のみ、または期間内にデータがありません）");
  }

  const templateWb = new ExcelJS.Workbook();
  await templateWb.xlsx.readFile(TEMPLATE_PATH[variant]);
  const sourceSheet = templateWb.getWorksheet(SOURCE_SHEET_NAME[variant]);
  if (!sourceSheet) {
    throw new Error(`テンプレートにシート「${SOURCE_SHEET_NAME[variant]}」が見つかりません`);
  }
  const totalRowStyleSource = sourceSheet.getRow(502);

  const cols = COLUMNS[variant];
  const outWb = new ExcelJS.Workbook();
  const usedSheetNames = new Set<string>();

  for (const [category, entries] of grouped) {
    const sheet = outWb.addWorksheet(sanitizeSheetName(category, usedSheetNames));

    // 列幅コピー
    sheet.columns = sourceSheet.columns.map(c => ({ width: (c as { width?: number }).width }));

    // ヘッダー行(1〜5)をスタイルごとコピー
    for (let r = 1; r <= HEADER_ROWS; r++) {
      copyRowStyle(sourceSheet.getRow(r), sheet.getRow(r), true);
    }
    copyHeaderMerges(sourceSheet, sheet);

    // 勘定科目名(D2)をセット
    sheet.getCell(2, 4).value = category;

    // データ行
    const dataRowStyleSource = sourceSheet.getRow(DATA_START_ROW);
    entries.forEach((entry, i) => {
      const rowNum = DATA_START_ROW + i;
      const row = sheet.getRow(rowNum);
      copyRowStyle(dataRowStyleSource, row, false);

      const [, monthStr, dayStr] = entry.date.match(/^\d+-(\d+)-(\d+)$/) ?? [];
      row.getCell(1).value = monthStr ? Number(monthStr) : entry.date;
      row.getCell(2).value = dayStr ? Number(dayStr) : "";
      row.getCell(3).value = entry.counterAccount;
      row.getCell(4).value = entry.description;
      if (cols.reducedRate) row.getCell(cols.reducedRate).value = entry.taxRate === 8 ? "〇" : "";
      // インボイス列: レシートから適格請求書番号の有無を判定できないため空欄（手動確認が必要）
      row.getCell(cols.amount).value = entry.amount;
      row.getCell(cols.total).value = { formula: `${columnLetter(cols.total)}${rowNum - 1}+${columnLetter(cols.amount)}${rowNum}` };
      row.commit();
    });

    // 合計行
    const totalRowNum = DATA_START_ROW + entries.length;
    const totalRow = sheet.getRow(totalRowNum);
    copyRowStyle(totalRowStyleSource, totalRow, false);
    totalRow.getCell(1).value = "合　　　計";
    sheet.mergeCells(totalRowNum, 1, totalRowNum, 4);
    const lastDataRow = totalRowNum - 1;
    totalRow.getCell(cols.amount).value = { formula: `SUM(${columnLetter(cols.amount)}${DATA_START_ROW}:${columnLetter(cols.amount)}${lastDataRow})` };
    totalRow.getCell(cols.total).value = { formula: `+${columnLetter(cols.amount)}${totalRowNum}` };
    totalRow.commit();

    sheet.pageSetup = { ...sourceSheet.pageSetup };
  }

  const buffer = await outWb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
