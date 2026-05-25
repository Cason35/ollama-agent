# 24 天 Ollama Agent 课程 · 第 24 天测试用例（RAG Runtime）

> 面向 **`ollama-chat-day24`**。第 23 天用例见 `ollama-chat-day23/day23_test_cases.md`。  
> 本文 **§2** 为第 24 天主线；**§3** 为 day23 Capability Runtime 回归。

---

## 0. 测试前准备

### 0.1 环境

```bash
cd ollama-chat-day24
npm install
npm run dev
```

浏览器：**http://localhost:3000**

**Ollama（必做，Embedding 与 RAG 依赖）：**

```bash
ollama pull nomic-embed-text
# 确保 Ollama 在 http://localhost:11434 运行
```

可选：对话模型 `qwen2.5` 等（与 day23 相同）；MySQL / backend 模式仅影响 `searchHistory` 回归。

### 0.2 第 24 天验收焦点

| 对比项 | day23 | day24 |
|--------|-------|-------|
| 知识能力 | Memory 仅会话上下文 | **Local RAG 知识库** |
| 新工具 | 10 个 | **12 个（+ retrieval / ragAnswer）** |
| 向量 | 无 | **Ollama Embedding + Cosine TopK** |
| UI | Tool Explorer | **+ 知识导入 + RAG Debug** |
| API | `/api/tools` | **+ `/api/knowledge`、/api/knowledge/retrieve`** |

### 0.3 调试要点

- 知识持久化：项目根 `.data/knowledge-store.json`（已在 `.gitignore`）。
- 导入失败常见原因：Ollama 未启动或未 `pull nomic-embed-text`。
- `GET /api/tools`：`data.tools` 长度 **12**。
- 侧栏 **RAG 知识库** / **RAG Debug** 可观测 score、doc id、topK。

---

## 1. 用例总览

| 编号 | 主题 | 优先级 |
|------|------|--------|
| TC-24-01 | KnowledgeDocument / Chunk 类型与切块 | ⭐ 必测 |
| TC-24-02 | Ollama Embedding 接入 | ⭐ 必测 |
| TC-24-03 | POST /api/knowledge 导入知识 | ⭐ 必测 |
| TC-24-04 | Cosine Similarity + TopK 检索 | ⭐ 必测 |
| TC-24-05 | POST /api/knowledge/retrieve | 必测 |
| TC-24-06 | retrieval 工具 Workflow 执行 | 必测 |
| TC-24-07 | ragAnswer RAG Prompt 注入回答 | ⭐ 必测 |
| TC-24-08 | 前端 RAG Debug UI | 必测 |
| TC-24-09 | Knowledge Metrics | 必测 |
| TC-24-10 | GET /api/knowledge 指标与文档列表 | 必测 |
| TC-24-11 | GET /api/tools 注册 12 个工具 | 必测 |
| TC-24-12 | Planner capability → retrieval / ragAnswer | 必测 |
| TC-24-13 | 空库检索返回空 hits | 必测 |
| TC-24-14 | 导入后 retrievalCount 递增 | 必测 |
| TC-24-15 | day23 research / metrics 回归 | 回归 §3 |

---

## 2. RAG Runtime 详细用例

### TC-24-01 KnowledgeDocument / Chunking（必测 ⭐）

**步骤：**

1. 阅读 `lib/knowledge-types.ts`、`lib/knowledge-chunking.ts`。
2. 在 Node 或单元测试中调用 `chunkText("a".repeat(1200), 500)`。

**预期：**

- 返回 **3** 个字符串块（500+500+200）。
- `buildChunksForDocument("doc-1", text)` 生成带 `documentId` 的 `KnowledgeChunk[]`。

**失败判定：** 切块长度为 0；chunk id 不含 `documentId`。

---

### TC-24-02 Ollama Embedding（必测 ⭐）

**步骤：**

```bash
curl -s http://localhost:11434/api/embeddings -d "{\"model\":\"nomic-embed-text\",\"prompt\":\"Workflow Runtime\"}"
```

**预期：**

- HTTP 200，`embedding` 为非空数组。

**失败判定：** 连接拒绝；`embedding` 缺失。

---

### TC-24-03 导入知识 POST /api/knowledge（必测 ⭐）

**步骤：**

```bash
curl -s -X POST http://localhost:3000/api/knowledge \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Workflow Runtime 笔记\",\"content\":\"Workflow Runtime 负责 DAG 调度与 Tool 执行。Capability-based Agent 在 day23 引入组合工具。第24天加入 RAG 知识检索。\"}"
```

**预期：**

- HTTP **200**，`ok: true`。
- `data.document.chunkCount` ≥ **1**。
- `data.metrics.documents` ≥ **1**，`data.metrics.chunks` ≥ **1**。
- `.data/knowledge-store.json` 出现且含 `embedding` 数组。

**失败判定：** 500 且消息含 embedding failed；chunkCount 为 0。

---

### TC-24-04 Cosine + TopK 检索（必测 ⭐）

**前置：** 已完成 TC-24-03。

**步骤：**

```bash
curl -s -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"Workflow Runtime 是什么\",\"topK\":3}"
```

**预期：**

- `data.hits` 为数组，长度 ≤ **3**。
- 每条含 `text`、`score`（0–1）、`documentId`、`documentTitle`、`chunkId`。
- `score` 按降序排列（第一条最高）。

**失败判定：** hits 为空且库非空；缺少 score 字段。

---

### TC-24-05 GET /api/knowledge（必测）

**步骤：**

```bash
curl -s http://localhost:3000/api/knowledge
```

**预期：**

- `data.metrics` 含 `documents`、`chunks`、`avgChunkSize`、`retrievalCount`。
- `data.documents` 为数组；`data.lastRetrieval` 在 TC-24-04 后为非 null。

---

### TC-24-06 retrieval 工具（必测）

**步骤：**

1. 开启 **Workflow** 模式。
2. 发送：「请从知识库检索 Workflow Runtime 相关内容，capabilities 用 knowledge-retrieval」。
3. 或 Planner 产出 `action: retrieval` 的步骤。

**预期：**

- 步骤 `retrieval` 状态 **success**。
- `output.hits` 为非空数组（已导入知识前提下）。

**失败判定：** action 未映射为 retrieval；hits 始终为空（库已有数据时）。

---

### TC-24-07 ragAnswer RAG 注入（必测 ⭐）

**步骤：**

1. Workflow 目标：「根据知识库总结 Workflow Runtime」。
2. 步骤 `ragAnswer` 或 capabilities 含 `knowledge-answer`。

**预期：**

- 步骤成功；`output.answer` 为中文回答。
- `output.hits` 含引用片段。
- 服务端 Prompt 使用 `buildRagPrompt`（含【知识片段】【用户问题】结构，见 `lib/knowledge-rag.ts`）。

**失败判定：** 回答与知识库完全无关且 hits 非空；无 hits 字段。

---

### TC-24-08 前端 RAG Debug UI（必测）

**步骤：**

1. 侧栏 **RAG 知识库**：粘贴笔记 → **Import 导入**。
2. **RAG Debug**：Query 填 `Workflow Runtime`，topK=3 → **检索**。

**预期：**

- 指标行显示 docs / chunks / retrieval 计数。
- Retrieved 列表展示 `score`、`doc: xxx`、片段摘要。

**失败判定：** 导入无反应；检索列表不更新。

---

### TC-24-09 Knowledge Metrics（必测）

**步骤：**

1. 记录 `GET /api/knowledge` 的 `retrievalCount`。
2. 执行 2 次 TC-24-04。
3. 再次 GET。

**预期：**

- `retrievalCount` 增加 **2**（或累计增加）。
- `avgChunkSize` 为合理正整数。

---

### TC-24-10 空库检索（必测）

**步骤：**

1. 删除 `.data/knowledge-store.json` 后重启 dev（或新环境）。
2. `POST /api/knowledge/retrieve` query=任意。

**预期：**

- `hits` 为 **[]**，HTTP 200。

---

### TC-24-11 GET /api/tools 12 工具（必测）

**步骤：**

```bash
curl -s http://localhost:3000/api/tools
```

**预期：**

- `data.tools.length` === **12**。
- 含 `retrieval`（capabilities: `knowledge-retrieval`）、`ragAnswer`（含 `knowledge-answer`）。

---

### TC-24-12 Capability Routing（必测）

**步骤：**

1. 查看 `lib/tool-registry.ts` 中 `resolveActionFromCapabilities`。
2. Planner Prompt 含 knowledge 相关能力说明。

**预期：**

- `knowledge-retrieval` → `retrieval`。
- `knowledge-answer` → `ragAnswer`。

---

## 3. day23 回归（可选）

| 编号 | 内容 | 预期 |
|------|------|------|
| TC-24-15a | `research` 组合仍成功 | summary + todo 输出 |
| TC-24-15b | Tool metrics 仍递增 | weather 等 calls 变化 |
| TC-24-15c | Tool Explorer 展示 12 工具 | 含 dependencies 树 |

---

## 4. 第 24 天打卡模板

```text
【第24天打卡】

1. 是否实现 KnowledgeDocument：是 / 否
2. 是否实现 chunking：是 / 否
3. 是否接入 Ollama Embedding：是 / 否
4. 是否保存 embedding：是 / 否
5. 是否实现 cosine similarity：是 / 否
6. 是否实现 retrievalTool：是 / 否
7. 是否实现 RAG prompt injection：是 / 否
8. 前端是否展示 retrieved chunks：是 / 否
9. 是否支持知识导入：是 / 否
10. 是否增加 retrieval metrics：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
Knowledge-aware Agent Runtime V1 + Capability Runtime V2 + …
```

---

*测试文档版本：2026-05-25（第 24 天 RAG）；实现见 `lib/knowledge-*.ts`、`app/api/knowledge/*`。*
