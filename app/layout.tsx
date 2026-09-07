import type { Metadata } from "next";
import "./globals.css";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import SessionProvider from "./components/SessionProvider";

export const metadata: Metadata = {
  title: "AXIS かんたん経費精算",
  description: "領収書を入れるだけ。AIが整理・入力・証憑管理までサポート。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 min-h-screen font-sans">
        <GoogleAnalytics />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
