import type { Metadata } from "next"; /* 第56天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第56天：引入完整提示词管理与动态优化工作台，作为 Day56 的提示词兼容控制台。 */
export const metadata: Metadata = { /* 第56天：定义提示词兼容控制台浏览器元数据。 */
  title: "Day 56 - Prompt Compatibility Console | 提示词兼容控制台", /* 第56天：设置提示词管理页面标签页标题。 */
  description: "Day 56 提示词兼容控制台：保留 Prompt Version、PromptBlock、PromptOptimizer 和实验回填能力，为多模型协作运行时继续提供高质量提示词素材。", /* 第56天：设置提示词管理页面描述。 */
}; /* 第56天：结束提示词兼容控制台元数据。 */
export default function PromptsPage() { /* 第56天：定义提示词兼容控制台入口组件。 */
  return <PromptWorkbench />; /* 第56天：渲染完整提示词工作台。 */
} /* 第56天：结束提示词兼容控制台入口组件。 */
