import type { Metadata } from "next"; /* 第54天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第54天：引入完整提示词管理与组合工作台。 */
export const metadata: Metadata = { /* 第54天：定义提示词组合控制台浏览器元数据。 */
  title: "Day 54 - Prompt Composition Console | 提示词组合控制台", /* 第54天：设置提示词管理页面标签页标题。 */
  description: "Day 54 提示词组合控制台：维护 Prompt Version，并观察 PromptBlock、PromptBuilder、变量校验、Prompt Diff、Block Metrics 和渲染预览。", /* 第54天：设置提示词管理页面描述。 */
}; /* 第54天：结束提示词组合控制台元数据。 */
export default function PromptsPage() { /* 第54天：定义提示词组合控制台入口组件。 */
  return <PromptWorkbench />; /* 第54天：渲染完整提示词工作台。 */
} /* 第54天：结束提示词组合控制台入口组件。 */
