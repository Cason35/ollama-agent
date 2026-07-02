import type { ModelProfile } from "@/lib/model/model-profile-types"; /* 第50天：引入模型档案类型用于声明默认逻辑模型。 */
import { ModelRegistry } from "@/lib/model/model-registry"; /* 第50天：引入模型注册表用于批量登记默认模型。 */

export const DEFAULT_MODEL_PROFILES: ModelProfile[] = [ /* 第50天：定义第50天需要注册的默认逻辑模型档案列表。 */
  { /* 第50天：定义 small-chat（小型对话模型）档案。 */
    id: "small-chat", /* 第50天：保存小型对话模型的逻辑标识。 */
    name: "Small Chat（小型对话模型）", /* 第50天：保存小型对话模型的展示名称。 */
    provider: "ollama", /* 第50天：小型对话模型由本地 Ollama 提供。 */
    model: "qwen2.5:3b", /* 第50天：底层使用 3B 参数的小模型以追求低延迟。 */
    capabilities: ["chat", "summary"], /* 第50天：声明擅长闲聊与简单总结能力。 */
    roles: ["writing", "summary"], /* 第56天：声明小模型适合承担写作润色与摘要角色。 */
    cost: { inputPer1K: 0.0002, outputPer1K: 0.0004 }, /* 第50天：声明较低的输入输出单价。 */
    limits: { contextWindow: 8192, maxOutputTokens: 1024 }, /* 第50天：声明较小的上下文与输出限制。 */
    speed: "fast", /* 第50天：标记为快速模型。 */
    quality: "basic", /* 第50天：标记为基础质量。 */
    fallbackModelIds: ["json-structured"], /* 第51天：小模型失败时先回退到结构化 JSON 模型，保证仍有通用对话能力。 */
    timeoutMs: 12000, /* 第51天：小模型单次调用最多等待 12 秒，避免低延迟路径被卡住。 */
    maxRetries: 1, /* 第51天：小模型失败后允许额外重试 1 次。 */
  }, /* 第50天：结束 small-chat 档案。 */
  { /* 第50天：定义 large-reasoning（大型推理模型）档案。 */
    id: "large-reasoning", /* 第50天：保存大型推理模型的逻辑标识。 */
    name: "Large Reasoning（大型推理模型）", /* 第50天：保存大型推理模型的展示名称。 */
    provider: "ollama", /* 第50天：大型推理模型由本地 Ollama 提供。 */
    model: "qwen2.5:14b", /* 第50天：底层使用 14B 参数的大模型以增强推理。 */
    capabilities: ["chat", "reasoning", "planning"], /* 第50天：声明擅长复杂推理与多步规划能力。 */
    roles: ["reasoning", "writing"], /* 第56天：声明大模型适合承担推理主干，也可承担复杂写作角色。 */
    cost: { inputPer1K: 0.0015, outputPer1K: 0.003 }, /* 第50天：声明较高的输入输出单价。 */
    limits: { contextWindow: 32768, maxOutputTokens: 4096 }, /* 第50天：声明较大的上下文与输出限制。 */
    speed: "slow", /* 第50天：标记为慢速模型。 */
    quality: "reasoning", /* 第50天：标记为推理级质量。 */
    fallbackModelIds: ["json-structured", "small-chat"], /* 第51天：大型推理模型失败时先降级到 JSON 模型，再降级到小型对话模型。 */
    timeoutMs: 30000, /* 第51天：大模型允许更长等待时间以容纳复杂推理。 */
    maxRetries: 1, /* 第51天：大模型失败后允许额外重试 1 次，避免偶发网络抖动直接降级。 */
  }, /* 第50天：结束 large-reasoning 档案。 */
  { /* 第50天：定义 json-structured（结构化 JSON 模型）档案。 */
    id: "json-structured", /* 第50天：保存结构化 JSON 模型的逻辑标识。 */
    name: "JSON Structured（结构化 JSON 模型）", /* 第50天：保存结构化 JSON 模型的展示名称。 */
    provider: "ollama", /* 第50天：结构化 JSON 模型由本地 Ollama 提供。 */
    model: "qwen2.5:7b", /* 第50天：底层使用 7B 参数模型平衡格式遵循与速度。 */
    capabilities: ["json", "summary", "chat"], /* 第50天：声明擅长严格 JSON 输出与总结能力。 */
    roles: ["json", "summary", "writing"], /* 第56天：声明结构化模型适合承担 JSON、摘要与规范化写作角色。 */
    cost: { inputPer1K: 0.0006, outputPer1K: 0.0012 }, /* 第50天：声明中等的输入输出单价。 */
    limits: { contextWindow: 16384, maxOutputTokens: 2048 }, /* 第50天：声明中等的上下文与输出限制。 */
    speed: "medium", /* 第50天：标记为中速模型。 */
    quality: "strong", /* 第50天：标记为强表达质量。 */
    fallbackModelIds: ["small-chat"], /* 第51天：结构化模型失败时回退到小型对话模型，保证仍能给出降级文本。 */
    timeoutMs: 18000, /* 第51天：结构化模型单次调用最多等待 18 秒。 */
    maxRetries: 1, /* 第51天：结构化模型失败后允许额外重试 1 次。 */
  }, /* 第50天：结束 json-structured 档案。 */
  { /* 第50天：定义 embedding（嵌入模型）档案。 */
    id: "embedding", /* 第50天：保存嵌入模型的逻辑标识。 */
    name: "Embedding（嵌入模型）", /* 第50天：保存嵌入模型的展示名称。 */
    provider: "ollama", /* 第50天：嵌入模型由本地 Ollama 提供。 */
    model: "nomic-embed-text", /* 第50天：底层使用 nomic-embed-text 生成向量。 */
    capabilities: ["embedding"], /* 第50天：声明只擅长向量嵌入能力。 */
    roles: ["embedding"], /* 第56天：声明嵌入模型只承担向量化角色。 */
    cost: { inputPer1K: 0.00002, outputPer1K: 0 }, /* 第50天：声明极低的输入单价且无输出计费。 */
    limits: { contextWindow: 8192, maxOutputTokens: 0 }, /* 第50天：嵌入模型不产生文本输出。 */
    speed: "fast", /* 第50天：标记为快速模型。 */
    quality: "basic", /* 第50天：标记为基础质量。 */
    fallbackModelIds: ["small-chat"], /* 第51天：教学项目中嵌入失败时回退到小模型生成降级说明，避免链路直接崩溃。 */
    timeoutMs: 10000, /* 第51天：嵌入模型单次调用最多等待 10 秒。 */
    maxRetries: 1, /* 第51天：嵌入模型失败后允许额外重试 1 次。 */
  }, /* 第50天：结束 embedding 档案。 */
  { /* 第50天：定义 evaluation（评估模型）档案。 */
    id: "evaluation", /* 第50天：保存评估模型的逻辑标识。 */
    name: "Evaluation（评估模型）", /* 第50天：保存评估模型的展示名称。 */
    provider: "ollama", /* 第50天：评估模型由本地 Ollama 提供。 */
    model: "qwen2.5:14b-instruct", /* 第50天：底层使用指令微调模型保证评估稳定。 */
    capabilities: ["evaluation", "reflection", "json"], /* 第50天：声明擅长评估、反思与结构化输出能力。 */
    roles: ["evaluation", "json", "reasoning"], /* 第56天：声明评估模型适合承担检查、结构校验与审慎推理角色。 */
    cost: { inputPer1K: 0.0012, outputPer1K: 0.0024 }, /* 第50天：声明偏高的输入输出单价。 */
    limits: { contextWindow: 32768, maxOutputTokens: 2048 }, /* 第50天：声明较大的上下文与中等输出限制。 */
    speed: "medium", /* 第50天：标记为中速模型。 */
    quality: "strong", /* 第50天：标记为强表达质量。 */
    fallbackModelIds: ["json-structured", "large-reasoning"], /* 第51天：评估模型失败时优先回退到 JSON 模型，再回退到大型推理模型。 */
    timeoutMs: 24000, /* 第51天：评估模型单次调用最多等待 24 秒。 */
    maxRetries: 1, /* 第51天：评估模型失败后允许额外重试 1 次。 */
  }, /* 第50天：结束 evaluation 档案。 */
]; /* 第50天：结束默认逻辑模型档案列表。 */

export function createDefaultModelRegistry(): ModelRegistry { /* 第50天：定义创建并初始化默认模型注册表的工厂函数。 */
  const registry = new ModelRegistry(); /* 第50天：创建一个空的模型注册表实例。 */
  registry.registerAll(DEFAULT_MODEL_PROFILES); /* 第50天：把五个默认逻辑模型登记到注册表。 */
  return registry; /* 第50天：返回已注册默认模型的注册表。 */
} /* 第50天：结束默认模型注册表工厂函数。 */

export const modelRegistry = createDefaultModelRegistry(); /* 第50天：导出进程内共享模型注册表供运行时、接口与前端复用。 */
