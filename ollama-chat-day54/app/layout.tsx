import type { Metadata } from "next"; // 第54天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第54天：引入全局样式。
export const metadata: Metadata = { // 第54天：导出浏览器标签页与页面描述元数据。
  title: "Day 54 - Prompt Composition Platform | 提示词组合平台", // 第54天：设置浏览器标签页标题为提示词组合平台主题。
  description: "Day 54：Prompt Lifecycle V2 与 Prompt Composition，将 Prompt 从单个字符串升级为可组合、可排序、可启用/禁用、可条件跳过的 PromptBlock 系统。", // 第54天：设置页面描述为本日提示词组合核心能力。
}; // 第54天：结束 metadata 定义。
export default function RootLayout({ // 第54天：定义 Next.js 根布局组件。
  children, // 第54天：接收页面子节点。
}: Readonly<{ // 第54天：定义只读参数类型。
  children: React.ReactNode; // 第54天：子节点类型为 React 节点。
}>) { // 第54天：结束参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第54天：返回无多余空白文本节点的 HTML 根结构。
} // 第54天：结束 RootLayout 组件。
