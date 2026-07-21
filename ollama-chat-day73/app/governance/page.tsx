import type { Metadata } from "next"; // 第73天：引入Next.js页面元数据类型。
import { GovernanceDashboard } from "@/app/components/GovernanceDashboard"; // 第73天：引入智能体平台治理仪表盘客户端组件。
export const metadata: Metadata = { title: "Day 73 - Agent Platform Governance Dashboard | 智能体平台治理与生产就绪", description: "Day 73 Production Upgrade V10：展示Tenant、RBAC、Permission、Quota、Audit、API Gateway和Production Security Test。" }; // 第73天：定义治理仪表盘标签页标题和多租户生产治理描述。
export default function GovernancePage() { return <GovernanceDashboard />; } // 第73天：渲染Day73智能体平台治理仪表盘完整页面。
