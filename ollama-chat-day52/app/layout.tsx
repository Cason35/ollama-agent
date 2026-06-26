import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。 
import "./globals.css"; // 引入全局样式。 
export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。 
  title: "Day 52 - Prompt Versioning & Registry | Advanced Optimization V5", // 第52天：设置浏览器标签页标题为提示词版本管理与注册表主题。
  description: "Day 52：Advanced Optimization V5（提示词生命周期管理），在具备容错能力的多模型运行时基础上新增 Prompt Registry（提示词注册表）、Prompt Renderer（提示词渲染器）、Prompt Diff（提示词差异对比）、Prompt Rollback（提示词回滚）和 promptVersion（提示词版本）追踪。", // 第52天：设置页面描述为本日提示词生命周期核心能力。
}; // metadata 定义结束。 
export default function RootLayout({ // 定义 Next.js 根布局组件。 
  children, // 接收页面子节点。 
}: Readonly<{ // 定义只读参数类型。 
  children: React.ReactNode; // 子节点类型为 React 节点。 
}>) { // 参数类型结束。 
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 返回无空白文本节点的 HTML 根结构。 
} // RootLayout 组件结束。 
