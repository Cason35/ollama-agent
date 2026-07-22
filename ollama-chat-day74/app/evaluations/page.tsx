import type { Metadata } from "next"; // 第71天：引入 Next.js 页面元数据类型。
import { EvaluationExplorerV2 } from "@/app/components/EvaluationExplorerV2"; // 第71天：引入生产评估浏览器第二版客户端组件。

export const metadata: Metadata = { title: "Day 74 - Evaluation Explorer V2 | 生产发布质量评估", description: "Day 74 继承 Production Evaluation Platform V2，展示 Evaluation Runs、Regression、Quality Gate、Feedback Loop、Metrics 与 Trace。" }; // 第74天：定义生产发布质量评估标签页标题和描述。
export default function EvaluationsPage() { return <EvaluationExplorerV2 />; } // 第71天：渲染 Evaluation Explorer V2 完整页面。
