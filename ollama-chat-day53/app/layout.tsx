import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。 
import "./globals.css"; // 引入全局样式。 
export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。 
  title: "Day 53 - Prompt Experiment Platform | 提示词实验平台", // 第53天：设置浏览器标签页标题为提示词实验平台主题。
  description: "Day 53：Prompt Experiment Platform（提示词实验平台），在 Prompt Registry 基础上比较多个 Prompt Version 的分数、成本、延迟和回归风险，并通过 Winner Selection、Quality Gate 与 Promote 选择可上线提示词。", // 第53天：设置页面描述为本日提示词实验核心能力。
}; // metadata 定义结束。 
export default function RootLayout({ // 定义 Next.js 根布局组件。 
  children, // 接收页面子节点。 
}: Readonly<{ // 定义只读参数类型。 
  children: React.ReactNode; // 子节点类型为 React 节点。 
}>) { // 参数类型结束。 
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 返回无空白文本节点的 HTML 根结构。 
} // RootLayout 组件结束。 
