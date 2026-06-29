import type { Metadata } from "next"; /* 第53天：引入 Next.js 页面元数据类型。 */
import { PromptExperimentDashboard } from "@/app/components/PromptExperimentDashboard"; /* 第53天：引入提示词实验仪表盘组件。 */

export const metadata: Metadata = { /* 第53天：定义提示词实验专页浏览器元数据。 */
  title: "Day 53 - Prompt Experiment Platform | 提示词实验平台", /* 第53天：设置浏览器标签页标题为提示词实验平台主题。 */
  description: "Day 53：Prompt Experiment Platform（提示词实验平台），比较多个 Prompt Version 的质量、成本、延迟、回归风险，并通过 Quality Gate 选择可 Promote 的获胜版本。", /* 第53天：设置页面描述为实验平台核心能力。 */
}; /* 第53天：结束提示词实验专页元数据。 */

export default function ExperimentsPage() { /* 第53天：定义提示词实验专页入口组件。 */
  return ( /* 第53天：返回实验专页布局。 */
    <main className="h-screen overflow-hidden bg-zinc-50 px-4 py-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"> {/* 第53天增强：定义固定视口页面主容器，避免实验矩阵撑出整页。 */}
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"> {/* 第53天增强：定义可内部滚动的实验工作区。 */}
        <PromptExperimentDashboard /> {/* 第53天：渲染完整提示词实验仪表盘。 */}
      </div> {/* 第53天：结束居中实验工作区。 */}
    </main> /* 第53天：结束页面主容器。 */
  ); /* 第53天：结束实验专页返回。 */
} /* 第53天：结束提示词实验专页入口组件。 */
