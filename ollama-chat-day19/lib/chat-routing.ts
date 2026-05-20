/**
 * 意图路由：解析模型 JSON、延续语义修正、路由 system 提示词。
 */
import type { Action, Memory, ParsedOutput } from "@/lib/chat-types";
import { formatMemoryBlock } from "@/lib/chat-memory";

export function logAgent(event: string, payload: Record<string, unknown>) {
  console.log(`[Agent] ${event}`, payload);
}

/** 将模型输出的 action 字符串收敛到本服务支持的四种之一（含 search→weather 别名）。 */
export function normalizeAction(raw: unknown): Action {
  if (raw === "weather" || raw === "search") return "weather"; // 天气别名统一
  if (raw === "summary") return "summary"; // 总结
  if (raw === "todo") return "todo"; // 待办
  return "chat"; // 默认聊天
}
function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  if (!input || typeof input !== "object") {
    return { action: "chat", content: rawText, keyword: "" }; // 非对象则全文当聊天
  }
  const candidate = input as Partial<ParsedOutput>; // 宽松读取字段
  return {
    action: normalizeAction(candidate.action), // 归一化 action
    content:
      typeof candidate.content === "string" && candidate.content.trim()
        ? candidate.content.trim() // 有正文则修剪
        : "", // 否则空串
    keyword: typeof candidate.keyword === "string" ? candidate.keyword.trim() : "", // keyword 仅字符串
  }; // 返回 ParsedOutput
}

/**
 * 解析路由模型的文本输出：优先整段 JSON.parse；失败则尝试提取首个 {...} 子串再解析；
 * 仍失败则视为普通文本，action 固定为 chat。
 */
export function parseModelOutput(modelOutput: string): ParsedOutput {
  try {
    return normalizeParsedOutput(JSON.parse(modelOutput), modelOutput); // 整段 JSON
  } catch {
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/); // 提取花括号片段
    if (jsonMatch) {
      try {
        return normalizeParsedOutput(JSON.parse(jsonMatch[0]), modelOutput); // 子串解析
      } catch {
        // ignore // 子串仍非法则继续兜底
      }
    }
    return { action: "chat", content: modelOutput, keyword: "" }; // 全文当聊天内容
  }
}
export function buildRoutingSystemPrompt(memory: Memory): string {
  const highBlock = formatMemoryBlock(memory.items, "high"); // 高优先级记忆文本块
  const lowBlock = formatMemoryBlock(memory.items, "low"); // 低优先级记忆文本块
  return `
你是一个路由助手，必须严格输出 JSON，不允许输出解释或 Markdown。
你必须结合「用户最新一轮输入」与下列「长期记忆」判断意图；省略语（如继续刚才的任务）必须依赖记忆补全语义。

【高优先级记忆】（身份/目标/偏好，路由时优先参考）
${highBlock || "(空)"}

【其他记忆】
${lowBlock || "(空)"}

任务（按意图选择 action）：
1) 用户问天气、气温、某城市天气 -> "weather"
2) 用户要总结、概括、归纳 -> "summary"
3) 用户要做计划、列待办、任务清单、或表达「继续刚才的待办/按上次计划」且记忆中存在目标/任务语境 -> "todo"
4) 普通闲聊 -> "chat"

特殊规则：
- 若用户说「继续/刚才/上次/那个任务/按计划/接着」且需要延续计划或任务拆解 -> 优先 "todo"
- 若用户明确要延续上文归纳、要点汇总 -> 优先 "summary"
- keyword：weather 时填城市或地区关键词；其它可为空

输出格式（仅一行 JSON）：
{"action":"chat|weather|summary|todo","content":"","keyword":""}
`.trim(); // 去掉首尾空白
}

/** 判断用户是否在用语境衔接词，需要结合记忆猜测真实意图。 */
const CONTINUATION_PATTERN = /继续|刚才|刚刚|上次|那个任务|按计划|接着|再来|跟上文|刚才那个/; // 延续话术

function isContinuationQuery(text: string): boolean {
  return CONTINUATION_PATTERN.test(text); // 是否命中延续模式
}

/**
 * 当路由模型仍返回 chat，但用户话术像「继续」且记忆中存在总结/待办语境时，
 * 强制升级为 summary 或 todo，减少误路由为闲聊。
 */
export function resolveContinuationAction(latestUser: string, parsed: ParsedOutput, memory: Memory): Action {
  if (parsed.action !== "chat") return parsed.action; // 已非 chat 则不覆盖
  if (!isContinuationQuery(latestUser)) return parsed.action; // 非延续询问则不覆盖

  const memAll = memory.items.map((i) => i.content).join("\n"); // 全部记忆拼串
  const high = formatMemoryBlock(memory.items, "high"); // 高优先级记忆文本，用于检测任务/目标语境

  if (/总结|归纳|要点|摘要|上文/.test(latestUser)) return "summary"; // 用户明确总结词
  if (/待办|任务清单|清单|计划|todo/i.test(latestUser)) return "todo"; // 用户明确待办词

  if (/总结|归纳|要点/.test(memAll) && !/待办|任务|清单/.test(memAll)) return "summary"; // 记忆偏总结
  if (/待办|任务|清单|计划|目标/.test(high) || /待办|任务/.test(memAll)) return "todo"; // 记忆偏任务

  return "todo"; // 默认偏向待办延续
}
