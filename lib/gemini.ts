import { GoogleGenAI } from '@google/genai';

// GEMINI_BACKEND/GCP_SERVICE_ACCOUNT_KEY の評価をモジュール読み込み時ではなく
// 初回利用時まで遅延させる（ビルド時のページデータ収集で本番認証情報が
// パースされてビルドが落ちるのを避けるため）。
function createClient(): GoogleGenAI {
  const useVertex = process.env.GEMINI_BACKEND === 'vertex';
  if (useVertex) {
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? 'global',
      // 本番(Vercel)は ADC が使えないため SA鍵JSONを環境変数で渡す。ローカルは ADC なので未設定でよい。
      ...(process.env.GCP_SERVICE_ACCOUNT_KEY
        ? { googleAuthOptions: { credentials: JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY) } }
        : {}),
    });
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

let client: GoogleGenAI | undefined;

export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop, receiver) {
    if (!client) client = createClient();
    return Reflect.get(client, prop, receiver);
  },
});

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
