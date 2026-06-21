import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。 
import "./globals.css"; // 引入全局样式。 
export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。 
  title: "Day 47 - Usage & Cost Observability | Production Runtime V3", // 第47天：设置浏览器标签页标题为用量与成本可观测性主题。
  description: "Day 47：Production Runtime V3，新增 Token Accounting、Cost Tracking、Usage Explorer、Cost Breakdown 和 Prompt ROI Test。", // 第47天：设置页面描述为本日核心能力。
}; // metadata 定义结束。 
export default function RootLayout({ // 定义 Next.js 根布局组件。 
  children, // 接收页面子节点。 
}: Readonly<{ // 定义只读参数类型。 
  children: React.ReactNode; // 子节点类型为 React 节点。 
}>) { // 参数类型结束。 
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 返回无空白文本节点的 HTML 根结构。 
} // RootLayout 组件结束。 
