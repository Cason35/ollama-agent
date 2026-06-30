import type { Metadata } from "next"; // 第56天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第56天：引入全局样式。
export const metadata: Metadata = { // 第56天：导出浏览器标签页与页面描述元数据。
  title: "Day 56 - Multi-Model Collaboration Platform | 多模型协作平台", // 第56天：设置浏览器标签页标题为多模型协作平台主题。
  description: "Day 56：Multi-Model Collaboration Runtime，在 Model Router 基础上加入模型角色、协作计划、并行执行、结果合并、Trace/Usage 和协作浏览器。", // 第56天：设置页面描述为本日多模型协作核心能力。
}; // 第56天：结束 metadata 定义。
export default function RootLayout({ // 第56天：定义 Next.js 根布局组件。
  children, // 第56天：接收页面子节点。
}: Readonly<{ // 第56天：定义只读参数类型。
  children: React.ReactNode; // 第56天：子节点类型为 React 节点。
}>) { // 第56天：结束参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第56天：返回无多余空白文本节点的 HTML 根结构。
} // 第56天：结束 RootLayout 组件。
