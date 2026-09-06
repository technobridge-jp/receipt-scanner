import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";

// ログインは Google アカウント認証のみ。
// 許可リスト制: User テーブルに存在するメールだけログインを許す（自己登録なし）。
// Google Drive を使わなくなったため drive.file スコープ・アクセストークンの
// リフレッシュ処理は廃止（openid email profile のみで十分）。
const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // 許可リスト: User テーブルに存在するメールだけログインを許す。
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
