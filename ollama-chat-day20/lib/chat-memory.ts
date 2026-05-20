/**
 * 记忆管线：短期窗口、长期条目、压缩与 buildMemory。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime";
import type {
  ChatMessage,
  IncomingMemoryPayload,
  Memory,
  MemoryImportance,
  MemoryItem,
} from "@/lib/chat-types";

// ---------- 上下文与记忆体积限制 ----------

/** 当 incoming messages 超过该条数时，较早部分会先被总结进长期记忆再丢弃出窗口。 */
const MAX_CONTEXT_MESSAGES = 10; // 超过则压缩旧消息
/** 短期窗口保留的最近消息条数（与 MAX_CONTEXT_MESSAGES 配合控制总量）。 */
const SHORT_TERM_SIZE = 6; // 尾部保留条数
/** 长期记忆条目序列化后的字符上限，超出时按重要性裁剪。 */
const MAX_LONG_TERM_CHARS = 2000; // 长期字符上限
/** 总字符数或条数超阈时触发二次「模型压缩」长期记忆。 */
const SECONDARY_COMPRESS_THRESHOLD_CHARS = 500; // 触发二次压缩的字符阈值
/** 二次压缩后最多保留的条目数。 */
const MAX_COMPRESSED_ITEMS = 5; // 压缩输出条数上限
/** 匹配用户话术中「值得写入长期记忆」的自我介绍、目标等句式。 */
const LONG_TERM_RULE_PATTERN = /(我叫|我的名字是|叫我|我是|我想|我的目标|我希望|偏好|习惯)/; // 规则记忆触发
/** 用于推断 importance=high 的关键词（身份、规划类）。 */
const HIGH_IMPORTANCE_PATTERN =
  /(我叫|我的名字|我是|我想|我的目标|我希望|长期|计划|转型|职业|岗位)/; // 高重要线索
/** 闲聊语气词：倾向于标为 low 或在压缩时丢弃。 */
const LOW_CHITCHAT_PATTERN = /(哈哈|呵呵|谢谢|好的|嗯嗯|随便聊聊|今天天气不错)/; // 低重要闲聊
function normalizeContentLine(line: string): string {
  return line.replace(/^\s*-\s*/, "").trim(); // 去项目符号与空白
}

/** 无结构化 importance 时，用启发式正则猜测 high / low。 */
function inferImportanceFromText(text: string): MemoryImportance {
  const t = text.trim(); // 修剪输入
  if (HIGH_IMPORTANCE_PATTERN.test(t)) return "high"; // 命中高重要模式
  if (LOW_CHITCHAT_PATTERN.test(t)) return "low"; // 命中闲聊模式
  return "low"; // 默认低重要
}

/** 将旧版「单字符串 longTerm」按行拆成多条干净文本。 */
function splitMemoryLines(longTerm: string): string[] {
  return longTerm
    .split("\n") // 按行拆
    .map((line) => normalizeContentLine(line)) // 每行规范化
    .filter(Boolean); // 去空行
}

/** 估算当前长期条目占用的总字符数（用于判断是否触发压缩）。 */
export function memoryItemsCharLength(items: MemoryItem[]): number {
  return items.reduce((sum, i) => sum + i.content.length, 0); // 累加每条 content 长度
}

/**
 * 在不超过 MAX_LONG_TERM_CHARS 的前提下尽量保留更多条目：
 * 先保留全部 high，再按顺序尝试加入 low；仍超长则粗暴截取末尾若干条。
 */
function trimMemoryItems(items: MemoryItem[]): MemoryItem[] {
  let joined = items.map((i) => `- ${i.content}`).join("\n"); // 序列化估算长度
  if (joined.length <= MAX_LONG_TERM_CHARS) return items; // 未超限直接返回
  const high = items.filter((i) => i.importance === "high"); // 高重要子集
  const low = items.filter((i) => i.importance === "low"); // 低重要子集
  let kept = [...high]; // 先放入全部 high
  for (const item of low) {
    const trial = [...kept, item]; // 尝试追加一条 low
    const s = trial.map((i) => `- ${i.content}`).join("\n"); // 试算长度
    if (s.length <= MAX_LONG_TERM_CHARS) kept = trial; // 未超限则接受
    else break; // 否则停止尝试更多 low
  }
  joined = kept.map((i) => `- ${i.content}`).join("\n"); // 重新序列化 kept
  if (joined.length <= MAX_LONG_TERM_CHARS) return kept; // 若已在限额内则返回
  return kept.slice(-Math.ceil(MAX_LONG_TERM_CHARS / 40)); // 否则粗暴保留尾部若干条
}

/**
 * 按内容（忽略大小写）去重；若同一内容既有 low 又有 high，保留 high。
 */
function dedupeMemoryItems(items: MemoryItem[]): MemoryItem[] {
  const map = new Map<string, MemoryItem>(); // 小写内容 -> 条目
  for (const item of items) {
    const key = item.content.trim().toLowerCase(); // 去重键
    const prev = map.get(key); // 已存在条目
    if (!prev || (prev.importance === "low" && item.importance === "high")) {
      map.set(key, item); // 覆盖或首次写入
    }
  }
  return Array.from(map.values()); // Map 转数组
}

