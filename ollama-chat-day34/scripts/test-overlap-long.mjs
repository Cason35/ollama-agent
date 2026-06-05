/** 长文本 overlap 切块验证 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = "http://localhost:3000";
const STORE = path.join(ROOT, ".data", "knowledge-store.json");

const PARA = `Workflow Runtime 是多步骤 Agent 执行引擎，支持 DAG、并行与持久化。HITL 在关键步骤暂停等待用户确认。Tool Registry 统一注册工具与 capabilities。Memory 是会话上下文，RAG 是外部知识库。`;
const LONG = Array(4).fill(PARA).join("\n");

await fs.rm(STORE, { force: true });
const res = await fetch(`${BASE}/api/knowledge`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "长文overlap测试", content: LONG }),
});
const json = await res.json();
const data = json.data ?? json;
const chunkCount = data?.document?.chunkCount ?? data?.metrics?.chunks;
const raw = JSON.parse(await fs.readFile(STORE, "utf8"));
const chunks = raw.documents[0].chunks;
let overlapTextOk = false;
if (chunks.length >= 2) {
  const tail = chunks[0].text.slice(-30);
  overlapTextOk = chunks[1].text.includes(tail.slice(0, 15));
}
console.log(
  JSON.stringify({
    pass: chunkCount > 1 && overlapTextOk,
    textLen: LONG.length,
    chunkCount,
    noOverlapEstimate: Math.ceil(LONG.length / 500),
    chunkLengths: chunks.map((c) => c.text.length),
    overlapTextOk,
  }, null, 2)
);
