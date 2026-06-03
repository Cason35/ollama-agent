import type { Metadata } from "next"; // Next.js 元数据类型
import "./globals.css"; // 全局样式

export const metadata: Metadata = {
  title: "Day 29 - RAG Runtime V6 · Knowledge Store + Incremental Indexing", // 浏览器标签页标题
  description:
    "RAG V6：Knowledge Store、Document Version、Content Hash、Chunk Hash、Incremental Indexer、Embedding Cache、Knowledge Explorer 与 Reindex Tool", // 页面描述
}; // 元数据配置结束

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode; // 页面内容
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
