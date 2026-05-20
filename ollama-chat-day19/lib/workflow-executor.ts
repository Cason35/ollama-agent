/**
 * Workflow 并行 DAG 执行器（含条件分支与 HITL）。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime";
import type { Memory } from "@/lib/workflow-types";
import type {
  ExecuteWorkflowResult,
  Workflow,
  WorkflowStep,
  WorkflowTimelineEvent,
} from "@/lib/workflow-types";
import { formatMemoryForPlanner } from "@/lib/chat-memory";
import {
  getLatestUserText,
  extractWeatherCity,
  realWeather,
  summarizeWithModel,
  generateTodosWithModel,
} from "@/lib/chat-tools";
import { runWorkflowChat, runWorkflowChatDirect } from "@/lib/workflow-planner";
import { topologicalSort } from "@/lib/workflow-validate";
import { logWorkflow } from "@/lib/workflow-log";

export const WORKFLOW_DEFAULT_STEP_RETRIES = 2;

// ========== 第17天：条件分支 Conditional DAG（每行均为中文行尾注释）==========

/** 第17天：从任意 judge 输出中提取 result 字段字符串（equals 主要比对目标）。 */
function getJudgeResultValue(sourceOutput: unknown): string {
  if (sourceOutput == null) return ""; // null/undefined：当作空串参与 equals/includes
  if (typeof sourceOutput === "string") {
    try {
      const p = JSON.parse(sourceOutput) as unknown; // 尝试把字符串解析成结构化 judge JSON
      return getJudgeResultValue(p); // 递归抽取内部 result：兼容模型输出「字符串化的 JSON」
    } catch {
      return sourceOutput.trim(); // 非 JSON：直接把原始字符串当作可比对的 result 文本
    } // try/catch 结束
  } // string 分支结束
  if (typeof sourceOutput === "object" && !Array.isArray(sourceOutput)) {
    const r = (sourceOutput as { result?: unknown }).result; // 读取 judge 对象的 result 字段
    if (typeof r === "string") return r.trim(); // result 为字符串：规范化空白并返回
    if (r != null) return JSON.stringify(r); // result 为非字符串：序列化成可比文本（少用）
    return ""; // result 缺失：返回空串表示未知
  } // object 分支结束
  return String(sourceOutput); // 其余原始类型：统一转字符串参与判定
} // getJudgeResultValue 结束

/** 第17天：收集当前已成功步骤的输出字典（skipped 不产生可供下游条件读取的输出条目）。 */
function buildSuccessStepOutputsRecord(steps: WorkflowStep[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}; // 初始化 id→output 映射容器
  for (const s of steps) {
    if (s.status !== "success") continue; // 非 success：跳过（skipped/failed/pending 均不写入）
    out[s.id] = s.output; // 写入该步骤最后一次成功输出对象引用
  } // for steps 结束
  return out; // 返回快照字典：evaluateCondition 只读使用该结构
} // buildSuccessStepOutputsRecord 结束

/** 第17天：根据 condition 判断是否应执行本步（无条件默认 true）。 */
function evaluateCondition(step: WorkflowStep, stepOutputs: Record<string, unknown>): boolean {
  if (!step.condition) return true; // 无条件步骤：不做分支裁剪判定
  const sourceOutput = stepOutputs[step.condition.fromStepId]; // 取出条件引用来源步骤的输出
  if (step.condition.operator === "equals") {
    return getJudgeResultValue(sourceOutput) === step.condition.value; // equals：对齐 judge.result 字符串级别相等
  } // equals 分支结束
  if (step.condition.operator === "includes") {
    return JSON.stringify(sourceOutput).includes(step.condition.value); // includes：序列化全文包含子串判断
  } // includes 分支结束
  if (step.condition.operator === "truthy") {
    return Boolean(sourceOutput); // truthy：JavaScript 真值语义快速闸门
  } // truthy 分支结束
  return false; // 未知 operator：保守不匹配（validateWorkflow 理应拦截）
} // evaluateCondition 结束

