import type { Metadata } from "next"; // 第60天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第60天：引入全局样式文件。

export const metadata: Metadata = { // 第60天：导出浏览器标签页与页面描述元数据。
  title: "Day 60 - Redis Distributed Lock | Redis 分布式锁", // 第60天：设置浏览器标签页标题为 Redis 分布式锁主题。
  description: "Day 60：Production Infrastructure V3，基于 Redis SET NX PX 构建 LockProvider、RedisLockProvider、Lock Renewal、Lock Metrics 和 Lock Explorer。", // 第60天：设置页面描述为分布式锁核心能力。
}; // 第60天：结束 metadata 定义。

export default function RootLayout({ // 第60天：定义 Next.js 根布局组件。
  children, // 第60天：接收页面子节点。
}: Readonly<{ // 第60天：定义只读参数类型。
  children: React.ReactNode; // 第60天：声明子节点类型为 React 节点。
}>) { // 第60天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第60天：返回无多余文本节点的 HTML 根结构。
} // 第60天：结束 RootLayout 组件。
