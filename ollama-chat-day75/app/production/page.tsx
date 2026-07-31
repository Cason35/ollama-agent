import type { Metadata } from "next"; // 第74天：引入 Next.js 页面元数据类型。
import { ProductionDashboard } from "@/app/components/ProductionDashboard"; // 第74天：引入生产交付仪表盘客户端组件。

export const metadata: Metadata = { title: "Day 75 - Production Capability | 智能体平台生产能力", description: "Day 75 Portfolio：继承生产配置、系统健康、启动校验、Docker、数据库迁移、备份恢复、版本发布和功能开关。" }; // 第75天：定义最终作品集中的生产能力标签页标题与描述。

export default function ProductionPage() { // 第74天：定义生产交付仪表盘页面组件。
  return <ProductionDashboard />; // 第74天：渲染 Day74 生产交付仪表盘。
} // 第74天：结束生产交付仪表盘页面组件。