/** 第17天：执行 judge 步骤：约束模型输出 JSON（result/reason）。 */
async function runWorkflowJudge(args: {
  stepInput: string; // Planner 下发的判断任务文本（通常引用上游材料）
  chainSnapshot: string | undefined; // 并行批次冻结的线性前缀文本快照（Planner 漏依赖时的容错上下文）
  memory: Memory; // Memory：注入提示词以避免遗忘目标语境
  rt: ModelRuntime; // ModelRuntime：指向 Ollama 或 MiMo 网关
  depTextRaw: string; // 依赖合并文本：来自 dependsOn 成功输出的结构化拼接
  hasExplicitDeps: boolean; // 是否启用「依赖优先」提示结构（与 chat/summary 对齐）
}): Promise<{ result: string; reason: string }> {
  const memText = formatMemoryForPlanner(args.memory); // 生成 Planner 可读记忆块文本（供 judge 参考）
  const inputBlock =
    args.hasExplicitDeps && args.depTextRaw.trim()
      ? `【依赖步骤结果】\n${args.depTextRaw}\n\n【待判断输入】\n${args.stepInput}` // 依赖优先：显式先列上游产物再贴判断输入
      : [args.chainSnapshot ? `【前置步骤输出】\n${args.chainSnapshot}` : "", `【待判断输入】\n${args.stepInput}`] // 线性容错：前置链快照可选
          .filter(Boolean) // 去掉空段避免多余换行
          .join("\n\n"); // 组装最终 judge 输入正文块
  const judgePrompt = `
你是一个任务判断器。

请根据输入判断状态，只返回 JSON：

{
  "result": "complete" | "incomplete",
  "reason": "简短原因"
}

判断标准：
1. 是否有明确完成内容
2. 是否有遇到的问题
3. 是否有当前系统能力
4. 是否有下一步方向

输入：
${inputBlock}

长期记忆（仅供参考）：
${memText}
`.trim(); // judgePrompt：模板正文（模板字符串内不写行尾注释，语义见邻近变量说明）
  const { ok, text } = await invokeChatModel(args.rt, [{ role: "user", content: judgePrompt }]); // 单次补全拿到 judge JSON 文本
  if (!ok) return { result: "incomplete", reason: "模型暂不可用，判定失败" }; // 上游不可用：保守返回 incomplete，避免误判 complete
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/); // 从模型废话中提取第一段 {...} JSON 片段
    const parsed = JSON.parse(jsonMatch?.[0] || text) as { result?: unknown; reason?: unknown }; // 解析 JSON 对象为宽松结构
    const result = typeof parsed.result === "string" ? parsed.result.trim() : "incomplete"; // result：必须是可读字符串枚举
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : ""; // reason：可选用中文简述「为何如此判定」
    return { result: result || "incomplete", reason: reason || "" }; // 归一默认值：避免出现空字符串导致 equals 漂移
  } catch {
    return { result: "incomplete", reason: "输出不是合法 JSON，判定降级" }; // JSON 失败：降级 incomplete（分支更安全）
  } // try/catch 结束
} // runWorkflowJudge 结束

// ========== 第16天：并行 DAG 调度辅助（每行均为中文行尾注释）==========

/** 第16天：判断某步骤是否存在「已失败」或「已阻塞」的直接依赖（失败传播的一跳检测）。 */
function stepHasFailedOrBlockedDependency(
  step: WorkflowStep, // 当前待检查的步骤对象引用
  byId: Map<string, WorkflowStep> // id 到步骤对象的索引表，O(1) 解析依赖
): boolean {
  const depIds = step.dependsOn ?? []; // 取出依赖 id 列表；无依赖则为空数组
  for (const depId of depIds) {
    // 逐个依赖检查其运行时状态是否阻断下游执行
    const dep = byId.get(depId); // 通过 Map 查找依赖步骤；非法 id 时为 undefined
    if (!dep) continue; // 依赖不存在：此处不当作失败传播条件（应由 validate 拦住）
    if (dep.status === "failed" || dep.status === "blocked") return true; // 任一依赖失败/阻塞则本步不可再正常执行
  } // for depIds 结束
  return false; // 所有已存在依赖均非 failed/blocked：本步不因失败传播被一票否决
} // stepHasFailedOrBlockedDependency 结束

/** 第16天：将「仍 pending」但依赖已 failed/blocked 的步骤标记为 blocked（可多轮传递直到不动点）。 */
function propagateBlockedSteps(steps: WorkflowStep[], byId: Map<string, WorkflowStep>): void {
  let changed = true; // 控制不动点迭代：只要本轮写过 blocked 就可能继续触发链式阻塞
  let guard = 0; // 安全计数器：防止异常数据导致死循环
  while (changed && guard < steps.length + 8) {
    // 最多迭代「步数级」次：DAG 深度上界足够覆盖常见 Planner 规模
    changed = false; // 本轮先假设不会发生变化
    guard += 1; // 递增守护计数
    for (const s of steps) {
      // 扫描所有步骤：仅 pending 可能被升级为 blocked
      if (s.status !== "pending") continue; // 非 pending：不参与失败传播写入
      if (!stepHasFailedOrBlockedDependency(s, byId)) continue; // 依赖侧健康：保持 pending 等待调度
      s.status = "blocked"; // 显式标记阻塞：满足「失败沿依赖边向下游传播」的可观测语义
      s.error = s.error ?? "上游步骤失败或被阻塞，本步骤不再执行"; // 给前端/日志一个稳定的人类可读原因
      changed = true; // 标记本轮发生状态迁移，继续迭代以传递阻塞
    } // for s 结束
  } // while 不动点结束
} // propagateBlockedSteps 结束

