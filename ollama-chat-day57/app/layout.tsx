import type { Metadata } from "next"; // 第57天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第57天：引入全局样式。
export const metadata: Metadata = { // 第57天：导出浏览器标签页与页面描述元数据。
  title: "Day 57 - Adaptive Runtime Decision Platform | 自适应运行时决策平台", // 第57天：设置浏览器标签页标题为自适应运行时决策主题。
  description: "Day 57：Adaptive Runtime Decision Engine，根据 RuntimeContext 自动选择 Prompt、Model、Collaboration、Cache、Retrieval 和 Memory 策略。", // 第57天：设置页面描述为本日运行时决策核心能力。
}; // 第57天：结束 metadata 定义。
export default function RootLayout({ // 第57天：定义 Next.js 根布局组件。
  children, // 第57天：接收页面子节点。
}: Readonly<{ // 第57天：定义只读参数类型。
  children: React.ReactNode; // 第57天：子节点类型为 React 节点。
}>) { // 第57天：结束参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第57天：返回无多余空白文本节点的 HTML 根结构。
} // 第57天：结束 RootLayout 组件。
