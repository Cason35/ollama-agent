import type { Metadata } from "next"; /* 第61天：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第61天：引入完整提示词管理与动态优化工作台，作为 Object Storage 项目保留的策略控制台。 */
export const metadata: Metadata = { /* 第61天：定义提示词策略控制台浏览器元数据。 */
  title: "Day 61 - Prompt Strategy Console | 对象存储提示词控制台", /* 第61天：设置提示词管理页面标签页标题。 */
  description: "Day 61 提示词策略控制台：在 Object Storage 基础设施中继续保留 Prompt Version、PromptBlock、PromptOptimizer、实验回填和导出证据能力。", /* 第61天：设置提示词管理页面描述。 */
}; /* 第61天：结束提示词策略控制台元数据。 */
export default function PromptsPage() { /* 第61天：定义提示词策略控制台入口组件。 */
  return <PromptWorkbench />; /* 第61天：渲染完整提示词工作台。 */
} /* 第61天：结束提示词策略控制台入口组件。 */
