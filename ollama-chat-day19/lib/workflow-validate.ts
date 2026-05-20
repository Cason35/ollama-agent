/**
 * Workflow 静态校验与自动修复。
 */
import type { Workflow, WorkflowStep, WorkflowStepAction } from "@/lib/workflow-types";
import {
  topologicalSortWorkflowSteps,
  normalizeWorkflowAction,
  WORKFLOW_ALLOWED_ACTIONS,
} from "@/lib/workflow-planner";

function kahnWorkflowTopology(steps: WorkflowStep[]): {
  acyclic: boolean; // true 表示所有节点都能被 Kahn 弹出（即无环）
  topoOrder: string[]; // Kahn 过程中弹出的 id 顺序（可作为合法执行序参考）
  errors: string[]; // 若发现环则返回包含中文说明的错误列表（通常仅一条）
} {
  const idSet = new Set(steps.map((s) => s.id)); // 当前所有步骤 id 的快照集合，用于过滤非法依赖边
  const inDegree = new Map<string, number>(); // 每个节点入度：有多少条来自有效 dependsOn 的入边
  const adj = new Map<string, string[]>(); // 邻接表：fromId -> [toId,...]，语义为 to 依赖 from，必须先完成 from
  for (const s of steps) {
    inDegree.set(s.id, 0); // 初始化入度为 0，后续仅对有效边累加
    adj.set(s.id, []); // 初始化空邻接表桶，避免 get 时 undefined
  } // 初始化 for 结束
  for (const s of steps) {
    for (const depId of s.dependsOn ?? []) {
      if (!idSet.has(depId)) continue; // 指向不存在 id 的边在这里忽略（其它校验会单独报「引用不存在」）
      inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1); // s 依赖 depId：depId 完成后 s 入度应记一条来自 dep 的约束
      const bucket = adj.get(depId)!; // depId 出发的后继列表（必然存在，因 depId 必为某步 id）
      bucket.push(s.id); // 记录边 depId -> s.id
    } // 依赖循环结束
  } // 构图 for 结束
  const queue: string[] = []; // 入度为 0 的节点队列（可立即执行的步骤 id）
  for (const s of steps) {
    if ((inDegree.get(s.id) ?? 0) === 0) queue.push(s.id); // 没有任何有效入边的节点先入队
  } // 初始队列构建结束
  const topoOrder: string[] = []; // 记录被弹出顺序，用于与 steps.length 对比判断是否全部处理
  while (queue.length > 0) {
    const cur = queue.shift()!; // 取出一个当前可执行节点 id
    topoOrder.push(cur); // 写入拓扑序输出
    for (const nxt of adj.get(cur) ?? []) {
      const nextDeg = (inDegree.get(nxt) ?? 0) - 1; // 去掉 cur->nxt 这条约束后 nxt 入度减一
      inDegree.set(nxt, nextDeg); // 写回更新后的入度
      if (nextDeg === 0) queue.push(nxt); // 新变成可执行的节点入队
    } // 扩展后继循环结束
  } // Kahn 主循环结束
  const acyclic = topoOrder.length === steps.length; // 若弹出数量不足说明剩余子图入度均非 0（典型为有环）
  const errors: string[] = []; // 错误收集器
  if (!acyclic) errors.push("检测到步骤 dependsOn 存在循环依赖（DAG 不成立，拒绝执行）"); // 环的中文解释
  return { acyclic, topoOrder, errors }; // 返回三元组供 validateWorkflow 消费
} // kahnWorkflowTopology 函数结束

