import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。 
import "./globals.css"; // 引入全局样式。 
export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。 
  title: "Day 49 - Long-Term Memory V2 | Advanced Optimization V2", // 第49天：设置浏览器标签页标题为长期记忆运行时主题。
  description: "Day 49：Advanced Optimization V2，新增 MemoryItemV2、LongTermMemoryStore、Experience Extraction（经验提取）、Memory Consolidation（记忆整合）、Importance Decay（重要性衰减）、Memory Retrieval V2（综合打分检索）、Memory Explorer V2 与 Memory Metrics（记忆指标）。", // 第49天：设置页面描述为本日长期记忆核心能力。
}; // metadata 定义结束。 
export default function RootLayout({ // 定义 Next.js 根布局组件。 
  children, // 接收页面子节点。 
}: Readonly<{ // 定义只读参数类型。 
  children: React.ReactNode; // 子节点类型为 React 节点。 
}>) { // 参数类型结束。 
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 返回无空白文本节点的 HTML 根结构。 
} // RootLayout 组件结束。 
