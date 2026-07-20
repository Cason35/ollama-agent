import type { Metadata } from "next"; // 第62天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第62天：引入全局样式文件。

export const metadata: Metadata = { // 第71天：导出浏览器标签页与页面描述元数据。
  title: "Day 71 - Production Evaluation Platform V2 | 生产评估平台第2版", // 第71天：设置浏览器标签页标题为贯穿智能体生命周期的生产评估平台主题。
  description: "Day 71：Production Upgrade V8，通过 EvaluationRun、Dataset V2、多维评估、在线采样、反馈闭环、质量门禁与持续回归构建 Agent 质量控制平台。", // 第71天：设置页面描述为观察、评估、诊断、改进和验证的持续质量闭环。
}; // 第62天：结束 metadata 定义。

export default function RootLayout({ // 第62天：定义 Next.js 根布局组件。
  children, // 第62天：接收页面子节点。
}: Readonly<{ // 第62天：定义只读参数类型。
  children: React.ReactNode; // 第62天：声明子节点类型为 React 节点。
}>) { // 第62天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第62天：返回无多余文本节点的 HTML 根结构。
} // 第62天：结束 RootLayout 组件。

