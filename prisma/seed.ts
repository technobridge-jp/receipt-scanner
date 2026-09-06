// 初期データ投入。冪等（何度実行してもよい）。
// - Tenant「テクノブリッジ」を1件目のテナントとして登録
// - 実運用の管理者ユーザーをADMIN権限で登録
// - テストログイン用ユーザー（ENABLE_TEST_LOGIN=true時のみ使われる。本番では到達しない）
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TENANT_ID = "technobridge";
const TENANT_NAME = "テクノブリッジ";
const ADMIN_EMAIL = "keita2399@gmail.com";
const TEST_ADMIN_EMAIL = "test-admin@example.com";

async function main() {
  const tenant = await db.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: TENANT_NAME },
  });

  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: { email: ADMIN_EMAIL, role: "ADMIN" },
  });
  await db.userTenant.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
    update: {},
    create: { userId: admin.id, tenantId: tenant.id },
  });

  // テストログイン用（next-auth-config の CredentialsProvider から参照される）
  const testAdmin = await db.user.upsert({
    where: { email: TEST_ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: { email: TEST_ADMIN_EMAIL, name: "テスト管理者", role: "ADMIN" },
  });
  await db.userTenant.upsert({
    where: { userId_tenantId: { userId: testAdmin.id, tenantId: tenant.id } },
    update: {},
    create: { userId: testAdmin.id, tenantId: tenant.id },
  });

  console.log("seeded:", { tenant: tenant.name, admin: admin.email, testAdmin: testAdmin.email });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
