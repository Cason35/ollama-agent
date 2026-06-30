import type { Metadata } from "next"; // 第55天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第55天：引入全局样式。
export const metadata: Metadata = { // 第55天：导出浏览器标签页与页面描述元数据。
  title: "Day 55 - Dynamic Prompt Optimization Platform | 动态提示词优化平台", // 第55天：设置浏览器标签页标题为动态提示词优化平台主题。
  description: "Day 55：Dynamic Prompt Optimization，在 PromptBlock 与 PromptBuilder 基础上加入上下文分析、规则、权重、推荐、评估反馈和策略浏览器。", // 第55天：设置页面描述为本日动态提示词优化核心能力。
}; // 第55天：结束 metadata 定义。
export default function RootLayout({ // 第55天：定义 Next.js 根布局组件。
  children, // 第55天：接收页面子节点。
}: Readonly<{ // 第55天：定义只读参数类型。
  children: React.ReactNode; // 第55天：子节点类型为 React 节点。
}>) { // 第55天：结束参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第55天：返回无多余空白文本节点的 HTML 根结构。
} // 第55天：结束 RootLayout 组件。
