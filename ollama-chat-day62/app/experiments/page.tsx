import type { Metadata } from "next"; /* 第62天：引入 Next.js 页面元数据类型。 */
import { PromptExperimentDashboard } from "@/app/components/PromptExperimentDashboard"; /* 第62天：引入提示词实验仪表盘组件，保留实验能力作为 Object Storage 项目的质量证据。 */
export const metadata: Metadata = { /* 第62天：定义提示词实验策略专页浏览器元数据。 */
  title: "Day 62 - Prompt Strategy Experiment | 对象存储提示词实验", /* 第62天：设置浏览器标签页标题为 Day62 提示词实验视图。 */
  description: "Day 62：在 Object Storage 基础设施中继续保留 Prompt Experiment Dashboard，用于对照不同 Prompt Strategy 的质量、成本和导出证据。", /* 第62天：设置页面描述为对象存储项目中的实验视图。 */
}; /* 第62天：结束提示词实验策略专页元数据。 */
export default function ExperimentsPage() { /* 第62天：定义提示词实验策略专页入口组件。 */
  return ( /* 第62天：返回实验策略专页布局。 */
    <main className="h-screen overflow-hidden bg-zinc-50 px-4 py-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"> {/* 第62天：定义固定视口页面主容器。 */}
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"> {/* 第62天：定义可内部滚动的实验工作区。 */}
        <PromptExperimentDashboard /> {/* 第62天：渲染完整提示词实验仪表盘。 */}
      </div> {/* 第62天：结束居中实验工作区。 */}
    </main> /* 第62天：结束页面主容器。 */
  ); /* 第62天：结束实验策略专页返回。 */
} /* 第62天：结束提示词实验策略专页入口组件。 */

