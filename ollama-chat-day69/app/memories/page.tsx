import type { Metadata } from "next"; // 第68天：引入 Next.js 页面元数据类型。
import { MemoryGovernanceExplorer } from "@/app/components/MemoryGovernanceExplorer"; // 第68天：引入生产记忆治理浏览器客户端组件。
export const metadata: Metadata = { // 第69天：定义继承的生产记忆治理页面浏览器标签页元数据。
  title: "Day 69 - Memory Governance Explorer | 继承的生产记忆平台", // 第69天：设置标签页标题为第69天项目继承的生产记忆治理能力。
  description: "Day 69 继续保留 Day 68 Production Memory Platform，用于统一治理 Redis 会话记忆、MySQL + VectorStore 长期记忆、冲突、归档、事件与指标。", // 第69天：说明生产知识项目完整继承生产记忆平台。
}; // 第68天：结束生产记忆治理页面元数据定义。
export default function MemoriesPage() { // 第68天：定义 Memory Governance Explorer 页面入口组件。
  return <MemoryGovernanceExplorer />; // 第68天：渲染生产记忆治理浏览器完整页面。
} // 第68天：结束生产记忆治理页面入口组件。