/** 第16天：计算当前时刻可并行调度的 runnable steps（依赖均已 success 且自身仍为 pending）。 */
function getRunnableSteps(
  steps: WorkflowStep[], // 全量步骤数组（就地读写 status）
  byId: Map<string, WorkflowStep>, // id 索引：快速取依赖对象
  topoOrder: WorkflowStep[] // 拓扑稳定序：用于同批 runnable 的确定性排序
): WorkflowStep[] {
  const orderIdx = new Map<string, number>(); // stepId -> 在 topoOrder 中的下标
  for (let i = 0; i < topoOrder.length; i++) orderIdx.set(topoOrder[i]!.id, i); // 构建下标表：保证同批输出顺序稳定
  const runnable: WorkflowStep[] = []; // 收集本批可执行步骤
  for (const s of steps) {
    // 仅 pending 才可能进入 runnable（queued/running 表示已在途）
    if (s.status !== "pending") continue; // 跳过非 pending：避免重复调度
    const depIds = s.dependsOn ?? []; // 读取依赖列表
    let allDepsSuccess = true; // 假设依赖全成功，遇到反例即置 false
    for (const depId of depIds) {
      // 检查每个依赖是否已 success 或 skipped（第17天：skipped 表示另一条分支未选，不阻断并行汇合）
      const dep = byId.get(depId); // 取依赖对象
      if (!dep || (dep.status !== "success" && dep.status !== "skipped")) {
        // 依赖缺失或仍在途中：本步尚不可运行（pending/running/queued/failed/blocked 都会卡住调度）
        allDepsSuccess = false; // 标记依赖未满足
        break; // 提前结束内层循环
      } // if 结束
    } // for depIds 结束
    if (!allDepsSuccess) continue; // 依赖未齐：留在下一轮批次
    runnable.push(s); // 依赖满足且 pending：加入 runnable 集合
  } // for s 结束
  runnable.sort((a, b) => (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0)); // 按拓扑序稳定排序：日志/UI 更可读
  return runnable; // 返回本批将并行 await 的步骤列表
} // getRunnableSteps 结束

/** 第16天：工作流已全局失败后，将仍停留在 pending 的步骤统一标记为 blocked（避免 UI 悬挂「永远 pending」）。 */
function sweepPendingToBlockedWhenWorkflowFailed(steps: WorkflowStep[]): void {
  for (const s of steps) {
    // 遍历所有步骤寻找「未调度完成」的残留 pending
    if (s.status !== "pending") continue; // 非 pending：不需要扫尾
    s.status = "blocked"; // 全局失败后的未执行步骤：用 blocked 表达「被短路」
    s.error = s.error ?? "工作流已中断：本步骤未被调度执行"; // 给用户提供一致失败模型说明
  } // for s 结束
} // sweepPendingToBlockedWhenWorkflowFailed 结束

/** 第16天：把一批刚成功的步骤输出按拓扑序拼入 linearPriorOutputs（批次结束后串行合并，避免并发写字符串竞态）。 */
function mergeBatchSuccessOutputsToLinearChain(args: {
  batch: WorkflowStep[]; // 刚结束的这一批步骤对象列表
  topoOrder: WorkflowStep[]; // 全局拓扑序：决定拼接先后
  prior: string; // 合并前的线性链字符串
}): string {
  const idx = new Map<string, number>(); // stepId -> topoOrder 下标
  for (let i = 0; i < args.topoOrder.length; i++) idx.set(args.topoOrder[i]!.id, i); // 构建下标表
  const successes = args.batch.filter((s) => s.status === "success"); // 仅成功步骤贡献链式上下文
  successes.sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0)); // 稳定按拓扑序输出，避免并行完成顺序抖动
  let next = args.prior; // 从旧链开始累加
  for (const s of successes) {
    // 逐步把每个成功步骤的可读输出块拼到链尾
    const body = typeof s.output === "string" ? s.output : JSON.stringify(s.output ?? ""); // 与旧逻辑一致：对象 JSON 化
    next = [next, `[${s.name}]\n${body}`].filter(Boolean).join("\n\n"); // 以双换行分隔块，保持可读性
  } // for successes 结束
  return next; // 返回更新后的 linearPriorOutputs
} // mergeBatchSuccessOutputsToLinearChain 结束

