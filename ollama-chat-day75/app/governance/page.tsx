import type { Metadata } from "next"; // 第73天：引入Next.js页面元数据类型。
import { GovernanceDashboard } from "@/app/components/GovernanceDashboard"; // 第73天：引入智能体平台治理仪表盘客户端组件。
export const metadata: Metadata = { title: "Day 75 - Governance Capability | 智能体平台治理能力", description: "Day 75 Portfolio：继承并展示Tenant、RBAC、Permission、Quota、Audit、API Gateway和Production Security Test。" }; // 第75天：定义最终作品集中的治理能力标签页标题。
export default function GovernancePage() { return <GovernanceDashboard />; } // 第75天：渲染Day75继承的智能体平台治理能力页面。
