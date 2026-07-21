import type { Metadata } from "next"; // 第62天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第62天：引入全局样式文件。

export const metadata: Metadata = { // 第73天：导出浏览器标签页与页面描述元数据。
  title: "Day 73 - Agent Platform Governance & Production Readiness | 智能体平台治理与生产就绪", // 第73天：设置浏览器标签页标题为多租户智能体平台治理主题。
  description: "Day 73：Production Upgrade V10，通过身份、租户、RBAC、资源隔离、配额、接口网关和审计构建生产就绪的 Agent Platform。", // 第73天：设置页面描述为从单用户系统升级到多租户生产平台的治理闭环。
}; // 第62天：结束 metadata 定义。

export default function RootLayout({ // 第62天：定义 Next.js 根布局组件。
  children, // 第62天：接收页面子节点。
}: Readonly<{ // 第62天：定义只读参数类型。
  children: React.ReactNode; // 第62天：声明子节点类型为 React 节点。
}>) { // 第62天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第62天：返回无多余文本节点的 HTML 根结构。
} // 第62天：结束 RootLayout 组件。

