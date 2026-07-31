import type { Metadata } from "next"; // 第62天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第62天：引入全局样式文件。

export const metadata: Metadata = { // 第75天：导出浏览器标签页与页面描述元数据。
  title: "Day 75 - Agent Platform Portfolio & Engineering Maturity | 智能体平台作品集与工程成熟度", // 第75天：设置浏览器标签页标题为最终作品集主题。
  description: "Day 75：以架构、ADR、演示、基准测试、安全审计和面试材料正式交付 Agent Platform v1.0.0。", // 第75天：设置页面描述为智能体平台最终工程闭环。
}; // 第62天：结束 metadata 定义。

export default function RootLayout({ // 第62天：定义 Next.js 根布局组件。
  children, // 第62天：接收页面子节点。
}: Readonly<{ // 第62天：定义只读参数类型。
  children: React.ReactNode; // 第62天：声明子节点类型为 React 节点。
}>) { // 第62天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第62天：返回无多余文本节点的 HTML 根结构。
} // 第62天：结束 RootLayout 组件。

