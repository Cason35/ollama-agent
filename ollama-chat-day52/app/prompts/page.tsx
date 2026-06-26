import type { Metadata } from "next"; /* 第52天增强：引入 Next.js 页面元数据类型。 */
import { PromptWorkbench } from "@/app/components/PromptWorkbench"; /* 第52天增强：引入完整提示词管理工作台。 */

export const metadata: Metadata = { /* 第52天增强：定义提示词管理专页浏览器元数据。 */
  title: "Day 52 - Prompt Console | 提示词版本管理控制台", /* 第52天增强：设置提示词管理页面标签页标题。 */
  description: "Day 52 完整提示词管理页：新增、编辑、变量校验、Prompt Diff、渲染预览、保存并激活。", /* 第52天增强：设置提示词管理页面描述。 */
}; /* 第52天增强：结束提示词管理专页元数据。 */

export default function PromptsPage() { /* 第52天增强：定义提示词管理专页入口组件。 */
  return <PromptWorkbench />; /* 第52天增强：渲染完整提示词工作台。 */
} /* 第52天增强：结束提示词管理专页入口组件。 */
