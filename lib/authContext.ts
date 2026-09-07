import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getCurrentTenantId } from "./tenant";

export interface AuthContext {
  userId: string;
  userName: string;
  role: string;
  tenantId: string;
}

// APIルートの先頭で呼ぶ共通ガード。未ログイン／アクセス可能テナント無しの場合は
// NextResponse（そのまま return する用）を返す。呼び出し側は isAuthContext() で判定する。
export async function requireAuthContext(req: NextRequest): Promise<AuthContext | NextResponse> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = token.id as string;
  const userName = (token.name as string | undefined) || (token.email as string | undefined) || "不明";
  const role = token.role as string;
  const tenantId = await getCurrentTenantId(req, userId, role);
  if (!tenantId) return NextResponse.json({ error: "アクセス可能なテナントが見つかりません" }, { status: 403 });

  return { userId, userName, role, tenantId };
}

export function isAuthContext(value: AuthContext | NextResponse): value is AuthContext {
  return !(value instanceof NextResponse);
}
