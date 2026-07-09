/**
 * Next.js App Router：`POST /api/chat` —— 带记忆与工具路由的聊天接口。
 *
 * 注释约定：可执行代码行尽量带行尾「//」中文说明。
 *
 * 整体流程（本文件为编排层，具体实现见 `lib/`）：
 * 1. 解析请求 → buildModelRuntime / buildMemory；
 * 2. useWorkflow 时走 Planner → validate/repair → Queue WorkflowJob（保留旧工作流模式）；
 * 3. 否则走一轮轻量普通聊天，避免短对话触发完整 Agent 协作链；
 * 4. 所有成功路径均通过 withMemory 附带最新 memory 返回前端。
 *
 * 第16–18天能力由 lib/workflow-* 提供；本文件 re-export 部分符号供 confirm API 复用。
 */

import {
  API_REASON,
  apiJsonReasonError,
  apiJsonSuccess,
} from "@/lib/api/api-envelope"; // 统一响应包
import { buildMemory } from "@/lib/chat/chat-memory"; // 记忆管线
import {
  logAgent, // Agent 结构化日志
} from "@/lib/chat/chat-routing";
import type {
  ChatMessage, // 单条 user/assistant 消息
  ChatResponseBody, // 含 memory 的完整响应体
  ChatResponsePayload, // 不含 memory 的业务负载（供 withMemory 组装）
  IncomingMemoryPayload, // 请求体 memory 字段（兼容旧 longTerm）
} from "@/lib/chat/chat-types";
import {
  generateFallbackChat, // 普通聊天直答
  getLatestUserText, // 取最近一条 user 消息
} from "@/lib/chat/chat-tools";
import { buildModelRuntime } from "@/lib/model/model-runtime"; // 模型运行时
import { getQueueRuntime } from "@/lib/queue/queue-runtime"; // 第37天：引入 Queue Runtime，用于创建 WorkflowJob。
import type { WorkflowJobPayload } from "@/lib/queue/queue-types"; // 第37天：引入 WorkflowJob 载荷类型。
import { inferRuntimeContextFromText, runtimeDecisionEngine } from "@/lib/runtime/runtime-decision-engine"; // 第57天：引入运行时上下文推导和决策引擎
import { runtimeDecisionStore } from "@/lib/runtime/runtime-decision-store"; // 第57天：引入运行时决策回放仓库
import {
  WORKFLOW_DEFAULT_STEP_RETRIES, // 步骤默认额外重试次数（confirm 续跑复用）
  applyWorkflowUserCancel, // 第18天：用户取消关键步（策略 A）
  executeWorkflow, // 并行 DAG 执行器
  synthesizeWorkflowResult, // 工作流成功后的最终自然语言汇总
} from "@/lib/workflow/workflow-executor";
import { logWorkflow } from "@/lib/workflow/workflow-log"; // Workflow 专用日志
import { planWorkflowSteps } from "@/lib/workflow/workflow-planner"; // Planner：拆分为多步
import { repairWorkflow, topologicalSort, validateWorkflow } from "@/lib/workflow/workflow-validate"; // 静态校验与修复
import type { Workflow, WorkflowTimelineEvent } from "@/lib/workflow/workflow-types"; // 工作流容器与时间线事件

/** 供 confirm API 等同模块导入，避免从 route 拉取整文件实现。 */
export {
  WORKFLOW_DEFAULT_STEP_RETRIES, // 默认重试常量
  applyWorkflowUserCancel, // HITL 取消
  executeWorkflow, // 执行器（续跑）
  synthesizeWorkflowResult, // 最终汇总
};

/**
 * POST 处理器：校验入参 → buildMemory → 按 useWorkflow 或单步路由分发。
 * 所有成功路径均返回 JSON 且包含更新后的 memory。
 */