/** 第15天：将 Planner/中间态工作流在进入 execute 前做静态校验，输出可展示的分条错误列表。 */
export function validateWorkflow(workflow: Workflow): { ok: boolean; errors: string[] } {
  const errors: string[] = []; // 累积全部问题，最终一次性返回给调用方
  const steps = workflow.steps; // 局部别名减少重复属性访问
  if (steps.length === 0) errors.push("工作流 steps 为空：至少需要一个可执行步骤"); // 空工作流直接非法
  const seenIds = new Set<string>(); // 用于判断是否出现重复 id
  for (const s of steps) {
    const idOk = typeof s.id === "string" && s.id.trim().length > 0; // id 必须是 Trim 后仍非空的字符串
    if (!idOk) errors.push("存在步骤 id 为空或缺失：必须为稳定非空字符串"); // 指明 id 必要条件
    else if (seenIds.has(s.id)) errors.push(`步骤 id 重复：${s.id}`); // 重复 id 会导致 dependsOn 二义性
    else seenIds.add(s.id); // 记录首次出现的 id
  } // id 遍历结束
  const idSet = new Set(steps.map((x) => x.id)); // 重新基于当前 steps 构造 id 集合用于依赖存在性校验
  for (const s of steps) {
    if (!WORKFLOW_ALLOWED_ACTIONS.has(s.action)) errors.push(`步骤 ${s.id} 的 action 不在白名单内：${String(s.action)}`); // 与 Executor 支持动作对齐
  } // action 遍历结束
  for (const s of steps) {
    for (const depId of s.dependsOn ?? []) {
      if (!idSet.has(depId)) errors.push(`步骤 ${s.id} 的 dependsOn 引用不存在的步骤 id：${depId}`); // 非法引用必须显性报错
    } // 每条依赖扫描结束
  } // dependsOn 外层循环结束
  const cycle = kahnWorkflowTopology(steps); // 计算 DAG 合法性（与 dependsOn 边方向一致）
  if (!cycle.acyclic) errors.push(...cycle.errors); // 将判环阶段的错误并入总表
  for (const s of steps) {
    // 第17天：逐条校验 condition 结构与引用合法性（失败即阻断 executeWorkflow）
    if (!s.condition) continue; // 无条件步骤：跳过本节校验
    const c = s.condition; // 局部别名：减少重复属性访问链长度
    if (!idSet.has(c.fromStepId)) errors.push(`步骤 ${s.id} 的 condition.fromStepId 引用不存在：${c.fromStepId}`); // from 必须指向真实 step id
    if (c.operator !== "equals" && c.operator !== "includes" && c.operator !== "truthy") {
      errors.push(`步骤 ${s.id} 的 condition.operator 非法：${String(c.operator)}`); // operator 必须是三元枚举之一
    } // operator 合法性分支结束
    if ((c.operator === "equals" || c.operator === "includes") && !c.value.trim()) {
      errors.push(`步骤 ${s.id} 的 condition.value 不能为空（operator=${c.operator}）`); // equals/includes 必须提供可比对的非空值
    } // value 非空分支结束
    const depSet = new Set(s.dependsOn ?? []); // 将 dependsOn 转为集合：便于 O(1) 判断是否包含 fromStepId
    if (!depSet.has(c.fromStepId)) errors.push(`步骤 ${s.id} 的 condition.fromStepId 未出现在 dependsOn：${c.fromStepId}`); // 数据流必须先读取来源输出（或可依赖 repair 自动补齐）
  } // condition 校验 for 结束
  for (const s of steps) {
    // 第18天：confirmation 字段校验（waiting_confirmation 不是 failed）
    if (!s.requiresConfirmation) continue; // 无需确认的步骤跳过
    if (!s.confirmationMessage?.trim()) {
      errors.push(`步骤 ${s.id} 设置了 requiresConfirmation 但 confirmationMessage 为空`); // 必须有可读确认文案
    } // 文案非空校验结束
  } // HITL validate for 结束
  const ok = errors.length === 0; // 仅当无任何分条问题时认为 ok
  return { ok, errors }; // 返回摘要供 POST 决定是否短路
} // validateWorkflow 函数结束

/** 第15天：将漂移的 action 字符串尽可能映射回 Executor 识别的四类工具枚举值。 */
function repairWorkflowActionAlias(raw: WorkflowStepAction): WorkflowStepAction {
  const key = String(raw).trim().toLowerCase(); // 统一成小写字符串，弱化大小写噪声
  const table: Record<string, WorkflowStepAction> = {
    summarize: "summary", // 常见动词变体
    summarise: "summary", // 英式拼写兼容
    summaries: "summary", // 复数误识别
    todos: "todo", // Planner 可能的复数形式
    tasks: "todo", // 「任务清单」漂移成 tasks
    task: "todo", // 「任务」漂移成 task
    forecast: "weather", // 预报语义映射到固定天气工具链
    meteo: "weather", // meteorology 缩写式漂移
    climate: "weather", // 「气候天气」漂移
    search: "weather", // 与单步路由一致：search≈weather
    classify: "judge", // 「分类/判定」漂移映射到 judge
    judgement: "judge", // judgement 拼写漂移映射到 judge
    decision: "judge", // decision 漂移映射到 judge
  }; // 别名表字面量结束
  if (table[key]) return table[key]!; // 命中表项则立即返回映射后的枚举
  return normalizeWorkflowAction(raw); // 未命中再走第14天的归一入口，保证至少落在四象限动作里
} // repairWorkflowActionAlias 函数结束

