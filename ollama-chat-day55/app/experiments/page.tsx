import type { Metadata } from "next"; /* 第55天：引入 Next.js 页面元数据类型。 */
import { PromptExperimentDashboard } from "@/app/components/PromptExperimentDashboard"; /* 第55天：引入提示词实验仪表盘组件，保留 Day53 实验能力。 */
export const metadata: Metadata = { /* 第55天：定义提示词实验兼容专页浏览器元数据。 */
  title: "Day 55 - Prompt Optimization Experiment Compatibility | 提示词优化实验兼容视图", /* 第55天：设置浏览器标签页标题为 Day55 兼容实验视图。 */
  description: "Day 55：在 Dynamic Prompt Optimization 基础上继续保留 Prompt Experiment Dashboard，用于对照 Prompt Version 实验和动态块策略升级。", /* 第55天：设置页面描述为动态优化平台中的实验兼容视图。 */
}; /* 第55天：结束提示词实验兼容专页元数据。 */
export default function ExperimentsPage() { /* 第55天：定义提示词实验兼容专页入口组件。 */
  return ( /* 第55天：返回实验兼容专页布局。 */
    <main className="h-screen overflow-hidden bg-zinc-50 px-4 py-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"> {/* 第55天：定义固定视口页面主容器。 */}
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"> {/* 第55天：定义可内部滚动的实验工作区。 */}
        <PromptExperimentDashboard /> {/* 第55天：渲染完整提示词实验仪表盘。 */}
      </div> {/* 第55天：结束居中实验工作区。 */}
    </main> /* 第55天：结束页面主容器。 */
  ); /* 第55天：结束实验兼容专页返回。 */
} /* 第55天：结束提示词实验兼容专页入口组件。 */