/** 聚合依赖步骤的成功输出为一段注入文本（供下游工具 prompt 使用）。 */
function formatDependencyOutputsForStep(
  step: WorkflowStep,
  byId: Map<string, WorkflowStep>
): string {
  const ids = step.dependsOn ?? []; // 本步骤声明依赖的步骤 id 列表
  if (ids.length === 0) return ""; // 无依赖：下游工具不需要注入其它步输出
  const parts: string[] = []; // 收集每段「步骤名 + 输出正文」
  for (const depId of ids) {
    const dep = byId.get(depId); // 按 id 取依赖步骤运行时对象
    if (!dep || dep.status !== "success") continue; // 未执行或失败：不参与拼接，避免把错误混进 prompt
    const body = typeof dep.output === "string" ? dep.output : JSON.stringify(dep.output ?? ""); // 统一成可嵌入提示的字符串
    parts.push(`【${dep.name}】（id: ${depId}）\n${body}`); // 带可读标题与 id，便于模型区分来源
  } // 遍历依赖 id
  return parts.join("\n\n"); // 多段之间空行分隔，结构更清晰
}

export async function synthesizeWorkflowResult(workflow: Workflow, rt: ModelRuntime): Promise<string> {
  const ordered = topologicalSort(workflow.steps); // 第15天：与 Executor 一致走同名 topologicalSort 封装（仍基于 DAG）
  const lines = ordered
    .filter((s) => s.status === "success" || s.status === "skipped") // 第17天：skipped 分支也要进入汇总上下文（提示模型忽略未执行分支）
    .map((s) => {
      if (s.status === "skipped") {
        return `【步骤 ${s.name}】（${s.action}，id=${s.id}，skipped）\n${s.skipReason || "skipped"}`; // skipped：输出可读跳过原因而非工具产物
      } // skipped 分支结束
      const out =
        typeof s.output === "string" ? s.output : JSON.stringify(s.output ?? ""); // 序列化输出：对象则 JSON，字符串原样
      return `【步骤 ${s.name}】（${s.action}，id=${s.id}）\n${out}`; // 含 id 便于排障（模型可忽略括号内信息）
    }) // map 结束
    .join("\n\n"); // 步骤块之间双换行

  const prompt = `
你是 Workflow 最终汇总助手。

请把以下 workflow 的执行结果整合成一篇「自然、连贯、完整」的中文最终回答给用户。
不要使用「第一步 / 第二步」式的机械分段标题；让读者感觉是一个助手的一次性答复。
若结果是待办或要点，可适当保留可读列表，但整体语气要统一。
若有标注 skipped 的步骤，表示条件分支未选中：请在答复中自然忽略那条分支的产物。

以下为各步骤产出。

${lines || "(无可用步骤产出)"}

请直接输出正文，不要 JSON。
`.trim(); // 与文档“自然完整最终回答”一致

  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 仅 user 提示：由模型复读并润色为多步合一答复
  if (!ok) return lines || "工作流已完成。"; // 汇总模型失败：退回结构化步骤拼接文本或短句占位
  return text?.trim() || lines || "工作流已完成。"; // 优先模型润色正文，否则仍为步骤罗列或保底句
}
/** 第16天：读取工作流是否已失败（独立函数避免 TS 控制流把 status 收窄掉）。 */
function isWorkflowFailed(wf: Workflow): boolean {
  return wf.status === "failed"; // 仅做布尔判断：不把调用方 wf 的 status 收窄成非 failed
} // isWorkflowFailed 结束

/** 第18天：用户取消关键步后整单 cancelled（策略 A）。 */
function isWorkflowCancelled(wf: Workflow): boolean {
  return wf.status === "cancelled"; // 与 failed 分开判断，避免把 waiting_confirmation 当 failed
} // isWorkflowCancelled 结束

