/**
 * 第24天：Ollama Embedding — 本地向量生成（nomic-embed-text）。
 */

/** 默认 Embedding 模型名（需 `ollama pull nomic-embed-text`）。 */
export const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text"; // Ollama 嵌入模型

/** Ollama API 根地址（可用环境变量覆盖）。 */
export const OLLAMA_EMBED_BASE_URL =
  process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") || "http://localhost:11434"; // 去掉尾部斜杠

/** Ollama /api/embeddings 响应体（仅取 embedding 数组）。 */
type OllamaEmbeddingResponse = {
  embedding?: number[]; // 向量
};

/**
 * 调用 Ollama 为单段文本生成 embedding 向量。
 * @param text 待嵌入文本
 * @param model 模型名
 */
export async function embedText(
  text: string,
  model: string = DEFAULT_EMBEDDING_MODEL
): Promise<number[]> {
  const prompt = text.trim(); // 规范化输入
  if (!prompt) return []; // 空串不请求 API
  const res = await fetch(`${OLLAMA_EMBED_BASE_URL}/api/embeddings`, {
    method: "POST", // HTTP POST
    headers: { "Content-Type": "application/json" }, // JSON 请求头
    body: JSON.stringify({ model, prompt }), // Ollama 嵌入请求体
  }); // fetch 结束
  if (!res.ok) {
    const errText = await res.text().catch(() => ""); // 尝试读错误体
    throw new Error(`Ollama embedding failed (${res.status}): ${errText.slice(0, 200)}`); // 抛出可读错误
  }
  const data = (await res.json()) as OllamaEmbeddingResponse; // 解析 JSON
  const embedding = data.embedding; // 取向量字段
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Ollama embedding response missing embedding array"); // 响应不合法
  }
  return embedding; // 返回浮点数组
}

/**
 * 批量为多个文本块生成 embedding（顺序调用，避免压垮本地 Ollama）。
 * @param texts 文本列表
 * @param model 模型名
 */
export async function embedTexts(
  texts: string[],
  model: string = DEFAULT_EMBEDDING_MODEL
): Promise<number[][]> {
  const vectors: number[][] = []; // 结果数组
  for (const t of texts) {
    vectors.push(await embedText(t, model)); // 逐条嵌入
  }
  return vectors; // 与 texts 一一对应
}
