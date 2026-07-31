import type { Metadata } from "next"; // 第69天：引入 Next.js 页面元数据类型。
import { KnowledgeGovernanceExplorerV2 } from "@/app/components/KnowledgeGovernanceExplorerV2"; // 第69天：引入生产知识治理浏览器第二版客户端组件。
export const metadata: Metadata = { title: "Day 74 - Knowledge Governance Explorer V2 | 生产知识治理", description: "Day 74 继承 Production Knowledge & RAG Platform，并把知识库、活动索引和引用质量纳入生产发布。" }; // 第74天：定义生产知识治理页面的浏览器标签页标题与描述。
export default function KnowledgePage() { return <KnowledgeGovernanceExplorerV2 />; } // 第69天：渲染生产知识治理浏览器第二版完整页面。
