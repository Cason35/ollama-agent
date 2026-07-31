import type { Metadata } from "next"; // 第70天：引入 Next.js 页面元数据类型。
import { WorkflowExplorerV2 } from "@/app/components/WorkflowExplorerV2"; // 第70天：引入持久化工作流浏览器第二版客户端组件。
export const metadata: Metadata = { title: "Day 74 - Workflow Explorer V2 | 生产可靠工作流", description: "Day 74 继承 Durable Agent Workflow Platform，并通过生产发布验证检查点、恢复、回放、事件时间线和可靠性。" }; // 第74天：定义生产可靠工作流标签页标题与描述。
export default function WorkflowsPage() { return <WorkflowExplorerV2 />; } // 第70天：渲染 Workflow Explorer V2 完整页面。
