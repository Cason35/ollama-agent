import type { Metadata } from "next"; /* 第57天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第57天：引入完整提示词管理与动态优化工作台，作为 Day57 决策策略素材控制台。 */
export const metadata: Metadata = { /* 第57天：定义提示词策略控制台浏览器元数据。 */
  title: "Day 57 - Prompt Strategy Console | 提示词策略控制台", /* 第57天：设置提示词管理页面标签页标题。 */
  description: "Day 57 提示词策略控制台：保留 Prompt Version、PromptBlock、PromptOptimizer 和实验回填能力，为 Adaptive Runtime Decision Engine 提供可选择的 Prompt Strategy。", /* 第57天：设置提示词管理页面描述。 */
}; /* 第57天：结束提示词策略控制台元数据。 */
export default function PromptsPage() { /* 第57天：定义提示词策略控制台入口组件。 */
  return <PromptWorkbench />; /* 第57天：渲染完整提示词工作台。 */
} /* 第57天：结束提示词策略控制台入口组件。 */
