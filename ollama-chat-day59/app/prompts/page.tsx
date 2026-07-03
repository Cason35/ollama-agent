import type { Metadata } from "next"; /* 第59天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第59天：引入完整提示词管理与动态优化工作台，作为 Distributed Queue 项目保留的策略控制台。 */
export const metadata: Metadata = { /* 第59天：定义提示词策略控制台浏览器元数据。 */
  title: "Day 59 - Prompt Strategy Console | 分布式队列提示词控制台", /* 第59天：设置提示词管理页面标签页标题。 */
  description: "Day 59 提示词策略控制台：在 Distributed Redis Queue 基础设施中继续保留 Prompt Version、PromptBlock、PromptOptimizer 和实验回填能力。", /* 第59天：设置提示词管理页面描述。 */
}; /* 第59天：结束提示词策略控制台元数据。 */
export default function PromptsPage() { /* 第59天：定义提示词策略控制台入口组件。 */
  return <PromptWorkbench />; /* 第59天：渲染完整提示词工作台。 */
} /* 第59天：结束提示词策略控制台入口组件。 */
