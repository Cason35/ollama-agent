import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。
import "./globals.css"; // 引入全局样式。

export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。
  title: "Day 36 - Queue Runtime V6 | Cancellation + Timeout + Graceful Shutdown", // 设置第36天浏览器标签页标题。
  description: "Day 36：Queue Runtime V6，支持任务取消、超时包装器、协作式取消和 WorkerPool 优雅关闭。", // 设置第36天页面描述。
}; // metadata 定义结束。

export default function RootLayout({ // 定义 Next.js 根布局组件。
  children, // 接收页面子节点。
}: Readonly<{ // 定义只读参数类型。
  children: React.ReactNode; // 子节点类型为 React 节点。
}>) { // 参数类型结束。
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  ); // 结束返回。
} // RootLayout 组件结束。