/** 合并新旧长期条目后去重并按体积裁剪。 */
function appendMemoryItems(base: MemoryItem[], additions: MemoryItem[]): MemoryItem[] {
  return trimMemoryItems(dedupeMemoryItems([...base, ...additions])); // 合并→去重→裁剪
}

/**
 * 统一入口：优先读请求里的 items 数组；否则把 longTerm 字符串拆行并推断每条 importance。
 */
function normalizeIncomingMemoryPayload(payload?: IncomingMemoryPayload): MemoryItem[] {
  if (payload?.items && Array.isArray(payload.items)) {
    return payload.items
      .filter((i) => i && typeof i.content === "string" && i.content.trim()) // 过滤无效项
      .map((i) => ({
        content: i.content.trim(), // 修剪正文
        importance: i.importance === "high" ? "high" : "low", // 归一 importance
      })); // 映射为 MemoryItem
  }
  if (payload?.longTerm && typeof payload.longTerm === "string") {
    return splitMemoryLines(payload.longTerm).map((line) => ({
      content: line, // 每行一条
      importance: inferImportanceFromText(line), // 启发式重要度
    })); // 旧 longTerm 兼容
  }
  return []; // 无 payload 则空数组
}

/**
 * 将多条 MemoryItem 格式化为「- 内容」拼接块；可指定只输出某一 importance。
 */
export function formatMemoryBlock(items: MemoryItem[], importance?: MemoryImportance): string {
  const filtered =
    importance !== undefined ? items.filter((i) => i.importance === importance) : items; // 可选过滤
  if (filtered.length === 0) return ""; // 无内容返回空串
  return filtered.map((i) => `- ${i.content}`).join("\n"); // 拼接 markdown 行块
}

/** 为 Planner 注入长期记忆（用 items 替代文档中的 longTerm 字段）。 */
export function formatMemoryForPlanner(memory: Memory): string {
  const highBlock = formatMemoryBlock(memory.items, "high"); // 高优先级记忆块（身份/目标等）
  const lowBlock = formatMemoryBlock(memory.items, "low"); // 低优先级记忆块
  if (!highBlock && !lowBlock) return "(空)"; // 无任何长期记忆时返回占位说明
  return [
    highBlock ? `【高优先级记忆】\n${highBlock}` : "", // 有则注入高优区块
    lowBlock ? `【其他记忆】\n${lowBlock}` : "", // 有则注入其他区块
  ]
    .filter(Boolean) // 去掉空串避免多余换行
    .join("\n\n"); // 两段之间空一行拼接
}

/**
 * 长期记忆过多时，用单独一轮模型调用把多条事实压缩成少量核心条目（仍带 importance）。
 * 请求失败则退化为去重 + trim 后截断。
 */
async function secondaryCompressItems(
  items: MemoryItem[],
  rt: ModelRuntime
): Promise<MemoryItem[]> {
  if (items.length === 0) return items; // 空则直接返回
  const existingHigh = formatMemoryBlock(items, "high"); // 原文高优先级块供模型保留语义
  const prompt = `
你是记忆压缩器。将下列记忆合并压缩为最多 ${MAX_COMPRESSED_ITEMS} 条核心事实。
要求：
1. 仅保留身份/目标/偏好/长期约束/关键任务方向
2. 去除重复与闲聊
3. 输出 JSON 数组，每项格式 {"content":"...","importance":"high"|"low"}
4. importance：身份/目标/长期计划为 high，其余为 low
5. 不要输出其它文字

高优先级原文（含义必须尽量保留）：
${existingHigh || "(无)"}

全部记忆条目：
${items.map((i) => `- ${i.content} [${i.importance}]`).join("\n")}
`; // 压缩提示词
  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 调用模型压缩
  if (!ok) return trimMemoryItems(dedupeMemoryItems(items)).slice(0, MAX_COMPRESSED_ITEMS); // 失败则退化截断
  try {
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw) as unknown; // 抽取数组 JSON
    if (!Array.isArray(parsed)) throw new Error("invalid"); // 非数组则失败
    const out: MemoryItem[] = []; // 输出缓冲
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue; // 跳过非法行
      const content = String((row as { content?: unknown }).content || "").trim(); // 读 content
      const importance =
        (row as { importance?: unknown }).importance === "high" ? "high" : "low"; // 读 importance
      if (content) out.push({ content, importance }); // 非空则收集
    }
    const deduped = dedupeMemoryItems(out); // 去重
    return deduped.slice(0, MAX_COMPRESSED_ITEMS); // 限制条数
  } catch {
    const lines = splitMemoryLines(raw).slice(0, MAX_COMPRESSED_ITEMS); // 解析失败则按行拆
    return lines.map((line) => ({
      content: line, // 行内容
      importance: inferImportanceFromText(line), // 推断重要度
    })); // 转为 MemoryItem
  }
}

