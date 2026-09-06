import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";

// ログインは Google アカウント認証のみ。
// 許可リスト制: User テーブルに存在するメールだけログインを許す（自己登録なし）。
// Google Drive を使わなくなったため drive.file スコープ・アクセストークンの
// リフレッシュ処理は廃止（openid email profile のみで十分）。

// テストログイン: 本番では絶対に有効化しない多重ガード
// （ENABLE_TEST_LOGIN=true かつ NODE_ENV!=='production' の両方が揃う場合のみ有効）。
// next build（Vercelの本番/プレビューとも）は常に NODE_ENV=production になるため、
// このプロバイダはデプロイ先には一切現れず、ローカルの `npm run dev` でのみ機能する。
const testLoginEnabled = process.env.ENABLE_TEST_LOGIN === "true" && process.env.NODE_ENV !== "production";
const TEST_LOGIN_EMAIL = "test-admin@example.com"; // prisma/seed.tsで作成する検証専用アカウント

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    ...(testLoginEnabled
      ? [
          CredentialsProvider({
            id: "test-login",
            name: "テストログイン",
            credentials: {},
            async authorize() {
              const user = await db.user.findUnique({ where: { email: TEST_LOGIN_EMAIL } });
              if (!user) return null;
              return { id: user.id, email: user.email, name: user.name, role: user.role };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    // 許可リスト: User テーブルに存在するメールだけログインを許す（Google/テストログイン共通）。
    async signIn({ user }) {
      const email = user?.email?.toLowerCase();
      if (!email) return false;
      const known = await db.user.findUnique({ where: { email }, select: { id: true } });
      return Boolean(known);
    },
    // サインイン時に DB から id と role を載せる（テナント解決に使う）。
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (email) {
        const u = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
        if (u) {
          token.id = u.id;
          token.role = u.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
