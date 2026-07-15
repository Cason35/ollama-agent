import type { Metadata } from "next"; // 第62天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第62天：引入全局样式文件。

export const metadata: Metadata = { // 第67天：导出浏览器标签页与页面描述元数据。
  title: "Day 67 - Production Prompt Platform | 生产级提示词平台", // 第67天：设置浏览器标签页标题为生产级提示词平台主题。
  description: "Day 67：Production Upgrade V4，通过 ProductionPrompt、PromptRuntimeService、PromptExperiment、PromptQualityScore、PromptPromotion 和 Prompt Explorer V2 把提示词升级为可运营平台资产。", // 第67天：设置页面描述为生产提示词治理完整链路。
}; // 第62天：结束 metadata 定义。

export default function RootLayout({ // 第62天：定义 Next.js 根布局组件。
  children, // 第62天：接收页面子节点。
}: Readonly<{ // 第62天：定义只读参数类型。
  children: React.ReactNode; // 第62天：声明子节点类型为 React 节点。
}>) { // 第62天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第62天：返回无多余文本节点的 HTML 根结构。
} // 第62天：结束 RootLayout 组件。

