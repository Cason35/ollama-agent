/**
 * Workflow Planner：拆步、解析与步骤内 chat 执行。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime";
import type { Memory } from "@/lib/workflow-types";
import { formatMemoryForPlanner } from "@/lib/chat-memory";
import { formatToolsForPlanner } from "@/lib/tool-registry";
import { workflowToolRegistry } from "@/lib/workflow-tools";
export { runWorkflowChat, runWorkflowChatDirect } from "@/lib/workflow-chat";
import type {
  WorkflowStep,
  WorkflowStepAction,
  WorkflowStepCondition,
} from "@/lib/workflow-types";

export function normalizeWorkflowAction(raw: unknown): WorkflowStepAction {
  if (raw === "weather" || raw === "search") return "weather"; // 天气与 search 别名统一为 weather
  if (raw === "summary") return "summary"; // 总结步骤
  if (raw === "todo") return "todo"; // 待办生成步骤
  if (raw === "judge") return "judge"; // 第17天：结构化判断节点
  return "chat"; // 默认走普通对话
}
/** 工作流 action 白名单（第22天：由 Tool Registry 动态生成，见 workflow-tools.ts）。 */
export { WORKFLOW_ALLOWED_ACTIONS } from "@/lib/workflow-tools";

/** 第15天：当步骤本体未给出 retry 字段时采用的默认「失败后可追加尝试次数」（不含首轮）。 */
export const WORKFLOW_DEFAULT_STEP_RETRIES = 2; // 等价于首轮 + 最多 2 次重试，共 3 次机会（confirm 续跑复用）

/** Planner 输出的单步草案（可为每步提供稳定 id 与依赖 id 列表）。 */
type PlannerPlanItem = {
  /** Planner 可选输出；缺省时由服务端分配 step-1 / step-2… */
  id?: string;
  name: string; // 步骤展示名
  action: WorkflowStepAction; // 工具枚举
  input: string; // 送入工具的字符串（已由 normalizePlannerStepInput 规范）
  /** 需要其输出的前置步骤 id（与 WorkflowStep.id 对齐）。 */
  dependsOn?: string[];
  /** 第17天：可选条件分支约束（相对 fromStepId 的输出）。 */
  condition?: WorkflowStepCondition; // undefined：无条件步骤
  /** 第18天：执行前是否需用户确认（HITL）。 */
  requiresConfirmation?: boolean; // true 时 Executor 在调用模型前暂停
  /** 第18天：展示给用户的确认文案。 */
  confirmationMessage?: string; // requiresConfirmation 时应非空（可 repair）
};

/** finalizePlannerPlanItems 之后每条步骤均有稳定 id（用于 dependsOn）。 */
type FinalizedPlannerPlanItem = Omit<PlannerPlanItem, "id"> & { id: string };

/**
 * Planner 有时会把 input 写成对象（如 { city: "北京" }）；直接 String(obj) 会得到 "[object Object]"。
 * 这里优先抽取常见字段，否则 JSON 序列化，保证下游天气解析与前端展示可读。
 */
function normalizePlannerStepInput(raw: unknown): string {
  if (raw == null) return ""; // null/undefined 视为无输入
  if (typeof raw === "string") return raw.trim(); // 字符串直接裁剪空白
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw); // 标量转成可读字符串
  if (Array.isArray(raw)) {
    try {
      return JSON.stringify(raw); // 数组整体 JSON 化，避免 [object Object]
    } catch {
      return ""; // 序列化失败则空串
    }
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>; // 断言为字典便于按键取值
    const preferKeys = [
      // 常见「自然语言入口」字段名，优先抽到可展示/可传给工具的字符串
      "city",
      "location",
      "place",
      "keyword",
      "query",
      "content",
      "text",
      "prompt",
      "input",
      "description",
    ];
    for (const key of preferKeys) {
      const v = o[key]; // 读取候选键对应的值
      if (typeof v === "string" && v.trim()) return v.trim(); // 首个非空字符串即作为步骤 input
    }
    try {
      return JSON.stringify(o); // 无常见键则整体 JSON（仍优于 [object Object]）
    } catch {
      return ""; // stringify 异常则退回空
    }
  }
  return String(raw).trim(); // 其余类型统一 toString 再 trim
}

/** 第17天：把 Planner 任意对象解析为 WorkflowStepCondition（字段不合法则返回 undefined）。 */
function parseWorkflowConditionFromUnknown(raw: unknown): WorkflowStepCondition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined; // 仅接受「非数组对象」作为 condition 载体
  const o = raw as Record<string, unknown>; // 以字典方式读取 Planner JSON 片段
  const fromStepId = typeof o.fromStepId === "string" ? o.fromStepId.trim() : ""; // fromStepId：必须是 Trim 后非空字符串才有意义
  const opRaw = o.operator; // operator：原始字段（可能是字符串也可能是缺失）
  const operator =
    opRaw === "equals" || opRaw === "includes" || opRaw === "truthy" ? opRaw : undefined; // 收窄到三类合法运算符
  const value = typeof o.value === "string" ? o.value : ""; // value：统一成字符串（缺失则空串）
  if (!fromStepId || !operator) return undefined; // fromStepId 与 operator 任一缺失都无法构造可靠条件
  if ((operator === "equals" || operator === "includes") && !value.trim()) return undefined; // equals/includes：必须有非空 value（避免误判）
  return { fromStepId, operator, value }; // 返回结构化 condition：供 finalize 与 validate 消费
} // parseWorkflowConditionFromUnknown 结束

