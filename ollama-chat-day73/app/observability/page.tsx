import type { Metadata } from "next"; // 第72天：引入Next.js页面元数据类型。
import { ObservabilityDashboard } from "@/app/components/ObservabilityDashboard"; // 第72天：引入生产可观测仪表盘客户端组件。

export const metadata: Metadata = { title: "Day 72 - Observability Dashboard | 生产可观测平台", description: "Day 72 Production Observability Platform：展示Overview、Trace Explorer、Metrics Explorer、Alert Center、Structured Logs、Error Tracking、Sampling、EventBus与UnifiedRegistry。" }; // 第72天：定义可观测仪表盘标签页标题和完整生产诊断描述。
export default function ObservabilityPage() { return <ObservabilityDashboard />; } // 第72天：渲染Day72生产可观测仪表盘完整页面。