export async function POST(req: Request) {
  const requestStart = Date.now(); // 请求开始时间戳，供异常日志统计总耗时
  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[]; // 对话历史（user/assistant 文本）
      memory?: IncomingMemoryPayload; // 上轮回传的记忆载荷
      useWorkflow?: boolean; // true 时走多步工作流而非单步路由
      /** 前端：`local` | `mimo`，缺省为本地 Ollama */
      provider?: string; // 模型提供商开关
      /** 小米 MiMo 模型 id，仅在 provider=mimo 时生效 */
      mimoModel?: string; // MiMo 具体模型 id
    }; // 请求 JSON 体的 TypeScript 形状断言（运行时不校验，需下方逻辑兜底）
    const { messages, memory: incomingMemory, useWorkflow, provider: providerRaw, mimoModel: mimoModelRaw } =
      body; // 解构常用字段便于后续校验与传递
    if (!Array.isArray(messages) || messages.length === 0) {
      return apiJsonReasonError(API_REASON.MESSAGES_REQUIRED); // 400 统一包
    }

    const { rt, errorResponse } = buildModelRuntime(providerRaw, mimoModelRaw); // 组装 Ollama/MiMo 运行时；失败时带 errorResponse
    if (!rt) return errorResponse!; // 模型配置非法或未配置密钥时早返回

    const { memory, modelMessages } = await buildMemory(messages, incomingMemory, rt); // 构建记忆与普通聊天上下文
    const latestUserText = getLatestUserText(memory.shortTerm); // 第57天：读取最新用户输入，作为 RuntimeContext 推导的任务文本
    const runtimeContext = inferRuntimeContextFromText({ text: latestUserText, hasMemory: memory.items.length > 0 || memory.shortTerm.length > 1, hasWorkspace: useWorkflow === true, hasKnowledge: /知识|检索|资料|引用|来源|rag|论文|报告/i.test(latestUserText), requiresJson: /json|结构化|schema|只返回/i.test(latestUserText), latencyPreference: useWorkflow ? "quality" : undefined }); // 第57天：把聊天请求推导为运行时上下文
    const runtimeDecision = runtimeDecisionEngine.decide(runtimeContext); // 第57天：根据上下文生成运行时决策
    const runtimeDecisionRecord = runtimeDecisionStore.record({ context: runtimeContext, decision: runtimeDecision, source: useWorkflow ? "chat-api-workflow" : "chat-api" }); // 第57天：写入决策回放仓库
    logAgent("runtime_decision", { decisionId: runtimeDecisionRecord.decisionId, promptStrategy: runtimeDecision.promptStrategy, modelStrategy: runtimeDecision.modelStrategy, collaborationStrategy: runtimeDecision.collaborationStrategy, cacheStrategy: runtimeDecision.cacheStrategy, retrievalStrategy: runtimeDecision.retrievalStrategy, memoryStrategy: runtimeDecision.memoryStrategy, estimatedCost: runtimeDecision.estimatedCost, estimatedLatencyMs: runtimeDecision.estimatedLatencyMs }); // 第57天：记录运行时决策日志

    /** 统一把本轮计算好的 memory 附加到任意业务负载上返回前端。 */
    function withMemory(body: ChatResponsePayload): ChatResponseBody {
      return { ...body, memory }; // 展开业务体并附加 memory，形成闭环
    }

    if (useWorkflow) {
      // ---------- 多步工作流分支（第15–18天）----------
      const wfT0 = Date.now(); // 工作流总耗时起点
      const goal = latestUserText; // 第57天：复用运行时决策阶段已经读取的最新用户句作为 workflow 目标
      console.log("[Workflow] start:", goal); // 文档要求：可见 workflow goal
      logWorkflow("start", { goal }); // 结构化开始日志

      const planItems = await planWorkflowSteps(goal, memory, rt); // Planner：模型产出步骤草案
      const wfId = globalThis.crypto.randomUUID(); // 工作流实例唯一 id
      let workflow: Workflow = {
        id: wfId, // 唯一标识本次多步任务
        goal, // 用户目标描述
        status: "pending", // 初始 pending；validate/repair 后可能直接 failed
        steps: planItems.map((p) => ({
          id: p.id, // 稳定步骤 id（finalize 可能含随机后缀防冲突）
          name: p.name, // Planner 可读标题
          action: p.action, // chat | summary | todo | weather | judge
          input: p.input, // 已规范化的字符串入参
          ...(p.dependsOn?.length ? { dependsOn: p.dependsOn } : {}), // 有依赖则写入 dependsOn
          ...(p.condition ? { condition: p.condition } : {}), // 第17天：条件分支
          ...(p.requiresConfirmation
            ? {
                requiresConfirmation: true, // 第18天：HITL 标记
                confirmationMessage: p.confirmationMessage, // 展示给用户的确认文案
              }
            : {}), // HITL 字段展开
          status: "pending" as const, // 初始未执行；executeWorkflow 会写入 running/success 等
        })), // FinalizedPlannerPlanItem → WorkflowStep 雏形
      };

      const timeline: WorkflowTimelineEvent[] = []; // Runtime trace：贯穿 validate→repair→execute
      const pushTimeline = (message: string, stepId?: string) => {
        timeline.push({ ts: Date.now(), message, stepId }); // 追加一条时间线事件
      }; // pushTimeline 闭包结束
      pushTimeline("工作流管道：前置静态校验 validateWorkflow 开始"); // Timeline：阶段分界线
      let validation = validateWorkflow(workflow); // 第一轮：零副作用前拦住非法 DAG
      if (!validation.ok) {
        pushTimeline(`校验失败，进入 repairWorkflow：${validation.errors.join("；")}`, undefined); // Timeline：复述错误摘要
        workflow = repairWorkflow(workflow); // AUTO REPAIR：别名归一、补 dependsOn、削环等
        pushTimeline("repairWorkflow 已运行，正在进行二次校验", undefined); // Timeline：repair 打点
        validation = validateWorkflow(workflow); // 第二轮：仅允许可执行的合法 workflow 继续
      } else {
        pushTimeline("首轮校验通过（跳过 repairWorkflow）", undefined); // 快路径：避免误报修复噪音
      } // validate 分支结束
      if (!validation.ok) {
        pushTimeline(`校验仍失败，拒绝执行（不进入模型工具链）：${validation.errors.join("；")}`, undefined); // 明确 short-circuit
        workflow.status = "failed"; // 状态机：failed（无步骤进入 running）
        workflow.executionTimeline = timeline; // 把截至目前的 trace 回传前端排错
        const finalSummary = `工作流校验失败（未执行任何步骤）：\n${validation.errors.map((e) => `- ${e}`).join("\n")}`; // 用户可见分条错误
        logWorkflow("error", {
          goal: workflow.goal, // 结构化日志：目标
          workflowId: workflow.id, // 结构化日志：实例 id
          validationErrors: validation.errors, // 错误数组便于聚合统计
        }); // 校验失败日志
        return apiJsonSuccess(withMemory({ type: "workflow", workflow, finalSummary })); // 早返回：避免 executeWorkflow
      } // 校验短路返回结束
      const topoPreview = topologicalSort(workflow.steps) // DAG 可读预览（不参与执行逻辑）
        .map((x) => x.id) // 映射为 id 列表
        .join("→"); // 箭头串联
      pushTimeline(`校验通过：topologicalSort 预览序 ${topoPreview}`, undefined); // Timeline：写明将采用 DAG 序
      workflow.status = "queued"; // 第37天：校验通过后不再直接执行，而是标记为已入队。
      workflow.executionTimeline = timeline; // 挂载截至 Job 创建前的 Workflow Timeline。
      pushTimeline(`RuntimeDecision：${runtimeDecision.promptStrategy}/${runtimeDecision.modelStrategy}/${runtimeDecision.collaborationStrategy}，Workflow 已通过校验，准备创建 Queue Job`, undefined); // 第57天：把运行时决策写入 Workflow Timeline。
      const workflowJobPayload: WorkflowJobPayload = { workflowId: workflow.id, workflow, memory, provider: rt.provider, mimoModel: rt.mimoModel }; // 第37天：构造 Worker 后续执行所需完整载荷。
      const queueSnapshot = await getQueueRuntime().enqueue({ type: "workflow", resourceType: "workflow", payload: workflowJobPayload, priority: 9, timeoutMs: 120000 }); // 第37天：创建 WorkflowJob 并交给 Queue 调度。
      workflow = { ...workflow, jobId: queueSnapshot.created.id, executionTimeline: [...timeline, { ts: Date.now(), message: `Queue Job ${queueSnapshot.created.id} 已创建，等待 Worker 认领` }] }; // 将新 Job ID 写回 Workflow，完成双向关联。
      const wfElapsed = Date.now() - wfT0; // 记录从规划到入队的耗时。
      logWorkflow("done", { goal: workflow.goal, workflowId: workflow.id, jobId: workflow.jobId, status: workflow.status, durationMs: wfElapsed }); // 记录 WorkflowJob 创建完成日志。
      logAgent("result", { action: "workflow", durationMs: wfElapsed, success: true, queued: true }); // 记录 Agent 已成功创建异步工作流任务。
      return apiJsonSuccess(withMemory({ type: "workflow", workflow, finalSummary: `Workflow Job 已创建：${queueSnapshot.created.id}。请在右侧 Queue Runtime V7 看板观察 Job → Workflow → Step 的执行链路。`, paused: false })); // 第37天：立即返回入队结果，不等待工作流执行完成。
    } // useWorkflow 分支结束

    // ---------- 轻量普通聊天分支 ----------
    const chatStart = Date.now(); // 记录普通聊天开始时间。
    const content = await generateFallbackChat(modelMessages, rt); // 普通聊天只做一轮模型补全，避免短问候触发完整 Agent DAG。
    logAgent("result", { action: "chat", durationMs: Date.now() - chatStart, success: true, provider: rt.provider, model: rt.provider === "mimo" ? rt.mimoModel : rt.ollamaModel }); // 记录普通聊天完成日志。
    return apiJsonSuccess(withMemory({ type: "chat", content })); // 以普通聊天气泡返回最终输出。
  } catch (error) {
    logAgent("error", {
      success: false, // 失败
      durationMs: Date.now() - requestStart, // 总耗时
      error: error instanceof Error ? error.message : String(error), // 错误信息
    }); // 异常日志
    return apiJsonReasonError(API_REASON.INTERNAL); // 对外统一 500
  }
} // POST 结束


