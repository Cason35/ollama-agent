import type { Metadata } from "next"; /* 第55天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第55天：引入完整提示词管理与动态优化工作台。 */
export const metadata: Metadata = { /* 第55天：定义动态提示词优化控制台浏览器元数据。 */
  title: "Day 55 - Dynamic Prompt Optimization Console | 动态提示词优化控制台", /* 第55天：设置提示词管理页面标签页标题。 */
  description: "Day 55 动态提示词优化控制台：维护 Prompt Version，并观察 PromptBlock、PromptOptimizer、Prompt Strategy、Recommendation、Block Metrics 和动态渲染预览。", /* 第55天：设置提示词管理页面描述。 */
}; /* 第55天：结束动态提示词优化控制台元数据。 */
export default function PromptsPage() { /* 第55天：定义动态提示词优化控制台入口组件。 */
  return <PromptWorkbench />; /* 第55天：渲染完整提示词工作台。 */
} /* 第55天：结束动态提示词优化控制台入口组件。 */
