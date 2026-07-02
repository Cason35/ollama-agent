import type { Metadata } from "next"; // 第58天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第58天：引入全局样式。
export const metadata: Metadata = { // 第58天：导出浏览器标签页与页面描述元数据。
  title: "Day 58 - Redis Production Infrastructure | Redis 生产基础设施", // 第58天：设置浏览器标签页标题为 Redis 生产基础设施主题。
  description: "Day 58：Production Infrastructure V1，接入 RedisClient、RedisHealthCheck、RedisCacheStore、Redis Metrics 和 Redis Explorer。", // 第58天：设置页面描述为本日 Redis 集成核心能力。
}; // 第58天：结束 metadata 定义。
export default function RootLayout({ // 第58天：定义 Next.js 根布局组件。
  children, // 第58天：接收页面子节点。
}: Readonly<{ // 第58天：定义只读参数类型。
  children: React.ReactNode; // 第58天：子节点类型为 React 节点。
}>) { // 第58天：结束参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第58天：返回无多余空白文本节点的 HTML 根结构。
} // 第58天：结束 RootLayout 组件。
