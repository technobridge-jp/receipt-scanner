import { defineConfig } from "prisma/config";

// Prisma 7: 接続URLは schema ではなくここで指定する(CLI用)。
// マイグレーション/db push は所有者ロールの直結URL(DIRECT_URL)を優先。generate には不要。
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
