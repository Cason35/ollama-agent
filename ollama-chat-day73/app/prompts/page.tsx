import type { Metadata } from "next"; // 第67天：引入 Next.js 页面元数据类型。
import { PromptExplorerV2 } from "@/app/components/PromptExplorerV2"; // 第67天：引入生产级提示词运营控制台组件。

export const metadata: Metadata = { // 第71天：定义评估平台关联的提示词运营控制台浏览器标签页元数据。
  title: "Day 71 - Prompt Explorer V2 | 评估平台关联提示词治理", // 第71天：设置标签页标题为生产评估平台关联的提示词平台。
  description: "Day 71 继续保留 Day 67 Production Prompt Platform，并通过 Prompt Regression 与 Quality Gate V2 管理提示词晋级和发布。", // 第71天：说明生产评估平台完整继承并持续评估提示词运营能力。
}; // 第67天：结束提示词运营控制台元数据定义。

export default function PromptsPage() { // 第67天：定义 Prompt Explorer V2 页面入口组件。
  return <PromptExplorerV2 />; // 第67天：渲染生产级提示词运营控制台。
} // 第67天：结束 Prompt Explorer V2 页面入口组件。
