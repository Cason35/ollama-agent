import type { Metadata } from "next"; /* 第62天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第62天：引入完整提示词管理与动态优化工作台，作为 Object Storage 项目保留的策略控制台。 */
export const metadata: Metadata = { /* 第62天：定义提示词策略控制台浏览器元数据。 */
  title: "Day 63 - Prompt Strategy Console | 密钥管理提示词控制台", /* 第63天：设置提示词管理页面标签页标题。 */
  description: "Day 63 提示词策略控制台：在 Secrets Management 基础设施中继续保留 Prompt Version、PromptBlock、PromptOptimizer、实验回填和导出证据能力。", /* 第63天：设置提示词管理页面描述。 */
}; /* 第62天：结束提示词策略控制台元数据。 */
export default function PromptsPage() { /* 第62天：定义提示词策略控制台入口组件。 */
  return <PromptWorkbench />; /* 第62天：渲染完整提示词工作台。 */
} /* 第62天：结束提示词策略控制台入口组件。 */

