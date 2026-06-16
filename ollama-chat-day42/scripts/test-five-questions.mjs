/**
 * 五题验收：检索 + ragAnswer（有命中时调 LLM）。
 */
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = "http://localhost:3000";

process.chdir(ROOT);

const { executeRagAnswer } = await import(
  pathToFileURL(path.join(ROOT, "lib/knowledge-rag.ts")).href
);

const rt = {
  provider: "local",
  ollamaUrl: process.env.OLLAMA_API_URL || "http://localhost:11434/api/chat",
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:14b",
  mimoBaseUrl: "",
  mimoApiKey: "",
  mimoModel: "",
};

async function retrieve(query, minScore = 0.3) {
  const res = await fetch(`${BASE}/api/knowledge/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, topK: 5, minScore }),
  });
  const json = await res.json();
  return json.data ?? json;
}

const questions = [
  { q: "Workflow Runtime 是什么？", kw: ["Workflow Runtime", "执行引擎", "DAG"] },
  { q: "HITL 的作用是什么？", kw: ["HITL", "暂停", "确认"] },
  { q: "Tool Registry 解决了什么问题？", kw: ["Tool Registry", "capabilities", "路由"] },
  { q: "Memory 和 RAG 有什么区别？", kw: ["Memory", "RAG", "会话", "知识库"] },
  { q: "如果知识库没有相关内容，系统会怎么回答？", kw: ["知识库中没有找到", "fallback"], offTopic: true },
];

const rows = [];
for (const item of questions) {
  const query = item.offTopic ? "量子纠缠是什么" : item.q;
  const minScore = item.offTopic ? 0.99 : 0.3;
  const ret = await retrieve(query, minScore);
  const hits = ret.hits ?? [];
  const textBlob = hits.map((h) => h.text).join(" ");
  const retrievedOk = item.offTopic
    ? hits.length === 0
    : item.kw.some((k) => textBlob.includes(k));
  const rag = await executeRagAnswer(item.q, hits, rt);
  const answer = rag.answer;
  let accurate;
  let hallucination;
  if (item.offTopic) {
    accurate = rag.usedFallback && answer.includes("知识库中没有找到足够相关的信息");
    hallucination = !accurate && answer.length > 50;
  } else {
    accurate = item.kw.filter((k) => answer.includes(k)).length >= 2;
    hallucination =
      hits.length > 0 && !item.kw.some((k) => answer.includes(k)) && answer.length > 80;
  }
  rows.push({
    question: item.q,
    retrievedOk,
    hitCount: hits.length,
    topScore: hits[0]?.score ?? null,
    answerAccurate: accurate,
    hallucination,
    answerPreview: answer.slice(0, 150),
    usedFallback: rag.usedFallback,
  });
}
console.log(JSON.stringify(rows, null, 2));