/** 第18天：cancelled 后将残留 pending 标为 blocked，避免 UI 悬挂。 */
function sweepPendingToBlockedWhenWorkflowCancelled(steps: WorkflowStep[]): void {
  for (const s of steps) {
    if (s.status !== "pending") continue; // 仅处理未调度 pending
    s.status = "blocked"; // 用户取消后不再执行
    s.error = s.error ?? "工作流已取消：本步骤未执行"; // 可读原因
  } // for 结束
} // sweepPendingToBlockedWhenWorkflowCancelled 结束
export async function executeWorkflow(
  workflow: Workflow, // 当前要执行并可被就地回填状态的工作流对象引用
  memory: Memory, // 本轮记忆快照：供 summary/todo/chat 读取 shortTerm/items
  rt: ModelRuntime, // Ollama 或 MiMo 的运行时密钥与模型路由信息
  execOpts: { timeline: WorkflowTimelineEvent[]; defaultStepRetries: number } // 时间线缓冲与全局默认额外重试次数
): Promise<ExecuteWorkflowResult> {
  let linearPriorOutputs = ""; // 已执行批次合并后的线性串联文本（Planner 漏写 dependsOn 时的容错上下文）
  const byId = new Map(workflow.steps.map((s) => [s.id, s])); // id→可变步骤指针，写入 output/status/duration/error
  const ordered = topologicalSort(workflow.steps); // 严禁按 Planner 数组盲跑：统一走 topologicalSort DAG 排序
  const appendTimeline = (message: string, stepId?: string) => {
    execOpts.timeline.push({ ts: Date.now(), message, stepId }); // 与时间线数组共享引用，向外累计事件
  }; // appendTimeline 闭包结束
  workflow.executionBatches = []; // 第16天：初始化批次记录数组，供前端 Batch Timeline 渲染

  /** 第16–17天：单步执行（含条件跳过与重试），读取批次开始时的链快照，避免同批并行互相污染线性前缀。 */
  async function runOneStepWithRetries(step: WorkflowStep, chainSnapshot: string): Promise<void> {
    const stepOutputsRecord = buildSuccessStepOutputsRecord(workflow.steps); // 第17天：汇总已成功步骤输出用于条件判定（字典快照）
    const shouldRun = evaluateCondition(step, stepOutputsRecord); // 第17天：计算本步是否命中 condition（无条件恒 true）
    if (step.condition) {
      const sourceOutput = stepOutputsRecord[step.condition.fromStepId]; // 取出 actual：对照 expected 便于日志排查 Planner 漂移
      console.log("[Condition]", {
        stepId: step.id, // 当前被判定步骤 id
        fromStepId: step.condition.fromStepId, // 条件引用来源步骤 id
        operator: step.condition.operator, // 判定算子枚举值
        expected: step.condition.value, // Planner 给予的期望值（equals/includes/truthy 语义各异）
        actual: sourceOutput, // 运行时真实来源输出对象引用
        matched: shouldRun, // 本次判定是否允许进入工具执行链
      }); // 文档§8.8：结构化 Condition Debug 日志（服务端 stderr）
    } // 仅在有 condition 字段时打印：避免无条件步骤噪声
    if (!shouldRun) {
      step.status = "skipped"; // 第17天：skipped 属于正常控制流而非 failed
      step.skipReason = "condition not matched"; // 固定原因文案：前端可展示「条件未命中」
      step.durationMs = 0; // 未调用模型：耗时记 0（与执行型步骤区分）
      appendTimeline(`${step.name}（${step.id}）skipped：condition not matched`, step.id); // Timeline：可观测跳过事件
      logWorkflow("step", {
        goal: workflow.goal, // 工作流目标：跨日志关联键
        stepId: step.id, // 步骤 id：与 Timeline 对齐
        step: step.name, // 可读名称：快速定位 Planner 条目
        action: step.action, // 原计划 action：虽未执行仍可记录意图
        status: step.status, // skipped：状态机落点
        parallel: true, // 并行执行器路径标记
      }); // 跳过分支结构化日志：便于检索「为何没跑」
      return; // 直接 return：跳过整个 retry/for 模型调用
    } // shouldRun 为 false 分支结束
    const retryField = step.retry; // Planner/调试可覆写的步骤级额外重试次数（不含首轮）
    const extraRetries =
      typeof retryField === "number" && Number.isFinite(retryField) && retryField >= 0
        ? Math.floor(retryField) // 合法数字：向下取整，避免小数污染 for 上限
        : execOpts.defaultStepRetries; // 未声明则继承全局默认值（通常为 2 次追加尝试）
    const maxAttempts = 1 + extraRetries; // 总尝试次数=首轮 + extraRetries（文档约定语义）
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const stepStart = Date.now(); // 单次尝试起点：duration 覆盖整条「含重试」区间更利于排障
      step.status = "running"; // 进入执行态（重试亦然：保持对用户可见的一致性）
      step.error = undefined; // 新一轮尝试前清空历史错误摘要，避免成功仍残留陈旧文案
      if (attempt === 0) {
        appendTimeline(`${step.name}（${step.id}）started · 并行批次执行`, step.id); // 第一次开始：打点 started（带并行语义）
      } else {
        appendTimeline(`步骤 ${step.id} retry #${attempt}`, step.id); // 重试语义：对齐 trace 范本里的 retry #n 文案风格
        console.log("[Workflow] step retry", { stepId: step.id, attempt, maxAttempts }); // 服务端 stderr 并排输出结构化重试计数
      } // attempt 分支结束
      const depTextRaw = formatDependencyOutputsForStep(step, byId); // 显示式 dependsOn：拼已成功依赖的输出
      const hasExplicitDeps = Boolean(step.dependsOn?.length); // 是否与 Day14 「显式依赖链」语义一致（非仅用线性前缀）
      const injectedPreview = hasExplicitDeps ? depTextRaw : chainSnapshot || ""; // 注入预览：显式依赖优先，否则用批次开始时的链快照
      step.injectedContextPreview = injectedPreview || undefined; // 继续把注入快照暴露给前端 details 调试区
      const linearChainPrefix = !hasExplicitDeps ? chainSnapshot || undefined : undefined; // summary/todo/chat 的线性前缀参数（冻结快照）
      const dependencyTodoContext = hasExplicitDeps ? depTextRaw || undefined : undefined; // todo.generateTodosWithModel dependencyContext
      logWorkflow("step", {
        goal: workflow.goal, // 目标回顾：跨多请求的关联键之一
        stepId: step.id, // id：与 Timeline 打点一致
        step: step.name, // 可读名称便于肉眼扫日志
        action: step.action, // 工具枚举：定位 switch 分支
        status: step.status, // 预期 running（即使重试仍为 running）
        dependsOn: step.dependsOn ?? [], // Planner 给定依赖快照
        hasExplicitDeps, // 布尔：区分 depText vs chainSnapshot
        attempt, // 当前尝试序号，便于排查偶发抖动
        parallel: true, // 第16天：标记该 step 日志来自并行执行器
      }); // step 起始日志对象结束
      try {
        let out: unknown; // 占位：由各 action 分支写入真实工具产物
        if (step.action === "judge") {
          out = await runWorkflowJudge({
            stepInput: step.input, // judge 的任务文本：通常描述「要判定什么」
            chainSnapshot, // 并行快照前缀：补齐 Planner 漏依赖时的材料上下文
            memory, // Memory：注入 judgePrompt 以满足「结合长期语境判定」
            rt, // ModelRuntime：路由到具体模型后端
            depTextRaw, // 已成功依赖步骤输出拼接文本：hasExplicitDeps 时优先注入
            hasExplicitDeps, // 是否采用依赖优先输入结构（与 summary/todo 一致）
          }); // runWorkflowJudge：结构化输出对象 {result,reason}
        } else if (step.action === "summary") {
          out = await summarizeWithModel(
            memory.shortTerm, // 短期对话：总结上下文主材料
            step.input, // Planner 的焦点补充或材料提示字符串
            memory, // 长期 items：为高优先级语境提供「目标锚点」
            rt, // 模型调用参数：baseUrl/model/key
            hasExplicitDeps ? depTextRaw || undefined : linearChainPrefix // dependency-first vs linear-prefix（快照）
          ); // await summarizeWithModel
        } else if (step.action === "todo") {
          out = await generateTodosWithModel({
            userInput: step.input, // todo 这一步的自然语言指令
            memory, // 记忆：延续个性化待办
            rt, // 模型运行时
            chainPrefix: linearChainPrefix, // 无 dependsOn 时链路兜底文本
            dependencyContext:
              dependencyTodoContext && dependencyTodoContext.trim().length > 0
                ? dependencyTodoContext // 非空则用显式 dependency prompt 构造
                : undefined, // 空串视为无依赖语义，不传参
          }); // generateTodosWithModel 结束
        } else if (step.action === "weather") {
          const latestUser = getLatestUserText(memory.shortTerm); // 兜底：城市名往往在最新 user utterance
          const stepText =
            step.input && step.input !== "[object Object]" ? step.input : ""; // Planner 与城市抽取的安全 input
          const keyword = extractWeatherCity(stepText || latestUser); // 规整到支持的 cityMap 关键字
          out = await realWeather(keyword); // Open-Meteo：可能因网络抖动抛错触发 retry
        } else if (hasExplicitDeps && depTextRaw.trim()) {
          out = await runWorkflowChatDirect(
            `【依赖步骤结果】\n${depTextRaw}\n\n【当前任务】\n${step.input}`, // 依赖型 chat/direct 合二为一提示结构
            memory, // 记忆 system 注入保持不变
            rt // 运行时
          ); // runWorkflowChatDirect 结束
        } else {
          out = await runWorkflowChat(step.input, chainSnapshot || undefined, memory, rt); // 默认前置链（快照）+ 本步指令
        } // action dispatch 分支结束
        step.output = out; // 成功：回填 output 供 summarize + 前端 excerpts
        step.status = "success"; // lifecycle：success
        step.durationMs = Date.now() - stepStart; // 记录最近一次成功尝试耗时（毫秒）
        console.log("[Workflow] output:", step.output); // stderr 原始打印：快速对照 Timeline
        appendTimeline(`${step.name}（${step.id}）success`, step.id); // trace：成功打点（对齐 Day15 范本）
        logWorkflow("step", {
          goal: workflow.goal, // 冗余 goal：便于分布式 grep
          stepId: step.id, // id：二次确认
          step: step.name, // name：人类友好
          action: step.action, // action：回看工具
          status: step.status, // success
          durationMs: step.durationMs, // ms 统计
          dependsOn: step.dependsOn ?? [], // deps
          injectedContextPreview: step.injectedContextPreview, // 预览串
          attempt, // 成功发生在第几次尝试也能被日志捕获
          parallel: true, // 第16天：并行执行成功收尾日志
        }); // step 成功结构化日志结束
        return; // 本 step 全流程完成：结束该 Promise
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err); // 统一 stringify 捕获到的异常摘要
        step.durationMs = Date.now() - stepStart; // 失败也把本轮 wall-clock 记到字段里，方便 UI 徽章
        if (attempt < maxAttempts - 1) {
          appendTimeline(`步骤 ${step.id} 失败（将进入重试）：${msg}`, step.id); // 仍为可恢复的失败：打点但不终结 workflow
          console.warn("[Workflow] step attempt failed", { stepId: step.id, attempt, msg }); // warn：避免与 error 混级
          continue; // for attempt：下一轮重试
        } // 还可重试分支结束
        step.status = "failed"; // 用尽次数仍失败：该 step lifecycle 设为 failed
        step.error = msg; // UI 可读错误摘录
        workflow.status = "failed"; // 全局 workflow 设为 failed（遇错即停整体语义仍保留）
        appendTimeline(`步骤 ${step.id} 失败（已用尽重试）：${msg}`, step.id); // trace：终结性失败说明
        logWorkflow("error", {
          goal: workflow.goal, // goal：保留上下文锚
          stepId: step.id, // 失败 id
          step: step.name, // 步骤名：快速定位 Planner 条目
          action: step.action, // 工具枚举，辅助判断重试价值
          status: step.status, // failed
          error: step.error, // 错误串
          durationMs: step.durationMs, // 最后尝试耗时
          attempts: maxAttempts, // 一眼可见总尝试次数
          parallel: true, // 第16天：并行执行失败日志
        }); // error 日志结束
        return; // 结束该 Promise：同批其它任务仍可继续完成
      } // try/catch 结束
    } // attempt for 结束
  } // runOneStepWithRetries 结束

  let batchIndex = 0; // 第16天：批次计数器，从 1 开始写入 executionBatches
  while (true) {
    // 主调度循环：直到没有 pending 或 workflow 已失败短路
    propagateBlockedSteps(workflow.steps, byId); // 每轮先失败传播：pending 且依赖 failed/blocked -> blocked
    const pendingLeft = workflow.steps.some((s) => s.status === "pending"); // 是否仍存在未决的 pending 步骤
    if (!pendingLeft) break; // 没有 pending：调度结束（成功或已全部 blocked/failed/success）
    if (isWorkflowFailed(workflow)) {
      // 若已在并行批次中产生失败：不再继续调度新批次
      sweepPendingToBlockedWhenWorkflowFailed(workflow.steps); // 将残留 pending 统一标记为 blocked，避免 UI 悬挂
      break; // 跳出主循环：保留 partial trace 与批次记录
    } // failed 短路分支结束
    if (isWorkflowCancelled(workflow)) {
      // 第18天：用户取消后停止调度
      sweepPendingToBlockedWhenWorkflowCancelled(workflow.steps); // 扫尾 pending
      break; // 跳出主循环
    } // cancelled 短路分支结束
    const runnable = getRunnableSteps(workflow.steps, byId, ordered); // 计算当前可并行执行集合（入度为 0 的动态变体）
    if (runnable.length === 0) {
      // 无可运行步骤但仍存在 pending：属于异常/不可满足依赖态
      for (const s of workflow.steps) {
        // 尝试把剩余 pending 标记为 blocked 并给出可读原因
        if (s.status !== "pending") continue; // 非 pending 不需要处理
        s.status = "blocked"; // 标记阻塞：防止死循环空转
        s.error = s.error ?? "调度器无法找到可运行步骤：请检查依赖图或上游状态是否一致"; // 给排障提示
      } // for s 结束
      workflow.status = "failed"; // 将整体工作流标为失败更符合「未完整执行」语义
      break; // 终止循环
    } // runnable 空分支结束
    const hitlStep = runnable.find((s) => s.requiresConfirmation && !s.confirmed); // 第18天：本批中首个需确认且未确认的步（runnable 已拓扑排序）
    if (hitlStep) {
      hitlStep.status = "waiting_confirmation"; // 暂停态：非 failed、非 skipped
      appendTimeline(
        `⏸️ ${hitlStep.name}（${hitlStep.id}）等待用户确认：${hitlStep.confirmationMessage || "是否继续执行？"}`,
        hitlStep.id
      ); // HITL Timeline：等待确认
      console.log("[HITL]", {
        workflowId: workflow.id, // 工作流实例 id
        stepId: hitlStep.id, // 待确认步骤 id
        status: hitlStep.status, // waiting_confirmation
        decision: "pause", // 本次为暂停而非用户决策
      }); // 文档§8.8：HITL 结构化调试日志
      workflow.status = "running"; // 整单仍为 running（暂停中，非 failed）
      workflow.executionTimeline = execOpts.timeline; // 挂载当前 timeline 供前端展示
      return { workflow, paused: true, waitingStepId: hitlStep.id }; // 提前返回：不进入 Promise.all
    } // HITL 暂停分支结束
    batchIndex += 1; // 递增批次号：Batch #1,#2,...
    const batchTs = Date.now(); // 记录批次开始时间戳：用于 executionBatches 与 Timeline 对齐
    workflow.executionBatches!.push({
      batchIndex, // 写入批次序号：前端直接展示
      stepIds: runnable.map((s) => s.id), // 写入本批并行 stepIds：前端 DAG/Batch UI 使用
      ts: batchTs, // 写入批次时间：与 executionTimeline 同一时钟域
    }); // push 结束
    appendTimeline(
      `调度批次 #${batchIndex}（并行 ${runnable.length} 步）：${runnable.map((s) => `${s.name}(${s.id})`).join("、")}`, // 中文可读批次边界说明
      undefined // 批次级事件：不强绑定单一 stepId
    ); // appendTimeline 结束
    for (const s of runnable) {
      // 将本批步骤从 pending 显式迁移到 queued：强化状态机语义
      s.status = "queued"; // queued：已被调度器选中，将立刻进入 running
      appendTimeline(`${s.name}（${s.id}）queued · 批次 #${batchIndex}`, s.id); // 队列打点：便于对齐 batch timeline
    } // for queued 结束
    const chainSnapshot = linearPriorOutputs; // 冻结本批开始前的线性链：避免同批并行读写竞态
    await Promise.all(runnable.map((step) => runOneStepWithRetries(step, chainSnapshot))); // 第16天核心：层内并行 await
    appendTimeline(`调度批次 #${batchIndex} 已结束（本批共 ${runnable.length} 步）`, undefined); // 批次收尾打点：并行边界清晰化
    linearPriorOutputs = mergeBatchSuccessOutputsToLinearChain({
      batch: runnable, // 传入本批对象列表：函数内部按 success 过滤
      topoOrder: ordered, // 传入拓扑序：合并输出稳定
      prior: chainSnapshot, // 传入批次前链：在快照基础上追加本批成功输出
    }); // merge 结束
    propagateBlockedSteps(workflow.steps, byId); // 批次后再次传播：如果本批产生 failed，则尽快阻塞下游 pending
    if (isWorkflowFailed(workflow)) {
      // 若本批任一 step 最终失败：workflow.status 已在 runOneStepWithRetries 内设置
      sweepPendingToBlockedWhenWorkflowFailed(workflow.steps); // 全局失败扫尾：未调度步骤统一 blocked
      break; // 停止继续进入下一批次
    } // 本批后失败检测结束
  } // while 主循环结束

  if (workflow.status !== "failed" && workflow.status !== "cancelled") workflow.status = "success"; // 未失败/未取消则整体成功
  return { workflow }; // 第18天：返回包装对象（无暂停）
} // executeWorkflow 函数结束（第16–18天并行 DAG + HITL 版）

