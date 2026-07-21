import type { Metadata } from "next"; // 第69天：引入 Next.js 页面元数据类型。
import { KnowledgeGovernanceExplorerV2 } from "@/app/components/KnowledgeGovernanceExplorerV2"; // 第69天：引入生产知识治理浏览器第二版客户端组件。
export const metadata: Metadata = { title: "Day 71 - Knowledge Governance Explorer V2 | 评估平台关联知识治理", description: "Day 71 继续保留 Day 69 Production Knowledge & RAG Platform V1，并把知识库、活动索引和引用质量纳入 RAG Evaluation。" }; // 第71天：定义生产评估平台关联知识治理页面的浏览器标签页标题与描述。
export default function KnowledgePage() { return <KnowledgeGovernanceExplorerV2 />; } // 第69天：渲染生产知识治理浏览器第二版完整页面。