/** 根据体积阈值决定是否触发 secondaryCompressItems，并最终 trim。 */
async function maybeEvolveMemoryItems(
  items: MemoryItem[],
  rt: ModelRuntime
): Promise<MemoryItem[]> {
  let next = dedupeMemoryItems(items); // 先去重
  const charLen = memoryItemsCharLength(next); // 当前字符总长
  if (charLen >= SECONDARY_COMPRESS_THRESHOLD_CHARS || next.length > 12) {
    next = await secondaryCompressItems(next, rt); // 超阈则二次压缩
  }
  return trimMemoryItems(next); // 最后裁剪体积
}

/**
 * 将被移出短期窗口的旧对话压缩成若干 MemoryItem，合并进长期记忆。
 * 用于在消息很长时把关键信息「沉淀」下来而不是直接丢弃。
 */
async function summarizeForMemory(
  oldMessages: ChatMessage[],
  existingItems: MemoryItem[],
  rt: ModelRuntime
): Promise<MemoryItem[]> {
  const dialogue = oldMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`) // 格式化每轮
    .join("\n"); // 拼成对话文本

  const existingText = formatMemoryBlock(existingItems); // 已有长期条目文本块

  const prompt = `
请总结对话，用于长期记忆：

要求：
1. 只保留关键信息（身份 / 目标 / 偏好 / 约束）
2. 删除闲聊内容
3. 输出 JSON 数组，每项 {"content":"...","importance":"high"|"low"}
4. importance：身份/目标/偏好/长期约束为 high，否则 low
5. 不要重复已有事实

已有长期记忆：
${existingText || "(空)"}

待压缩对话：
${dialogue}
`; // 压缩旧对话的提示词

  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 请求模型输出 JSON 数组
  if (!ok) return []; // 失败返回空，由上层忽略
  try {
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw) as unknown; // 尝试解析数组
    if (!Array.isArray(parsed)) return []; // 非数组则空
    const out: MemoryItem[] = []; // 收集结果
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue; // 跳过非法项
      const content = String((row as { content?: unknown }).content || "").trim(); // content
      const importance =
        (row as { importance?: unknown }).importance === "high" ? "high" : "low"; // importance
      if (content) out.push({ content, importance }); // 收集
    }
    return out; // 返回结构化条目
  } catch {
    const lines = splitMemoryLines(raw); // JSON 失败则按行拆
    return lines.map((line) => ({
      content: line, // 行文本
      importance: inferImportanceFromText(line), // 推断重要度
    })); // 降级为行级 MemoryItem
  }
}

/**
 * 不调用模型：仅用正则从用户话术中抓取「自我介绍/目标」类句子，标记为 high。
 */
function extractRuleBasedMemory(messages: ChatMessage[]): MemoryItem[] {
  return messages
    .filter((m) => m.role === "user" && LONG_TERM_RULE_PATTERN.test(m.content)) // 仅用户且命中规则
    .map((m) => ({
      content: m.content.trim(), // 原文trim
      importance: "high" as MemoryImportance, // 规则命中视为高重要
    })); // 映射为条目
}

/**
 * 核心记忆管线：归一化入参 → 可选总结旧消息 → 规则抽取 → 可能二次压缩 →
 * 产出 Memory 与喂给后续聊天/路由用的 modelMessages（system 记忆块 + shortTerm）。
 */
export async function buildMemory(
  incomingMessages: ChatMessage[],
  incomingMemory: IncomingMemoryPayload | undefined,
  rt: ModelRuntime
): Promise<{ memory: Memory; modelMessages: Array<{ role: string; content: string }> }> {
  let items = normalizeIncomingMemoryPayload(incomingMemory); // 解析入参记忆

  const shouldSummarize = incomingMessages.length > MAX_CONTEXT_MESSAGES; // 是否需压缩旧段
  const shortTerm = incomingMessages.slice(-SHORT_TERM_SIZE); // 保留尾部短期
  const oldMessages = shouldSummarize ? incomingMessages.slice(0, -SHORT_TERM_SIZE) : []; // 旧段待总结

  if (oldMessages.length > 0) {
    const summarized = await summarizeForMemory(oldMessages, items, rt); // 异步总结旧消息为条目
    items = appendMemoryItems(items, summarized); // 合并进长期
  }

  items = appendMemoryItems(items, extractRuleBasedMemory(incomingMessages)); // 合并规则抽取
  items = await maybeEvolveMemoryItems(items, rt); // 可能二次压缩并裁剪

  const memory: Memory = { shortTerm, items }; // 组装 Memory

  const highText = formatMemoryBlock(memory.items, "high"); // 高优先级块字符串
  const lowText = formatMemoryBlock(memory.items, "low"); // 低优先级块字符串
  const modelMessages: Array<{ role: string; content: string }> = []; // 模型消息数组
  if (highText || lowText) {
    modelMessages.push({
      role: "system", // system 注入长期记忆
      content: [
        highText ? `【高优先级长期记忆】\n${highText}` : "", // 高块
        lowText ? `【其他长期记忆】\n${lowText}` : "", // 低块
      ]
        .filter(Boolean) // 去掉空串
        .join("\n\n"), // 合并为一条 system
    }); // push system
  }
  modelMessages.push(...memory.shortTerm); // 追加短期对话
  return { memory, modelMessages }; // 返回记忆与模型输入
}
