/**
 * 直接验证 executeRagAnswer 无命中时的 fallback（不经过 Workflow）。
 */
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

process.chdir(ROOT);
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

const { executeRagAnswer, RAG_NO_KNOWLEDGE_FALLBACK } = await import(
  pathToFileURL(path.join(ROOT, "lib/knowledge-rag.ts")).href
);

const rt = {
  provider: "local",
  model: process.env.OLLAMA_MODEL || "qwen2.5:7b",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
};

const result = await executeRagAnswer("量子纠缠是什么？", [], rt);
console.log(
  JSON.stringify(
    {
      pass:
        result.usedFallback === true &&
        result.hits.length === 0 &&
        result.answer.includes("知识库中没有找到足够相关的信息"),
      answer: result.answer,
      usedFallback: result.usedFallback,
      expectedSnippet: RAG_NO_KNOWLEDGE_FALLBACK.slice(0, 12),
    },
    null,
    2
  )
);
