import type { Metadata } from "next"; // 第71天：引入 Next.js 页面元数据类型。
import { EvaluationExplorerV2 } from "@/app/components/EvaluationExplorerV2"; // 第71天：引入生产评估浏览器第二版客户端组件。

export const metadata: Metadata = { title: "Day 71 - Evaluation Explorer V2 | 生产评估平台", description: "Day 71 Production Evaluation Platform V2：展示 Evaluation Runs、Case Analysis、Regression、Quality Gate、Feedback Loop、Metrics、Trace、RuntimeContext、EventBus 与 UnifiedRegistry。" }; // 第71天：定义评估浏览器标签页标题和生产评估平台完整描述。
export default function EvaluationsPage() { return <EvaluationExplorerV2 />; } // 第71天：渲染 Evaluation Explorer V2 完整页面。
