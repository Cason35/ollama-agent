import type { Metadata } from "next"; /* 第56天：引入 Next.js 页面元数据类型。 */
import { PromptExperimentDashboard } from "@/app/components/PromptExperimentDashboard"; /* 第56天：引入提示词实验仪表盘组件，保留实验能力作为协作运行时的提示词质量证据。 */
export const metadata: Metadata = { /* 第56天：定义提示词实验兼容专页浏览器元数据。 */
  title: "Day 56 - Prompt Experiment Compatibility | 提示词实验兼容视图", /* 第56天：设置浏览器标签页标题为 Day56 兼容实验视图。 */
  description: "Day 56：在 Multi-Model Collaboration Runtime 基础上继续保留 Prompt Experiment Dashboard，用于对照 Prompt Version 实验和模型协作提示词质量。", /* 第56天：设置页面描述为多模型协作平台中的实验兼容视图。 */
}; /* 第56天：结束提示词实验兼容专页元数据。 */
export default function ExperimentsPage() { /* 第56天：定义提示词实验兼容专页入口组件。 */
  return ( /* 第56天：返回实验兼容专页布局。 */
    <main className="h-screen overflow-hidden bg-zinc-50 px-4 py-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"> {/* 第56天：定义固定视口页面主容器。 */}
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"> {/* 第56天：定义可内部滚动的实验工作区。 */}
        <PromptExperimentDashboard /> {/* 第56天：渲染完整提示词实验仪表盘。 */}
      </div> {/* 第56天：结束居中实验工作区。 */}
    </main> /* 第56天：结束页面主容器。 */
  ); /* 第56天：结束实验兼容专页返回。 */
} /* 第56天：结束提示词实验兼容专页入口组件。 */
