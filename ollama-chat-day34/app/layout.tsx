import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。
import "./globals.css"; // 引入全局样式。

export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。
  title: "Day 34 - Queue Runtime V4 | Worker Pool", // 设置第34天浏览器标签页标题。
  description: "Day 34：Queue Runtime V4，支持 Concurrent Workers、Worker Pool、job lock、heartbeat、stale lock 与 Concurrency Metrics。", // 设置第34天页面描述。
}; // metadata 定义结束。

export default function RootLayout({ // 定义 Next.js 根布局组件。
  children, // 接收页面子节点。
}: Readonly<{ // 定义只读参数类型。
  children: React.ReactNode; // 子节点类型为 React 节点。
}>) { // 参数类型结束。
  return ( // 返回根 HTML 结构。
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning> {/* 设置中文语言、全高和水合警告抑制。 */}
      <body className="flex min-h-full flex-col font-sans">{children}</body> {/* 渲染页面主体内容。 */}
    </html> // 结束 HTML 根节点。
  ); // 结束返回。
} // RootLayout 组件结束。
