/**
 * 单步工具：天气、总结、待办、闲聊兜底。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime";
import type { ChatMessage, Memory, TodoItem } from "@/lib/chat-types";
import { formatMemoryBlock } from "@/lib/chat-memory";

/** 演示用城市 → 经纬度，供 Open-Meteo 查询；未列入的城市会提示不支持。 */
const cityMap: Record<string, { lat: number; lon: number }> = {
  北京: { lat: 39.9042, lon: 116.4074 }, // 北京坐标
  上海: { lat: 31.2304, lon: 121.4737 }, // 上海坐标
};
/**
 * 从用户或 keyword 字段里解析城市名：先完整匹配 cityMap 键，再对清理后的串做子串匹配。
 */
export function extractWeatherCity(text: string): string {
  const trimmed = text.trim(); // 修剪
  if (!trimmed) return ""; // 空则空城市
  for (const city of Object.keys(cityMap)) {
    if (trimmed.includes(city)) return city; // 原文包含城市名
  }
  const cleaned = trimmed
    .replace(/[，。！？、,.!?]/g, "") // 去标点
    .replace(/\s+/g, "") // 去空白
    .replace(/帮我|请|一下|查一下|查下|查一查|查|查询|搜索/g, "") // 去查询动词
    .replace(/天气预报|天气情况|天气|温度|气温/g, "") // 去天气关键词
    .replace(/的/g, ""); // 去「的」
  for (const city of Object.keys(cityMap)) {
    if (cleaned.includes(city)) return city; // 清洗后再匹配
  }
  return cleaned; // 返回清洗串供错误提示
}

/** 取最近一条 user 消息的文本，供路由与工具缺省输入使用。 */
export function getLatestUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || ""; // 逆序找 user
}

/**
 * 当路由把 action 判为 chat 但 content 为空时，用完整 modelMessages 再走一轮普通对话。
 */
export async function generateFallbackChat(
  messages: Array<{ role: string; content: string }>,
  rt: ModelRuntime
): Promise<string> {
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system", // 第二轮聊天人设
      content: "你是一个简洁、友好的中文助手。请直接回答用户，不要输出 JSON。", // 禁止 JSON
    },
    ...messages, // 带上完整上下文（含 system 记忆块）
  ]); // 调用模型
  if (!ok) return "抱歉，我现在暂时无法正常回答，请稍后再试。"; // HTTP 失败
  return text || "抱歉，我现在暂时无法正常回答，请稍后再试。"; // 空内容兜底
}

