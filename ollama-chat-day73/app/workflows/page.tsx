import type { Metadata } from "next"; // 第70天：引入 Next.js 页面元数据类型。
import { WorkflowExplorerV2 } from "@/app/components/WorkflowExplorerV2"; // 第70天：引入持久化工作流浏览器第二版客户端组件。
export const metadata: Metadata = { title: "Day 71 - Workflow Explorer V2 | 评估平台关联可靠工作流", description: "Day 71 继承 Durable Agent Workflow Platform V1，并通过 Workflow Evaluation 评估检查点、恢复、回放、事件时间线和可靠性。" }; // 第71天：定义生产评估平台关联工作流治理页面的浏览器标签页标题与描述。
export default function WorkflowsPage() { return <WorkflowExplorerV2 />; } // 第70天：渲染 Workflow Explorer V2 完整页面。
