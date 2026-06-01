/**
 * Next.js App Router：`POST /api/chat` —— 带记忆与工具路由的聊天接口。
 *
 * 注释约定：可执行代码行尽量带行尾「//」中文说明。
 *
 * 整体流程（本文件为编排层，具体实现见 `lib/`）：
 * 1. 解析请求 → buildModelRuntime / buildMemory；
 * 2. useWorkflow 时走 Planner → validate/repair → executeWorkflow（含 HITL 暂停）；
 * 3. 否则走路由模型 JSON action → weather / summary / todo / chat 分支；
 * 4. 所有成功路径均通过 withMemory 附带最新 memory 返回前端。
 *
 * 第16–18天能力由 lib/workflow-* 提供；本文件 re-export 部分符号供 confirm API 复用。
 */

import {
  API_REASON,
  apiJsonReasonError,
  apiJsonSuccess,
} from "@/lib/api-envelope"; // 统一响应包
import { buildMemory, memoryItemsCharLength } from "@/lib/chat-memory"; // 记忆管线与长期条目字符统计
import {
  buildRoutingSystemPrompt, // 路由专用 system 提示词
  logAgent, // Agent 结构化日志
  parseModelOutput, // 解析路由模型 JSON 输出
  resolveContinuationAction, // 「继续上次」等延续语义修正 action
} from "@/lib/chat-routing";
import type {
  ChatMessage, // 单条 user/assistant 消息
  ChatResponseBody, // 含 memory 的完整响应体
  ChatResponsePayload, // 不含 memory 的业务负载（供 withMemory 组装）
  IncomingMemoryPayload, // 请求体 memory 字段（兼容旧 longTerm）
} from "@/lib/chat-types";
import {
  extractWeatherCity, // 从用户话术中解析城市名
  generateFallbackChat, // 路由 content 为空时的第二轮闲聊
  generateTodosWithModel, // 待办分支：模型生成 JSON 任务列表
  getLatestUserText, // 取最近一条 user 消息
  realWeather, // Open-Meteo 天气查询
  summarizeWithModel, // 总结分支：要点列表
} from "@/lib/chat-tools";
import { buildModelRuntime, invokeChatModel } from "@/lib/model-runtime"; // 模型运行时与统一补全
import { savePausedWorkflow } from "@/lib/workflow-pause-store"; // 第18天：HITL 暂停上下文写入
import {
  WORKFLOW_DEFAULT_STEP_RETRIES, // 步骤默认额外重试次数（confirm 续跑复用）
  applyWorkflowUserCancel, // 第18天：用户取消关键步（策略 A）
  executeWorkflow, // 并行 DAG 执行器
  synthesizeWorkflowResult, // 工作流成功后的最终自然语言汇总
} from "@/lib/workflow-executor";
import { logWorkflow } from "@/lib/workflow-log"; // Workflow 专用日志
import { planWorkflowSteps } from "@/lib/workflow-planner"; // Planner：拆分为多步
import { repairWorkflow, topologicalSort, validateWorkflow } from "@/lib/workflow-validate"; // 静态校验与修复
import type { Workflow, WorkflowTimelineEvent } from "@/lib/workflow-types"; // 工作流容器与时间线事件

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

    const { memory, modelMessages } = await buildMemory(messages, incomingMemory, rt); // 构建记忆与喂给最终聊天的 modelMessages

    /** 统一把本轮计算好的 memory 附加到任意业务负载上返回前端。 */
    function withMemory(body: ChatResponsePayload): ChatResponseBody {
      return { ...body, memory }; // 展开业务体并附加 memory，形成闭环
    }

    if (useWorkflow) {
      // ---------- 多步工作流分支（第15–18天）----------
      const wfT0 = Date.now(); // 工作流总耗时起点
      const goal = getLatestUserText(memory.shortTerm); // 以最新用户句为 workflow 目标
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
      workflow.status = "running"; // 真正进入执行前标 running
      pushTimeline(
        "执行器 executeWorkflow 启动（第16天：并行 DAG；第17天：condition/skipped；第18天：HITL 暂停）",
        undefined // 批次级事件不绑定单一 stepId
      ); // Timeline：executor 能力边界说明
      const execResult = await executeWorkflow(workflow, memory, rt, {
        timeline, // 传入共享数组：execute 内向同一缓冲 append
        defaultStepRetries: WORKFLOW_DEFAULT_STEP_RETRIES, // 全局默认额外重试次数
      }); // 直至 success、failed、cancelled 或 HITL 暂停
      workflow = execResult.workflow; // 使用执行器就地更新后的引用
      workflow.executionTimeline = timeline; // 挂载完整 Timeline 供前端展示

      if (execResult.paused && execResult.waitingStepId) {
        // ---------- 第18天 HITL 暂停分支 ----------
        savePausedWorkflow({
          workflow, // 暂停快照
          memory, // 续跑时 memory
          timeline, // 共享 timeline 引用
          defaultStepRetries: WORKFLOW_DEFAULT_STEP_RETRIES, // 默认重试配置
        }); // 写入 pause store 供 confirm API 读取
        const waitStep = workflow.steps.find((s) => s.id === execResult.waitingStepId); // 待确认步
        const pauseSummary = `工作流已暂停，等待您确认关键步骤「${waitStep?.name ?? execResult.waitingStepId}」。\n${waitStep?.confirmationMessage ?? ""}`; // 用户可见暂停说明
        logWorkflow("step", {
          goal: workflow.goal, // 目标
          workflowId: workflow.id, // id
          waitingStepId: execResult.waitingStepId, // 待确认 id
          hitl: "pause", // HITL 暂停语义
        }); // HITL 暂停日志
        return apiJsonSuccess(
          withMemory({
            type: "workflow", // 仍走 workflow 卡片
            workflow, // 含 waiting_confirmation 步骤
            finalSummary: pauseSummary, // 暂停提示而非最终汇总
            paused: true, // 前端展示确认按钮
            waitingStepId: execResult.waitingStepId, // 对齐 confirm API
          })
        ); // 早返回：不生成 synthesizeWorkflowResult
      } // HITL 暂停返回结束

      const wfDone = workflow; // 保持后续变量命名兼容
      const wfElapsed = Date.now() - wfT0; // wall-clock 总耗时

      logWorkflow("done", {
        goal: wfDone.goal, // 目标回顾
        workflowId: wfDone.id, // 关联 id
        status: wfDone.status, // 最终状态
        durationMs: wfElapsed, // 总耗时
        steps: wfDone.steps.map((s) => ({ name: s.name, action: s.action, ms: s.durationMs })), // 每步摘要耗时
      }); // 工作流收尾日志

      const failedStep = wfDone.steps.find((s) => s.status === "failed"); // 首个失败步（用于错误文案）
      const finalSummary =
        wfDone.status === "success"
          ? await synthesizeWorkflowResult(wfDone, rt) // 全成功：模型揉成自然语言总答复
          : wfDone.status === "cancelled"
            ? "工作流已由用户取消，未继续执行后续步骤。" // 第18天：策略 A 取消文案
            : `工作流中断：${failedStep?.error || "未知错误"}`; // 失败步错误原因

      logAgent("result", {
        action: "workflow", // Agent 顶层动作为 workflow
        durationMs: wfElapsed, // 与 done 日志一致的总耗时
        success: wfDone.status === "success", // 是否完整跑通
      }); // Agent 结果日志

      return apiJsonSuccess(
        withMemory({ type: "workflow", workflow: wfDone, finalSummary, paused: false }) // 正常完成：含 workflow 与 memory
      ); // workflow 分支返回结束
    } // useWorkflow 分支结束

    // ---------- 单步路由分支（chat / weather / summary / todo）----------
    // 路由阶段不附带 buildMemory 里为「最终聊天」准备的 system 记忆块，只喂路由 system + shortTerm，
    // 避免同一段长记忆在提示里出现两次、干扰 JSON 格式输出。
    const routeResult = await invokeChatModel(rt, [
      { role: "system", content: buildRoutingSystemPrompt(memory) }, // 路由专用 system（含记忆块）
      ...memory.shortTerm.map((m) => ({ role: m.role, content: m.content })), // 仅短期对话作为路由上下文
    ]); // 路由模型调用
    if (!routeResult.ok) {
      return apiJsonReasonError(
        API_REASON.MODEL_UPSTREAM_FAILED,
        routeResult.text || API_REASON.MODEL_UPSTREAM_FAILED.msg
      ); // 502 统一包（上游失败）
    }

    const modelOutput = routeResult.text.trim(); // 路由模型输出文本
    let parsed = parseModelOutput(modelOutput); // 解析 JSON 路由结果
    const latestUser = getLatestUserText(memory.shortTerm); // 最新用户句
    parsed = {
      ...parsed, // 保留 content/keyword
      action: resolveContinuationAction(latestUser, parsed, memory), // 延续语义修正 action
    }; // 覆盖后的 parsed
    const toolInput = parsed.content || latestUser; // 各工具分支主输入：优先路由 content，空则用户原话
    const actionStart = Date.now(); // 动作阶段起始时间

    logAgent("route", {
      action: parsed.action, // 归一化后的动作
      input: toolInput, // 输入摘要
      shortTerm: memory.shortTerm.length, // 短期条数
      memoryItems: memory.items.length, // 长期条数
      memoryChars: memoryItemsCharLength(memory.items), // 长期字符规模
    }); // 路由日志

    switch (parsed.action) {
      case "weather": {
        const keyword = extractWeatherCity(parsed.keyword || parsed.content || latestUser); // 解析城市
        const result = await realWeather(keyword); // Open-Meteo 查询
        logAgent("result", {
          action: parsed.action, // 记录动作
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功标记
        }); // 结果日志
        return apiJsonSuccess(withMemory({ type: "weather", keyword: keyword || "未知", result })); // JSON 响应
      }
      case "summary": {
        const text = await summarizeWithModel(memory.shortTerm, toolInput, memory, rt); // 生成总结
        logAgent("result", {
          action: parsed.action, // 动作
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 日志
        return apiJsonSuccess(withMemory({ type: "summary", text })); // 响应
      }
      case "todo": {
        const items = await generateTodosWithModel({ userInput: toolInput, memory, rt }); // 生成待办
        logAgent("result", {
          action: parsed.action, // 动作
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 日志
        return apiJsonSuccess(withMemory({ type: "todo", items })); // 响应
      }
      default: {
        const chatContent =
          parsed.content.trim().length > 0
            ? parsed.content // 非空则直接用路由正文
            : await generateFallbackChat(modelMessages, rt); // 否则用 modelMessages 二次生成
        logAgent("result", {
          action: parsed.action, // 通常为 chat
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 日志
        return apiJsonSuccess(withMemory({ type: "chat", content: chatContent })); // 响应
      }
    } // switch 结束
  } catch (error) {
    logAgent("error", {
      success: false, // 失败
      durationMs: Date.now() - requestStart, // 总耗时
      error: error instanceof Error ? error.message : String(error), // 错误信息
    }); // 异常日志
    return apiJsonReasonError(API_REASON.INTERNAL); // 对外统一 500
  }
} // POST 结束
