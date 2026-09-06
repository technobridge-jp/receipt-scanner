// 営業デモ用データ投入。冪等（何度実行してもよい）。本番でも実行してよい
// （実データとは完全に隔離されたデモ専用テナントにのみ書き込む）。
//
// - デモ専用Tenant「デモ商事株式会社」を作成
// - デモ専用User(DEMO_LOGIN_EMAIL)をSTAFF権限で作成し、デモテナントのみに割当
//   (next-auth-config の demo-login はこのroleがSTAFFであることを都度検証するため、
//    誤ってADMINに変更されても昇格しない)
// - 見せ映え用のサンプルレシートを数件投入
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEMO_TENANT_ID = "demo";
const DEMO_TENANT_NAME = "デモ商事株式会社";
const DEMO_LOGIN_EMAIL = process.env.DEMO_LOGIN_EMAIL || "demo@example.com";

async function main() {
  const tenant = await db.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    update: {},
    create: { id: DEMO_TENANT_ID, name: DEMO_TENANT_NAME },
  });

  const demoUser = await db.user.upsert({
    where: { email: DEMO_LOGIN_EMAIL },
    update: { role: "STAFF" }, // 安全弁: 誤ってADMINになっていても毎回STAFFに戻す
    create: { email: DEMO_LOGIN_EMAIL, name: "デモユーザー", role: "STAFF" },
  });
  await db.userTenant.upsert({
    where: { userId_tenantId: { userId: demoUser.id, tenantId: tenant.id } },
    update: {},
    create: { userId: demoUser.id, tenantId: tenant.id },
  });

  // サンプルレシート（既存があれば入れ直さないようupsert）
  const samples = [
    {
      id: "demo-receipt-1",
      storeName: "○×商店",
      date: "2026-09-01",
      items: [{ name: "コピー用紙", category: "消耗品費", amount: 1200, taxRate: 10 }],
    },
    {
      id: "demo-receipt-2",
      storeName: "△△タクシー",
      date: "2026-09-03",
      items: [{ name: "タクシー代", category: "旅費交通費", amount: 2400, taxRate: 10 }],
    },
    {
      id: "demo-receipt-3",
      storeName: "喫茶△△",
      date: "2026-09-05",
      items: [{ name: "打合せ飲食代", category: "会議費", amount: 980, taxRate: 8 }],
    },
  ];

  // Receipt/ReceiptItemはRLS対象(FORCE ROW LEVEL SECURITY)のため、
  // app.current_tenant_id をセットしたトランザクション内で書き込む(lib/tenantDb.tsのwithTenantと同じ考え方)。
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;
    for (const s of samples) {
      const total = s.items.reduce((sum, i) => sum + i.amount, 0);
      await tx.receipt.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          tenantId: tenant.id,
          userId: demoUser.id,
          storeName: s.storeName,
          date: s.date,
          subtotal: total,
          tax8: s.items.filter(i => i.taxRate === 8).reduce((sum, i) => sum + i.amount, 0),
          tax10: s.items.filter(i => i.taxRate === 10).reduce((sum, i) => sum + i.amount, 0),
          total,
          paymentMethod: "現金",
          confidence: 0.95,
          warnings: [],
          items: {
            create: s.items.map(i => ({
              tenantId: tenant.id,
              name: i.name,
              quantity: 1,
              unitPrice: i.amount,
              amount: i.amount,
              taxRate: i.taxRate,
              confidence: 0.95,
              category: i.category,
              classification: "BUSINESS",
              splitRatio: 100,
            })),
          },
        },
      });
    }
  });

  console.log("seeded demo:", { tenant: tenant.name, demoUser: demoUser.email, receipts: samples.length });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
