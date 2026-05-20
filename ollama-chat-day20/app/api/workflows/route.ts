/**
 * 第20天：Workflow 列表与保存 API — GET list / POST save（任务 5）。
 * 每行带中文行尾注释。
 */

import { NextResponse } from "next/server"; // Next.js 响应工具
import {
  WORKFLOW_STATE_VERSION,
} from "@/lib/workflow-persistence-constants"; // 版本常量
import { dbListWorkflows, dbSaveWorkflow } from "@/lib/workflow-db"; // 内存 Map
import type { WorkflowState } from "@/lib/workflow-types"; // 快照类型

/** GET /api/workflows — 返回全部 WorkflowState[]。 */
export async function GET() {
  const list = dbListWorkflows(); // 从 Map 读取
  return NextResponse.json(list); // JSON 数组
} // GET 结束

/** POST /api/workflows — 保存或覆盖一条 WorkflowState。 */
export async function POST(request: Request) {
  let body: unknown; // 原始请求体
  try {
    body = await request.json(); // 解析 JSON
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 }); // 400
  } // catch
  const state = body as WorkflowState; // 断言类型
  if (!state?.workflowId || typeof state.workflowId !== "string") {
    return NextResponse.json({ error: "缺少 workflowId" }, { status: 400 }); // 校验 id
  } // 无 id
  if (state.version !== WORKFLOW_STATE_VERSION) {
    return NextResponse.json({ error: "不支持的 version" }, { status: 400 }); // 版本
  } // version
  dbSaveWorkflow(state); // 写入 Map
  return NextResponse.json({ ok: true, workflowId: state.workflowId }); // 成功
} // POST 结束
