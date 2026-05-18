import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "客戶通訊錄管理系統",
  description: "工業自動化客戶窗口維護系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 🧠 核心修正：加上 suppressHydrationWarning 阻斷瀏覽器外掛插件引起的報錯
    <html 
      lang="zh-TW" 
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-gray-900 text-gray-100">
        {children}
      </body>
    </html>
  );
}