/** 第15天：过滤 dependsOn 中引用不存在步骤 id 的边，避免出现悬挂依赖指针。 */
function repairWorkflowFilterDependsOn(step: WorkflowStep, all: WorkflowStep[]): string[] | undefined {
  const ids = new Set(all.map((x) => x.id)); // 有效 id 全集
  const raw = step.dependsOn ?? []; // 原始依赖数组；undefined 等价于无依赖
  const next = raw.filter((x) => ids.has(x)); // 仅保留指回真实存在的步骤 id
  return next.length > 0 ? next : undefined; // 若无任何有效依赖边则删掉整个字段语义（返回 undefined）
} // repairWorkflowFilterDependsOn 函数结束

/** 第15天：若出现重复步骤 id，则保留首次出现并逐步为后续同名 id 重写为带随机后缀的稳定值，尽量不破坏 dependsOn（仍指向「首次 id」语义）。 */
function repairWorkflowDuplicateStepIds(steps: WorkflowStep[]): WorkflowStep[] {
  const used = new Set<string>(); // 记录已经出现过的字符串 id，用于检测碰撞
  return steps.map((s, idx) => {
    let nextId = s.id; // 默认沿用原 id
    if (!nextId.trim() || used.has(nextId)) {
      nextId = `step-${idx + 1}-${globalThis.crypto.randomUUID().slice(0, 8)}`; // 空或碰撞则重写为可读前缀加随机尾
    } // 碰撞分支结束
    used.add(nextId); // 登记新的最终 id
    return { ...s, id: nextId }; // 返回带新 id 的步骤浅拷贝
  }); // map 结束
} // repairWorkflowDuplicateStepIds 函数结束

/** 第17天：若声明了 condition，则确保 condition.fromStepId 出现在 dependsOn（Planner 漏写依赖边时的自动 repair）。 */
function repairWorkflowConditionDependsOn(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((s) => {
    if (!s.condition) return s; // 无条件步骤：依赖图不由本节改写
    const fromId = s.condition.fromStepId; // 条件判定读取的输出来源步骤 id
    const deps = [...(s.dependsOn ?? [])]; // 复制 dependsOn：避免多个步骤共享同一数组引用
    if (!deps.includes(fromId)) deps.push(fromId); // 缺失则追加：确保拓扑序上来源先于本步（对齐数据流语义）
    return { ...s, dependsOn: deps }; // 返回补上依赖后的新步骤对象（deps 至少包含 fromId）
  }); // map 结束
} // repairWorkflowConditionDependsOn 结束

/** 第18天：requiresConfirmation 为 true 但缺 confirmationMessage 时自动补默认文案。 */
function repairWorkflowConfirmationMessage(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((s) => {
    if (!s.requiresConfirmation) return s; // 无需确认：原样返回
    if (s.confirmationMessage?.trim()) return s; // 已有文案：不改动
    return { ...s, confirmationMessage: `是否继续执行：${s.name}？` }; // Auto repair 默认问句
  }); // map 结束
} // repairWorkflowConfirmationMessage 结束

/** 第15天：按 Planner 原始数组顺序做启发式：若 todo 未写 dependsOn 且前面出现过 summary，则把它链接到最近 summary。 */
function repairWorkflowHeuristicTodoDependsOnSummary(steps: WorkflowStep[]): WorkflowStep[] {
  const out: WorkflowStep[] = steps.map((s) => {
    const { dependsOn: _oldDeps, ...rest } = s; // 同样避免「dependsOn: undefined」键污染推断
    return s.dependsOn?.length ? { ...rest, dependsOn: [...s.dependsOn] } : { ...rest }; // 有依赖才保留 dependsOn
  }); // clone 映射结束
  let lastSummaryId: string | undefined = undefined; // 维护「最近一次 summary 步骤 id」指针
  for (let i = 0; i < out.length; i++) {
    const cur = out[i]!; // 当前遍历到的步骤别名，非空断言因 i 合法
    if (cur.action === "summary") lastSummaryId = cur.id; // summary：更新最近一次总结指针
    if (cur.action !== "todo") continue; // 非 todo 步骤跳过本题启发式
    const hasDeps = (cur.dependsOn?.length ?? 0) > 0; // 若已存在依赖则不强行覆盖 Planner 语义
    if (hasDeps) continue; // 尊重显式 DAG
    if (!lastSummaryId) continue; // 若没有前置 summary，本启发式不适用
    cur.dependsOn = [lastSummaryId]; // 显式补上「todo 依赖最近一次 summary」的边（常见业务链）
  } // for i 扫描结束
  return out; // 返回可能已经补依赖的数组
} // repairWorkflowHeuristicTodoDependsOnSummary 函数结束