/** 第19天：从已保存快照续跑（不重新 planWorkflowSteps，任务 6）。 */
export async function continueWorkflow(
  savedWorkflow: Workflow, // 持久化或 pause-store 中的工作流
  memory: Memory, // 记忆快照
  rt: import("@/lib/model-runtime").ModelRuntime, // 模型运行时
  execOpts: {
    timeline: WorkflowTimelineEvent[]; // 共享时间线
    defaultStepRetries: number; // 步骤重试配置
  }
): Promise<ExecuteWorkflowResult> {
  return executeWorkflow(savedWorkflow, memory, rt, execOpts); // 直接委托执行器：已成功步不会重跑
} // continueWorkflow 结束

/** 第18天：用户取消关键步（策略 A：整单 cancelled）。 */
export function applyWorkflowUserCancel(
  workflow: Workflow,
  stepId: string,
  timeline: WorkflowTimelineEvent[]
): Workflow {
  const step = workflow.steps.find((s) => s.id === stepId);
  if (step) {
    step.status = "skipped";
    step.skipReason = "user cancelled";
  }
  workflow.status = "cancelled";
  timeline.push({
    ts: Date.now(),
    stepId,
    message: `用户取消步骤 ${stepId}，工作流已终止（策略 A）`,
  });
  sweepPendingToBlockedWhenWorkflowCancelled(workflow.steps);
  console.log("[HITL]", {
    workflowId: workflow.id,
    stepId,
    status: step?.status ?? "unknown",
    decision: "cancel",
  });
  return workflow;
}
