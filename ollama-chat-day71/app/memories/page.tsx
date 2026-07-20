import type { Metadata } from "next"; // 第68天：引入 Next.js 页面元数据类型。
import { MemoryGovernanceExplorer } from "@/app/components/MemoryGovernanceExplorer"; // 第68天：引入生产记忆治理浏览器客户端组件。
export const metadata: Metadata = { // 第71天：定义评估平台关联的生产记忆治理页面浏览器标签页元数据。
  title: "Day 71 - Memory Governance Explorer | 评估平台关联记忆治理", // 第71天：设置标签页标题为生产评估平台关联的记忆治理能力。
  description: "Day 71 继续保留 Day 68 Production Memory Platform，并把记忆召回、冲突和长期记忆命中质量纳入 Memory Evaluation。", // 第71天：说明生产评估平台完整继承并评估生产记忆能力。
}; // 第68天：结束生产记忆治理页面元数据定义。
export default function MemoriesPage() { // 第68天：定义 Memory Governance Explorer 页面入口组件。
  return <MemoryGovernanceExplorer />; // 第68天：渲染生产记忆治理浏览器完整页面。
} // 第68天：结束生产记忆治理页面入口组件。