/** 第15天：贪心删边消解环——每次判环失败后从末尾往前挑仍带 dependsOn 的步骤清空其 dependsOn，直到 Kahn 通过。 */
function repairWorkflowBreakCyclesIfNeeded(steps: WorkflowStep[]): WorkflowStep[] {
  const draft: WorkflowStep[] = steps.map((s) => {
    const { dependsOn: _oldDeps, ...rest } = s; // 解构剥离 dependsOn，后续选择性加回
    return s.dependsOn?.length ? { ...rest, dependsOn: [...s.dependsOn] } : { ...rest }; // 仅复制真实存在的依赖数组
  }); // clone 结束
  while (true) {
    const { acyclic } = kahnWorkflowTopology(draft); // 重新评估是否已成为 DAG
    if (acyclic) break; // 已 DAG 则结束修复
    const victim = [...draft].reverse().find((x) => (x.dependsOn?.length ?? 0) > 0); // 末尾优先挑仍带依赖的牺牲步
    if (!victim) break; // 理论不应发生：全员无依赖仍判环则可能数据异常；直接停下避免死循环
    const { dependsOn: _rm, ...restVictim } = victim; // 通过解构删除依赖字段：比写 undefined 更符合可选键语义
    Object.assign(victim, { ...restVictim }); // 就地写回无 dependsOn 的 victim 对象（保持数组引用稳定）
  } // while true 修复结束
  return draft; // 返回可能变薄依赖图的新步骤数组
} // repairWorkflowBreakCyclesIfNeeded 函数结束

/** 第15天：AUTO REPAIR：在规则允许的范围内重写 steps，使常见 Planner 漂移转为可校验结构。 */
export function repairWorkflow(workflow: Workflow): Workflow {
  let steps: WorkflowStep[] = workflow.steps.map((s) => {
    const { dependsOn: _oldDeps, ...rest } = s; // 解构去掉旧 dependsOn，避免写出「显式 undefined 键」触发 TS 奇怪推断
    return s.dependsOn?.length ? { ...rest, dependsOn: [...s.dependsOn] } : { ...rest }; // 有依赖才挂 dependsOn 字段，保持可选键语义
  }); // map 拷贝结束
  steps = repairWorkflowDuplicateStepIds(steps); // 先解决 id 碰撞与空白 id（保证后续校验可定位）
  steps = steps.map((s) => ({
    ...s, // 展开旧字段
    action: repairWorkflowActionAlias(s.action), // 归一 action 拼写/别名
  })); // action 修复 map 结束
  steps = steps.map((s) => {
    const nextDeps = repairWorkflowFilterDependsOn(s, steps); // 计算过滤后的依赖数组或 undefined
    const { dependsOn: _drop, ...rest } = s; // 丢掉旧依赖键，准备按「有则写入无则省略」重建对象
    return nextDeps?.length ? { ...rest, dependsOn: nextDeps } : { ...rest }; // 仅非空依赖才展开 dependsOn 属性
  }); // 依赖过滤 map 结束
  steps = repairWorkflowConditionDependsOn(steps); // 第17天：补齐 condition 隐式依赖边，降低 Planner 漏写概率
  steps = repairWorkflowConfirmationMessage(steps); // 第18天：补齐 HITL 确认文案
  steps = repairWorkflowHeuristicTodoDependsOnSummary(steps); // 尝试自动补「summary→todo」链
  steps = repairWorkflowBreakCyclesIfNeeded(steps); // 若仍因环非法，则删边直到无环
  return { ...workflow, steps }; // 返回带新 steps 的工作流对象（status 等其它字段保持原样）
} // repairWorkflow 函数结束

/** 第15天：与文档命名对齐的 topologicalSort API，内部直接复用第14天 DFS 版实现，避免两套排序不一致。 */
export function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  return topologicalSortWorkflowSteps(steps); // 委托：仍使用依赖图 + 环兜底策略
} // topologicalSort 包装结束