/** 解析 Planner 返回的 JSON 数组（允许多级容错）。 */
function parsePlannerPlanOutput(modelOutput: string): PlannerPlanItem[] {
  try {
    const parsed = JSON.parse(modelOutput) as unknown; // 尝试整段解析为 JSON
    if (!Array.isArray(parsed)) return []; // 非数组失败
    const out: PlannerPlanItem[] = []; // 累积合法步骤
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue; // 跳过非法元素
      const idRaw = (row as { id?: unknown }).id; // Planner 可选提供的步骤 id（原始未知类型）
      const idCandidate = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : undefined; // 仅非空字符串才采纳，否则留 undefined 待 finalize 补全
      const depRaw = (row as { dependsOn?: unknown }).dependsOn; // 依赖 id 列表的原始值
      const dependsOn = Array.isArray(depRaw)
        ? depRaw
            .filter((d): d is string => typeof d === "string" && d.trim().length > 0) // 过滤掉非字符串与空串
            .map((d) => d.trim()) // 统一去掉首尾空白，避免依赖匹配失败
        : []; // 非数组则视为无依赖
      const name = String((row as { name?: unknown }).name || "").trim() || "步骤"; // 步骤名
      const input = normalizePlannerStepInput((row as { input?: unknown }).input); // 步骤输入（兼容对象）
      const action = normalizeWorkflowAction((row as { action?: unknown }).action); // 动作
      const condition = parseWorkflowConditionFromUnknown((row as { condition?: unknown }).condition); // 第17天：可选 condition（不存在则为 undefined）
      const requiresConfirmation = (row as { requiresConfirmation?: unknown }).requiresConfirmation === true; // 第18天：Planner 布尔字段
      const confirmationMessageRaw = (row as { confirmationMessage?: unknown }).confirmationMessage; // 第18天：确认文案原始值
      const confirmationMessage =
        typeof confirmationMessageRaw === "string" ? confirmationMessageRaw.trim() : ""; // 规范为 trim 字符串
      out.push({
        id: idCandidate,
        name,
        action,
        input: input || name,
        dependsOn: dependsOn.length ? dependsOn : undefined,
        ...(condition ? { condition } : {}), // 有条件对象才展开写入：避免写入 undefined 键
        ...(requiresConfirmation
          ? {
              requiresConfirmation: true, // 标记需 HITL
              ...(confirmationMessage ? { confirmationMessage } : {}), // 有文案才写入
            }
          : {}), // 第18天：HITL 字段
      }); // 缺 input 时用 name 占位
    }
    return out; // 返回解析结果
  } catch {
    const jsonMatch = modelOutput.match(/\[[\s\S]*\]/); // 抽取首个数组片段
    if (jsonMatch) {
      return parsePlannerPlanOutput(jsonMatch[0]); // 递归解析子串
    }
    return []; // 完全失败
  }
}

/** 补全 Planner 步骤的稳定 id，并裁剪 dependsOn 中不存在的引用。 */
function finalizePlannerPlanItems(items: PlannerPlanItem[]): FinalizedPlannerPlanItem[] {
  const withIds: FinalizedPlannerPlanItem[] = items.map((it, i) => ({
    ...it, // 保留 name/action/input/dependsOn 等字段
    id: it.id ?? `step-${i + 1}`, // Planner 未给 id 时用 1-based 稳定缺省名
  })); // 第一轮：保证每条都有字符串 id
  const used = new Set<string>(); // 记录已占用的 id，用于检测冲突
  for (let i = 0; i < withIds.length; i++) {
    let id = withIds[i].id; // 当前步骤 id（可能被改写）
    if (used.has(id)) {
      id = `step-${i + 1}-${globalThis.crypto.randomUUID().slice(0, 8)}`; // 冲突则追加短随机后缀，保证全局唯一
      withIds[i] = { ...withIds[i], id }; // 写回修正后的 id
    } // 冲突处理结束
    used.add(id); // 登记当前 id 为已使用
  } // for 遍历所有步骤
  const idSet = new Set(withIds.map((x) => x.id)); // 合法 id 集合，用于裁剪无效 dependsOn
  return withIds.map((it) => ({
    ...it, // 展开步骤其它字段
    dependsOn: it.dependsOn?.filter((d) => idSet.has(d)), // 去掉指向不存在步骤的依赖边，避免执行器找不到 dep
  })); // 返回最终可执行的计划项
}

