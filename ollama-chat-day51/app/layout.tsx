import type { Metadata } from "next"; // 引入 Next.js 页面元数据类型。 
import "./globals.css"; // 引入全局样式。 
export const metadata: Metadata = { // 导出浏览器标签页与页面描述元数据。 
  title: "Day 51 - Model Fallback & Circuit Breaker | Advanced Optimization V4", // 第51天：设置浏览器标签页标题为模型降级备用与熔断器主题。
  description: "Day 51：Advanced Optimization V4（具备容错能力的多模型运行时），在 Model Router（模型路由器）基础上新增 fallback（备用模型链）、timeout（超时控制）、retry（重试）、Circuit Breaker（熔断器）、ModelExecutor（模型执行器）与 Model Health Dashboard（模型健康仪表盘）。", // 第51天：设置页面描述为本日模型容错核心能力。
}; // metadata 定义结束。 
export default function RootLayout({ // 定义 Next.js 根布局组件。 
  children, // 接收页面子节点。 
}: Readonly<{ // 定义只读参数类型。 
  children: React.ReactNode; // 子节点类型为 React 节点。 
}>) { // 参数类型结束。 
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 返回无空白文本节点的 HTML 根结构。 
} // RootLayout 组件结束。 
