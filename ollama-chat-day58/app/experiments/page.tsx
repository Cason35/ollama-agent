import type { Metadata } from "next"; /* 第58天：引入 Next.js 页面元数据类型。 */
import { PromptExperimentDashboard } from "@/app/components/PromptExperimentDashboard"; /* 第58天：引入提示词实验仪表盘组件，保留实验能力作为 Redis 生产基础设施中的质量证据。 */
export const metadata: Metadata = { /* 第58天：定义提示词实验策略专页浏览器元数据。 */
  title: "Day 58 - Prompt Strategy Experiment | Redis 基础设施提示词实验", /* 第58天：设置浏览器标签页标题为 Day58 提示词实验视图。 */
  description: "Day 58：在 Redis Production Infrastructure 基础上继续保留 Prompt Experiment Dashboard，用于对照不同 Prompt Strategy 的质量和成本。", /* 第58天：设置页面描述为 Redis 基础设施项目中的实验视图。 */
}; /* 第58天：结束提示词实验策略专页元数据。 */
export default function ExperimentsPage() { /* 第58天：定义提示词实验策略专页入口组件。 */
  return ( /* 第58天：返回实验策略专页布局。 */
    <main className="h-screen overflow-hidden bg-zinc-50 px-4 py-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"> {/* 第58天：定义固定视口页面主容器。 */}
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"> {/* 第58天：定义可内部滚动的实验工作区。 */}
        <PromptExperimentDashboard /> {/* 第58天：渲染完整提示词实验仪表盘。 */}
      </div> {/* 第58天：结束居中实验工作区。 */}
    </main> /* 第58天：结束页面主容器。 */
  ); /* 第58天：结束实验策略专页返回。 */
} /* 第58天：结束提示词实验策略专页入口组件。 */
