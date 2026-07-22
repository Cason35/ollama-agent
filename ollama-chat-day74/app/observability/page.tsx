import type { Metadata } from "next"; // 第72天：引入Next.js页面元数据类型。
import { ObservabilityDashboard } from "@/app/components/ObservabilityDashboard"; // 第72天：引入生产可观测仪表盘客户端组件。

export const metadata: Metadata = { title: "Day 74 - Observability Dashboard | 生产交付可观测平台", description: "Day 74 继承 Production Observability Platform，展示Overview、Trace、Metrics、Alert、Structured Logs、Error Tracking与Sampling。" }; // 第74天：定义生产交付可观测标签页标题和描述。
export default function ObservabilityPage() { return <ObservabilityDashboard />; } // 第72天：渲染Day72生产可观测仪表盘完整页面。
