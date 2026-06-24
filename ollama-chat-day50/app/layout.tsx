import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。 
import "./globals.css"; // 引入全局样式。 
export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。 
  title: "Day 50 - Model Router | Advanced Optimization V3", // 第50天：设置浏览器标签页标题为模型路由运行时主题。
  description: "Day 50：Advanced Optimization V3（多模型路由运行时），新增 ModelProfile（模型档案）、ModelRegistry（模型注册表）、ModelRoutingInput（模型路由输入）、ModelRouter（模型路由器）按任务选择模型，并接入 Agent Runtime、Tool Runtime 与 Usage（用量记录模型信息），同时提供 Model Explorer（模型浏览器）。", // 第50天：设置页面描述为本日模型路由核心能力。
}; // metadata 定义结束。 
export default function RootLayout({ // 定义 Next.js 根布局组件。 
  children, // 接收页面子节点。 
}: Readonly<{ // 定义只读参数类型。 
  children: React.ReactNode; // 子节点类型为 React 节点。 
}>) { // 参数类型结束。 
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 返回无空白文本节点的 HTML 根结构。 
} // RootLayout 组件结束。 
