import type { Metadata } from "next"; // 第62天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第62天：引入全局样式文件。

export const metadata: Metadata = { // 第70天：导出浏览器标签页与页面描述元数据。
  title: "Day 70 - Durable Agent Workflow Platform | 持久化智能体工作流平台", // 第70天：设置浏览器标签页标题为持久化智能体工作流平台主题。
  description: "Day 70：Production Upgrade V7，通过版本化定义、执行实例、State Store V2、Checkpoint、Resume、Replay、Event Sourcing 与 Metrics 构建长期可靠执行平台。", // 第70天：设置页面描述为持久化工作流完整恢复与治理链路。
}; // 第62天：结束 metadata 定义。

export default function RootLayout({ // 第62天：定义 Next.js 根布局组件。
  children, // 第62天：接收页面子节点。
}: Readonly<{ // 第62天：定义只读参数类型。
  children: React.ReactNode; // 第62天：声明子节点类型为 React 节点。
}>) { // 第62天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第62天：返回无多余文本节点的 HTML 根结构。
} // 第62天：结束 RootLayout 组件。

