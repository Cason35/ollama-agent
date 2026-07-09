import type { Metadata } from "next"; // 第61天：引入 Next.js 页面元数据类型。
import "./globals.css"; // 第61天：引入全局样式文件。

export const metadata: Metadata = { // 第61天：导出浏览器标签页与页面描述元数据。
  title: "Day 61 - Object Storage | 对象存储", // 第61天：设置浏览器标签页标题为对象存储主题。
  description: "Day 61：Production Infrastructure V4，基于 StorageProvider、MinIOStorageProvider、Storage Explorer、Knowledge 上传、Workspace Export 和 Trace Attachment 构建对象存储能力。", // 第61天：设置页面描述为对象存储核心能力。
}; // 第61天：结束 metadata 定义。

export default function RootLayout({ // 第61天：定义 Next.js 根布局组件。
  children, // 第61天：接收页面子节点。
}: Readonly<{ // 第61天：定义只读参数类型。
  children: React.ReactNode; // 第61天：声明子节点类型为 React 节点。
}>) { // 第61天：结束组件参数类型定义。
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning><body className="flex min-h-full flex-col font-sans">{children}</body></html>; // 第61天：返回无多余文本节点的 HTML 根结构。
} // 第61天：结束 RootLayout 组件。
