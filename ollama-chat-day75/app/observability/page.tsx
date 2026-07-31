import type { Metadata } from "next"; // 第72天：引入Next.js页面元数据类型。
import { ObservabilityDashboard } from "@/app/components/ObservabilityDashboard"; // 第72天：引入生产可观测仪表盘客户端组件。

export const metadata: Metadata = { title: "Day 75 - Observability Capability | 智能体平台可观测能力", description: "Day 75 Portfolio 继承 Production Observability Platform，展示Overview、Trace、Metrics、Alert、Structured Logs、Error Tracking与Sampling。" }; // 第75天：定义最终作品集中的可观测能力标签页标题和描述。
export default function ObservabilityPage() { return <ObservabilityDashboard />; } // 第72天：渲染Day72生产可观测仪表盘完整页面。