/** 总结工具：取最近若干轮对话拼成文本；若无则退回路由给出的 fallback。 */
function pickSummaryContext(messages: ChatMessage[], fallbackText: string): string {
  const recent = messages.slice(-6); // 最近 6 条
  const context = recent
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`) // 角色前缀
    .join("\n"); // 多行文本
  return context || fallbackText; // 空则用 fallback
}

/** summary 分支：按固定格式生成要点列表，并注入高优先级记忆作为目标参考。 */
export async function summarizeWithModel(
  messages: ChatMessage[],
  fallbackText: string,
  memory: Memory,
  rt: ModelRuntime,
  chainPrefix?: string
) {
  let content = pickSummaryContext(messages, fallbackText); // 选定总结输入
  if (chainPrefix) {
    content = `${chainPrefix}\n\n${content}`; // 工作流场景：把前置步骤输出拼在对话上下文前
  }
  const memHint = formatMemoryBlock(memory.items, "high"); // 高优先级记忆提示
  const prompt = `
请总结以下对话，要求：
1. 提取关键信息
2. 用 3-5 条要点表达
3. 输出格式为纯文本项目符号，每行以"- "开头
4. 最后一行给出"结论："和"下一步："
5. 可参考用户长期目标（若有）：
${memHint || "(无)"}

对话：
${content}
`; // 总结提示词
  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 调用模型
  if (!ok) {
    return "总结失败：模型暂时不可用，请稍后重试。"; // 模型不可用
  }
  return text || "总结失败：未获取到有效结果。"; // 空正文兜底
}

/** 尝试把模型输出解析为 TodoItem[]（严格 JSON 数组）；失败返回 null。 */
function parseTodoItemsFromText(raw: string): TodoItem[] | null {
  try {
    const parsed = JSON.parse(raw); // 解析 JSON
    if (!Array.isArray(parsed)) return null; // 非数组失败
    const todos = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null; // 跳过非对象
        const task =
          typeof (item as { task?: unknown }).task === "string"
            ? (item as { task: string }).task.trim() // task 字符串
            : ""; // 否则空
        const done = Boolean((item as { done?: unknown }).done); // done 布尔化
        if (!task) return null; // 无 task 丢弃
        return { task, done }; // 合法 TodoItem
      })
      .filter((v): v is TodoItem => Boolean(v)); // 过滤 null
    return todos.length > 0 ? todos : null; // 无有效项则 null
  } catch {
    return null; // 解析异常
  }
}

/**
 * todo 分支：结合用户当前输入与长期记忆生成个性化任务列表；
 * 解析失败时使用内置占位任务，保证前端总能渲染出列表。
 */
export async function generateTodosWithModel(args: {
  userInput: string;
  memory: Memory;
  rt: ModelRuntime;
  /** 非依赖模式下的线性前置输出（无前述 dependsOn 时使用）。 */
  chainPrefix?: string;
  /** 显式 dependsOn：与 chainPrefix 二选一优先；prompt 采用「依赖结果 + 当前任务」结构。 */
  dependencyContext?: string;
}): Promise<TodoItem[]> {
  const { userInput, memory, chainPrefix, dependencyContext, rt } = args; // 解构参数
  const highBlock = formatMemoryBlock(memory.items, "high"); // 高优先级记忆块
  const lowBlock = formatMemoryBlock(memory.items, "low"); // 其他记忆块

  const dep = dependencyContext?.trim(); // 显式依赖链上下文：来自 dependsOn 步骤的成功输出拼接
  const linear = !dep && chainPrefix?.trim() ? chainPrefix.trim() : ""; // 无依赖时：用线性前置步骤输出作弱上下文

  const workflowBlock =
    dep
      ? `请基于以下内容生成待办（必须结合依赖步骤结果）：\n\n【依赖步骤结果】\n${dep}\n\n【当前任务】\n${userInput}\n` // 依赖模式：把依赖结果与用户本步任务一并写进提示
      : linear
        ? `\n【前置步骤输出】\n${linear}\n\n` // 线性模式：仅追加「前置输出」段，结构较松
        : ""; // 既无依赖也无前置：不注入额外工作流块

  const prompt = dep
    ? `
${workflowBlock}
要求：
1. 返回 JSON 数组
2. 每项包含 task 和 done
3. done 默认为 false
4. 至少返回 3 项；待办须紧密承接「依赖步骤结果」与「当前任务」，避免与上文无关的通用模板
5. 不要输出任何解释

【高优先级记忆】
${highBlock || "(空)"}

【其他记忆】
${lowBlock || "(空)"}
`.trim()
    : `
请根据用户输入与长期记忆生成个性化待办事项。
要求：
1. 返回 JSON 数组
2. 每项包含 task 和 done
3. done 默认为 false
4. 至少返回 3 项；内容须体现用户的身份/目标（若有），避免通用空话模板
5. 不要输出任何解释

【高优先级记忆】
${highBlock || "(空)"}

【其他记忆】
${lowBlock || "(空)"}
${workflowBlock}用户输入：
${userInput}
`; // 待办生成提示词；依赖模式用独立结构，否则沿用线性前置段
  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 请求模型
  if (!ok) {
    return [
      { task: "对照记忆澄清本周目标与交付物", done: false }, // 占位 1
      { task: "拆解关键任务并设定验收标准", done: false }, // 占位 2
      { task: "执行并复盘，更新进度", done: false }, // 占位 3
    ]; // 失败静态列表
  }
  const fromDirect = parseTodoItemsFromText(raw); // 整体 JSON 解析
  if (fromDirect) return fromDirect; // 成功则返回

  const wrapped = raw.match(/\[[\s\S]*\]/)?.[0]; // 抽取数组子串
  const fromWrapped = wrapped ? parseTodoItemsFromText(wrapped) : null; // 子串解析
  if (fromWrapped) return fromWrapped; // 成功则返回

  return [
    { task: "结合记忆细化当前优先事项", done: false }, // 二级兜底 1
    { task: "推进主线任务并记录阻塞点", done: false }, // 二级兜底 2
    { task: "阶段性复盘并调整后续步骤", done: false }, // 二级兜底 3
  ]; // 最终静态兜底
}
/**
 * 调用 Open-Meteo 公开接口获取当前天气；仅支持 cityMap 中已配置的城市。
 */
export async function realWeather(city: string): Promise<string> {
  const location = cityMap[city]; // 查表得坐标
  if (!location) return "暂不支持该城市（当前仅支持：北京、上海）"; // 未支持城市
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current_weather=true`, // 当前天气 API
    { cache: "no-store" } // 禁用缓存
  ); // fetch
  if (!res.ok) return "天气服务暂时不可用，请稍后再试"; // HTTP 错误
  const data = (await res.json()) as {
    current_weather?: { temperature?: number; windspeed?: number }; // 响应形状
  }; // 断言 JSON
  const temperature = data.current_weather?.temperature; // 温度
  const windspeed = data.current_weather?.windspeed; // 风速
  if (typeof temperature !== "number") return "未获取到实时天气数据，请稍后重试"; // 缺字段
  const windText = typeof windspeed === "number" ? `，风速：${windspeed}km/h` : ""; // 可选风速文案
  return `当前温度：${temperature}°C${windText}`; // 最终展示字符串
}
