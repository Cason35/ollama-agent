import type { Metadata } from "next"; // 第62天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第62天：引入全局样式文件。

export const metadata: Metadata = { // 第72天：导出浏览器标签页与页面描述元数据。
  title: "Day 72 - Production Observability Platform | 生产可观测平台", // 第72天：设置浏览器标签页标题为贯穿智能体平台的生产可观测主题。
  description: "Day 72：Production Upgrade V9，通过统一日志、指标、分布式链路、错误追踪、告警、采样和仪表盘构建 Agent Observability Platform。", // 第72天：设置页面描述为从异常信号定位根因的完整生产可观测闭环。
}; // 第62天：结束 metadata 定义。

export default function RootLayout({ // 第62天：定义 Next.js 根布局组件。
  children, // 第62天：接收页面子节点。
}: Readonly<{ // 第62天：定义只读参数类型。
  children: React.ReactNode; // 第62天：声明子节点类型为 React 节点。
}>) { // 第62天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第62天：返回无多余文本节点的 HTML 根结构。
} // 第62天：结束 RootLayout 组件。

