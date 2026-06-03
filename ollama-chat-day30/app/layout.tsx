import type { Metadata } from "next"; // 引入 Next.js 元数据类型
import "./globals.css"; // 引入全局样式

/** 第30天：浏览器标签页与页面描述。 */
export const metadata: Metadata = {
  title: "Day 30 - RAG Runtime V7 · Local Vector Store", // 标签页标题
  description: "RAG V7：Knowledge Store 与 Local Vector Store 分离，支持 Vector Metrics、Metadata Filter、Vector Explorer 与本地向量检索。", // 页面描述
}; // metadata 结束

/** 根布局组件。 */
export default function RootLayout({
  children, // 页面内容
}: Readonly<{
  children: React.ReactNode; // React 子节点
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  ); // 返回 HTML 骨架
} // RootLayout 结束
