import { mkdir, readFile, writeFile } from "node:fs/promises"; /* 第53天增强：引入 Node.js 文件读写能力，用于本地持久化提示词注册表。 */
import path from "node:path"; /* 第53天增强：引入路径工具，保证 Windows 和其他系统路径拼接稳定。 */
import type { PromptRegistry } from "@/lib/prompts/prompt-registry"; /* 第53天增强：引入 PromptRegistry 类型，避免持久化层依赖具体单例。 */
import type { PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第53天增强：引入 PromptTemplate 类型作为 JSON 文件内容结构。 */

const PROMPT_DATA_DIR = path.join(process.cwd(), ".data"); /* 第53天增强：定义项目本地数据目录，放在当前 Next 项目根目录下。 */
const PROMPT_DATA_FILE = path.join(PROMPT_DATA_DIR, "prompts.json"); /* 第53天增强：定义提示词注册表持久化文件路径。 */
const hydratedRegistries = new WeakSet<object>(); /* 第53天增强：记录已经从文件恢复过的注册表，避免每个请求重复覆盖内存状态。 */

function isPromptTemplateArray(value: unknown): value is PromptTemplate[] { /* 第53天增强：定义持久化 JSON 结构类型守卫。 */
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && typeof (item as PromptTemplate).componentId === "string" && typeof (item as PromptTemplate).version === "string" && typeof (item as PromptTemplate).template === "string"); /* 第53天增强：只接受包含组件、版本和模板正文的数组。 */
} /* 第53天增强：结束持久化 JSON 结构类型守卫。 */

export async function hydratePromptRegistry(registry: PromptRegistry): Promise<void> { /* 第53天增强：定义从本地 JSON 恢复提示词注册表的方法。 */
  if (hydratedRegistries.has(registry)) return; /* 第53天增强：同一个注册表在当前进程内只恢复一次。 */
  try { /* 第53天增强：捕获文件不存在或 JSON 解析异常，避免影响默认提示词。 */
    const raw = await readFile(PROMPT_DATA_FILE, "utf8"); /* 第53天增强：读取本地提示词注册表 JSON。 */
    const parsed = JSON.parse(raw) as unknown; /* 第53天增强：解析 JSON 为未知结构再校验。 */
    if (!isPromptTemplateArray(parsed)) throw new Error("prompts.json 结构不是 PromptTemplate 数组。"); /* 第53天增强：结构不符合预期时明确失败。 */
    parsed.forEach((prompt) => registry.upsert(prompt)); /* 第53天增强：把持久化版本写回内存注册表，active 状态也会恢复。 */
  } catch (error) { /* 第53天增强：处理没有持久化文件或文件异常。 */
    if (!(error instanceof Error) || !("code" in error) || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error; /* 第53天增强：只有文件不存在可以忽略，其他错误交给 API 层暴露。 */
  } finally { /* 第53天增强：无论是否存在文件，都标记本轮注册表已尝试恢复。 */
    hydratedRegistries.add(registry); /* 第53天增强：防止后续 GET 请求重复读文件。 */
  } /* 第53天增强：结束恢复状态维护。 */
} /* 第53天增强：结束从本地 JSON 恢复提示词注册表的方法。 */

export async function persistPromptRegistry(registry: PromptRegistry): Promise<void> { /* 第53天增强：定义把当前提示词注册表保存到本地 JSON 的方法。 */
  await mkdir(PROMPT_DATA_DIR, { recursive: true }); /* 第53天增强：确保本地数据目录存在。 */
  const prompts = registry.list(); /* 第53天增强：读取当前内存注册表的全部提示词版本。 */
  await writeFile(PROMPT_DATA_FILE, `${JSON.stringify(prompts, null, 2)}\n`, "utf8"); /* 第53天增强：以可读 JSON 格式写入文件，方便学习和调试。 */
} /* 第53天增强：结束提示词注册表保存方法。 */
