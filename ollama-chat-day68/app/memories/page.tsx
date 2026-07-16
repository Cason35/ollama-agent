import type { Metadata } from "next"; // 第68天：引入 Next.js 页面元数据类型。
import { MemoryGovernanceExplorer } from "@/app/components/MemoryGovernanceExplorer"; // 第68天：引入生产记忆治理浏览器客户端组件。
export const metadata: Metadata = { // 第68天：定义生产记忆治理页面浏览器标签页元数据。
  title: "Day 68 - Memory Governance Explorer | 生产级记忆平台", // 第68天：设置标签页标题为第68天生产记忆治理主题。
  description: "Day 68 Production Memory Platform：统一治理 Redis 会话记忆、MySQL + VectorStore 长期记忆、工作空间归档、检索评分、去重、冲突、事件与指标。", // 第68天：设置页面描述为生产记忆平台完整能力。
}; // 第68天：结束生产记忆治理页面元数据定义。
export default function MemoriesPage() { // 第68天：定义 Memory Governance Explorer 页面入口组件。
  return <MemoryGovernanceExplorer />; // 第68天：渲染生产记忆治理浏览器完整页面。
} // 第68天：结束生产记忆治理页面入口组件。
