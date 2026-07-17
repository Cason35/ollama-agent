import type { Metadata } from "next"; // 第69天：引入 Next.js 页面元数据类型。
import { KnowledgeGovernanceExplorerV2 } from "@/app/components/KnowledgeGovernanceExplorerV2"; // 第69天：引入生产知识治理浏览器第二版客户端组件。
export const metadata: Metadata = { title: "Day 70 - Knowledge Governance Explorer V2 | 继承的生产知识平台", description: "Day 70 继续保留 Day 69 Production Knowledge & RAG Platform V1，用于治理知识库作用域、异步索引、权限、引用、删除与一致性。" }; // 第70天：定义继承生产知识治理页面的浏览器标签页标题与描述。
export default function KnowledgePage() { return <KnowledgeGovernanceExplorerV2 />; } // 第69天：渲染生产知识治理浏览器第二版完整页面。
