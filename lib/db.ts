import { PrismaClient } from "@prisma/client";

// Prisma クライアントの singleton。
// サーバーレス（Vercel）では、ウォーム起動間で1インスタンスを使い回すことで
// コネクションの無駄な再確立を防ぐ。開発時のホットリロードでの多重生成も防ぐ。
//
// 接続は Supabase の transaction pooler（Supavisor）経由を前提とする。
// DATABASE_URL に `pgbouncer=true&connection_limit=1` を付けること。
// マイグレーション/シードは pooler を介さない DIRECT_URL（所有者ロール）を使用する。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = db;
