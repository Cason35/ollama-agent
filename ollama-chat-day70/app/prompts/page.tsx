import type { Metadata } from "next"; // 第67天：引入 Next.js 页面元数据类型。
import { PromptExplorerV2 } from "@/app/components/PromptExplorerV2"; // 第67天：引入生产级提示词运营控制台组件。

export const metadata: Metadata = { // 第70天：定义继承的提示词运营控制台浏览器标签页元数据。
  title: "Day 70 - Prompt Explorer V2 | 继承的生产提示词平台", // 第70天：设置标签页标题为第70天项目继承的生产提示词平台。
  description: "Day 70 继续保留 Day 67 Production Prompt Platform，用于统一管理提示词版本、块、策略、评分、实验、晋级、回滚、归档和审计。", // 第70天：说明持久化工作流项目完整继承提示词运营能力。
}; // 第67天：结束提示词运营控制台元数据定义。

export default function PromptsPage() { // 第67天：定义 Prompt Explorer V2 页面入口组件。
  return <PromptExplorerV2 />; // 第67天：渲染生产级提示词运营控制台。
} // 第67天：结束 Prompt Explorer V2 页面入口组件。
