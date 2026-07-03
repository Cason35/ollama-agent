import type { Metadata } from "next"; // 第59天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第59天：引入全局样式。
export const metadata: Metadata = { // 第59天：导出浏览器标签页与页面描述元数据。
  title: "Day 59 - Distributed Redis Queue | 分布式 Redis 队列", // 第59天：设置浏览器标签页标题为分布式 Redis 队列主题。
  description: "Day 59：Production Infrastructure V2，基于 Redis List 构建 QueueStore、RedisQueueStore、ACK、Visibility Timeout、Queue Metrics 和 Queue Explorer。", // 第59天：设置页面描述为本日 Redis Queue 核心能力。
}; // 第59天：结束 metadata 定义。
export default function RootLayout({ // 第59天：定义 Next.js 根布局组件。
  children, // 第59天：接收页面子节点。
}: Readonly<{ // 第59天：定义只读参数类型。
  children: React.ReactNode; // 第59天：子节点类型为 React 节点。
}>) { // 第59天：结束参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第59天：返回无多余空白文本节点的 HTML 根结构。
} // 第59天：结束 RootLayout 组件。
