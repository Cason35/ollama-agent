import type { Metadata } from "next"; // 第69天：引入 Next.js 页面元数据类型。
import { KnowledgeGovernanceExplorerV2 } from "@/app/components/KnowledgeGovernanceExplorerV2"; // 第69天：引入生产知识治理浏览器第二版客户端组件。
export const metadata: Metadata = { title: "Day 69 - Knowledge Governance Explorer V2 | 生产知识与 RAG 平台", description: "Day 69 Production Knowledge & RAG Platform V1：覆盖知识库作用域、文档生命周期、异步索引、活动版本、权限过滤、标准引用、两阶段删除、指标与一致性治理。" }; // 第69天：定义知识治理页面浏览器标签页标题与描述。
export default function KnowledgePage() { return <KnowledgeGovernanceExplorerV2 />; } // 第69天：渲染生产知识治理浏览器第二版完整页面。
