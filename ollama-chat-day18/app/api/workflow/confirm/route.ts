/**
 * 第18天：POST /api/workflow/confirm —— HITL 用户确认或取消后续跑工作流。
 * 每行带中文行尾注释。
 */

import {
  applyWorkflowUserCancel,
  executeWorkflow,
  synthesizeWorkflowResult,
  WORKFLOW_DEFAULT_STEP_RETRIES,
} from "@/lib/workflow-executor";
import {
  deletePausedWorkflow,
  loadPausedWorkflow,
  savePausedWorkflow,
} from "@/lib/workflow-pause-store"; // 暂停上下文读写
import type { Memory } from "@/lib/workflow-types"; // 记忆类型
import { buildModelRuntime } from "@/lib/model-runtime";

/** POST：用户确认或取消 HITL 步骤。 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      workflowId?: string; // 工作流实例 id
      stepId?: string; // 待确认步骤 id
      decision?: "confirm" | "cancel"; // 用户决策
      memory?: Memory; // 前端回传记忆（续跑注入）
      provider?: string; // 模型提供商
      mimoModel?: string; // MiMo 模型
    }; // 请求体形状
    const { workflowId, stepId, decision, memory: memoryRaw, provider: providerRaw, mimoModel: mimoModelRaw } =
      body; // 解构字段
    if (!workflowId?.trim() || !stepId?.trim() || (decision !== "confirm" && decision !== "cancel")) {
      return Response.json({ error: "需要 workflowId、stepId 与 decision（confirm|cancel）" }, { status: 400 }); // 参数缺失
    } // 参数校验
    const ctx = loadPausedWorkflow(workflowId.trim()); // 读取暂停上下文
    if (!ctx) {
      return Response.json({ error: "未找到暂停的工作流，可能已过期或已处理" }, { status: 404 }); // 无上下文
    } // 404
    const memory: Memory =
      memoryRaw && Array.isArray(memoryRaw.shortTerm) && Array.isArray(memoryRaw.items)
        ? memoryRaw // 使用前端带回的 memory
        : ctx.memory; // 否则用暂停时快照
    const { rt, errorResponse } = buildModelRuntime(providerRaw, mimoModelRaw); // 重建运行时
    if (errorResponse || !rt) return errorResponse!; // 配置错误早返回

    let workflow = ctx.workflow; // 可变工作流引用
    const timeline = ctx.timeline; // 与 executionTimeline 共享的数组
    const step = workflow.steps.find((s) => s.id === stepId.trim()); // 目标步骤
    if (!step) {
      return Response.json({ error: `步骤 ${stepId} 不存在` }, { status: 400 }); // 非法 stepId
    } // step 不存在

    if (decision === "cancel") {
      workflow = applyWorkflowUserCancel(workflow, step.id, timeline); // 策略 A：整单 cancelled
      workflow.executionTimeline = timeline; // 挂载 timeline
      deletePausedWorkflow(workflow.id); // 清除 store
      return Response.json({
        type: "workflow", // 响应类型
        workflow, // 更新后的工作流
        finalSummary: "工作流已由用户取消，未继续执行后续步骤。", // 取消说明
        memory, // 记忆原样回传
        paused: false, // 不再暂停
      }); // cancel 响应
    } // cancel 分支结束

    step.confirmed = true; // 用户已确认
    step.status = "pending"; // 回到待调度，供 executeWorkflow 再次选中
    timeline.push({
      ts: Date.now(), // 确认时刻
      stepId: step.id, // 步骤 id
      message: `👤 用户已确认，继续执行：${step.name}（${step.id}）`, // HITL Timeline 事件
    }); // 确认打点
    console.log("[HITL]", {
      workflowId: workflow.id, // 工作流 id
      stepId: step.id, // 步骤 id
      status: step.status, // pending（即将执行）
      decision: "confirm", // 用户确认
    }); // HITL 确认日志

    let execResult = await executeWorkflow(workflow, memory, rt, {
      timeline, // 续跑 timeline
      defaultStepRetries: ctx.defaultStepRetries ?? WORKFLOW_DEFAULT_STEP_RETRIES, // 重试配置
    }); // 继续执行
    workflow = execResult.workflow; // 更新引用
    workflow.executionTimeline = timeline; // 挂载 timeline

    if (execResult.paused && execResult.waitingStepId) {
      savePausedWorkflow({
        workflow, // 可能再次暂停在下一步 HITL
        memory, // 记忆
        timeline, // timeline
        defaultStepRetries: ctx.defaultStepRetries, // 重试
      }); // 再次写入 store
      const waitStep = workflow.steps.find((s) => s.id === execResult.waitingStepId); // 新待确认步
      return Response.json({
        type: "workflow", // workflow 类型
        workflow, // 含新的 waiting_confirmation
        finalSummary: `仍需确认：${waitStep?.confirmationMessage ?? waitStep?.name ?? execResult.waitingStepId}`, // 暂停说明
        memory, // 记忆
        paused: true, // 仍暂停
        waitingStepId: execResult.waitingStepId, // 新 waiting id
      }); // 再次暂停
    } // 二次暂停

    deletePausedWorkflow(workflow.id); // 执行完毕，清除 store
    const failedStep = workflow.steps.find((s) => s.status === "failed"); // 失败步
    const finalSummary =
      workflow.status === "success"
        ? await synthesizeWorkflowResult(workflow, rt) // 成功则汇总
        : workflow.status === "cancelled"
          ? "工作流已由用户取消。" // 取消
          : `工作流中断：${failedStep?.error || "未知错误"}`; // 失败

    return Response.json({
      type: "workflow", // 类型
      workflow, // 完整工作流
      finalSummary, // 最终答复
      memory, // 记忆
      paused: false, // 已完成
    }); // confirm 成功完成
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err); // 错误信息
    return Response.json({ error: msg }, { status: 500 }); // 服务端错误
  } // try/catch
} // POST 结束
