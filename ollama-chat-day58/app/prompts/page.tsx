import type { Metadata } from "next"; /* 第58天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第58天：引入完整提示词管理与动态优化工作台，作为 Redis 生产基础设施保留的策略控制台。 */
export const metadata: Metadata = { /* 第58天：定义提示词策略控制台浏览器元数据。 */
  title: "Day 58 - Prompt Strategy Console | Redis 基础设施提示词控制台", /* 第58天：设置提示词管理页面标签页标题。 */
  description: "Day 58 提示词策略控制台：在 Redis Production Infrastructure 中继续保留 Prompt Version、PromptBlock、PromptOptimizer 和实验回填能力。", /* 第58天：设置提示词管理页面描述。 */
}; /* 第58天：结束提示词策略控制台元数据。 */
export default function PromptsPage() { /* 第58天：定义提示词策略控制台入口组件。 */
  return <PromptWorkbench />; /* 第58天：渲染完整提示词工作台。 */
} /* 第58天：结束提示词策略控制台入口组件。 */
