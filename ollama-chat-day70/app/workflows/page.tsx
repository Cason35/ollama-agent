import type { Metadata } from "next"; // 第70天：引入 Next.js 页面元数据类型。
import { WorkflowExplorerV2 } from "@/app/components/WorkflowExplorerV2"; // 第70天：引入持久化工作流浏览器第二版客户端组件。
export const metadata: Metadata = { title: "Day 70 - Workflow Explorer V2 | 持久化智能体工作流平台", description: "Day 70 Durable Agent Workflow Platform V1：覆盖 Workflow Definition V2、版本、State Store V2、Checkpoint、Resume、Replay、Event Sourcing、Metrics 与 UnifiedRegistry。" }; // 第70天：定义工作流治理页面浏览器标签页标题与描述。
export default function WorkflowsPage() { return <WorkflowExplorerV2 />; } // 第70天：渲染 Workflow Explorer V2 完整页面。