/** 按 dependsOn 拓扑排序步骤（同一 DAG 仍保持深度优先相对稳定）。 */
export function topologicalSortWorkflowSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const byId = new Map(steps.map((s) => [s.id, s])); // id -> 步骤对象，便于 O(1) 查依赖
  const visiting = new Set<string>(); // DFS 栈上的节点：用于环检测
  const done = new Set<string>(); // 已完成访问并入序的节点
  const ordered: WorkflowStep[] = []; // 拓扑序结果（依赖在前）

  function visit(step: WorkflowStep): void {
    if (done.has(step.id)) return; // 已排序过则跳过
    if (visiting.has(step.id)) {
      console.warn("[Workflow] dependency cycle at step:", step.id); // 环：依赖指向了正在访问的祖先
      return; // 环上节点不再深入，避免无限递归
    } // 环检测分支结束
    visiting.add(step.id); // 标记进入当前子 DAG
    for (const depId of step.dependsOn ?? []) {
      const dep = byId.get(depId); // 解析依赖 id 到步骤；非法 id 则 dep 为 undefined
      if (dep) visit(dep); // 先递归访问所有依赖
    } // 依赖循环结束
    visiting.delete(step.id); // 回溯：离开当前节点子树
    done.add(step.id); // 标记本节点已完成
    ordered.push(step); // 后序追加：保证依赖先于当前步出现在 ordered 中
  } // visit 定义结束

  for (const s of steps) visit(s); // 对每个根/孤立节点启动 DFS，覆盖全图

  if (ordered.length < steps.length) {
    for (const s of steps) {
      if (!done.has(s.id)) ordered.push(s); // 环或脏依赖导致未入序的步骤，按原列表顺序追加兜底
    } // 补全循环结束
  } // 长度不一致时的修复
  return ordered; // 返回可能含「末尾兜底块」的执行顺序
}
/** Workflow Planner：把用户复杂需求拆成 1-4 个可执行步骤。 */
export async function planWorkflowSteps(
  userInput: string,
  memory: Memory,
  rt: ModelRuntime
): Promise<FinalizedPlannerPlanItem[]> {
  const memText = formatMemoryForPlanner(memory); // 长期记忆文本（供 Planner 结合语境拆步）
  const toolPrompt = formatToolsForPlanner(workflowToolRegistry); // 第22天：从 Registry 动态生成
  const plannerPrompt = `
你是一个 Workflow Planner。

请把用户需求拆解成 2-5 个可执行步骤（若需求很简单则只返回 1 个步骤）。

可用工具（action 必须与工具 name 一致）：

${toolPrompt}

judge 补充说明：只输出 JSON：{"result":"complete"|"incomplete"|"...","reason":"..."}，用于后续条件分支
weather 补充说明：input 写城市名短句（如「北京天气」），不要嵌套 JSON 对象

条件分支（第17天核心）：
当用户需求包含「如果…就…」「判断…然后…」「根据结果…」「不完整则…/完整则…」等模式时：
1) 先用 judge 产出结构化 result（例如 complete/incomplete，或自定义枚举但要与后续 condition.value 对齐）
2) 下游分支步骤必须 dependsOn judge 步骤 id，并添加 condition 字段：

"condition": {
  "fromStepId": "step-1",
  "operator": "equals",
  "value": "complete"
}

operator 只能是："equals" | "includes" | "truthy"
- equals：比对 judge 输出的 result 字符串（最常用）
- includes：在来源输出序列化文本中包含 value 子串
- truthy：来源输出真值判定（value 可填空字符串）

务必把 condition.fromStepId 放进 dependsOn（若漏写服务端会尝试 repair，但希望你一次性写对）。

人工确认（第18天 HITL）：
当步骤属于以下类型时，请设置 requiresConfirmation=true 并提供 confirmationMessage：
1) 最终提交、定稿、发布
2) 删除、覆盖、发送等可能不可逆操作
3) 用户明确要求「最终版」「提交版」
4) 可能产生不可逆或高风险结果

示例：
"requiresConfirmation": true,
"confirmationMessage": "即将生成最终提交版总结，是否继续？"

要求：
1. 只返回 JSON 数组
2. 每个步骤必须包含：id（稳定唯一）、name、action、input（字符串）；天气步骤写城市名短句；不要嵌套 JSON 对象充当 input
3. 若某一步需要直接使用前面步骤产出：dependsOn 写入前置 id 列表
4. 条件分支步骤必须同时包含 dependsOn 与 condition（且 fromStepId 指向判定步骤）
5. 不要输出解释

用户需求：
${userInput}

长期记忆：
${memText}
`.trim(); // Planner 提示词：覆盖 Conditional DAG 编排约束

  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: plannerPrompt }]); // 调用模型生成步骤 JSON
  if (!ok) {
    return finalizePlannerPlanItems([{ name: "理解与回应", action: "chat", input: userInput }]); // 模型不可用：单步 chat 兜底
  }
  const trimmedRaw = raw.trim(); // 去掉模型输出首尾空白
  const steps = parsePlannerPlanOutput(trimmedRaw); // 解析为 PlannerPlanItem 列表
  if (steps.length === 0) {
    return finalizePlannerPlanItems([{ name: "理解与回应", action: "chat", input: userInput }]); // 解析不到步骤则同样单步兜底
  }
  return finalizePlannerPlanItems(steps); // 返回规划结果供执行器消费
}

