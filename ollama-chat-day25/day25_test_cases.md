# 第25天测试用例：RAG Runtime V2

> 项目：`ollama-chat-day25` · 前置：Ollama 已启动，`nomic-embed-text` 可用 · 服务：`npm run dev`（默认 `http://localhost:3000`）

**最近实测**：2026-05-26 · 环境 `http://localhost:3000` · 脚本 `scripts/run-day25-tests.mjs`、`npx tsx scripts/test-five-questions.mjs`

---

## 1. 环境与前置

| 项 | 要求 |
|----|------|
| Ollama | `ollama pull nomic-embed-text` |
| 聊天模型 | 本地已 pull 的 chat 模型（如 `qwen2.5`） |
| 数据目录 | `.data/knowledge-store.json`（导入后生成） |

**建议测试笔记正文**（Import 时粘贴，标题可填「Agent 学习笔记」）：

```text
Workflow Runtime 是多步骤 Agent 执行引擎，支持 DAG、并行与持久化。
HITL（Human-in-the-Loop）在关键步骤暂停，等待用户确认后再继续。
Tool Registry 统一注册工具名、capabilities 与 Schema，Planner 按能力路由到具体 action。
Memory 是会话内短期/长期上下文；RAG 是外部知识库，通过 embedding 检索后注入 Prompt。
当知识库无足够相关片段时，系统应返回 fallback，而不是编造知识库内容。
```

---

## 2. 自动化 / API 测试

### TC-25-01 Overlap 切块（必测 ⭐）

**步骤**

1. 清空或删除 `.data/knowledge-store.json` 后重启 dev。
2. 导入上述测试笔记（正文约 200+ 字）。
3. `GET /api/knowledge` 查看 `chunks` 数量。

**预期**

- 块数 **大于** 仅用 `length/500` 的无重叠估算（overlap 会增加块数）。
- 相邻块文本在边界处有 **重叠**（可用检索命中或 store 文件抽查 `chunks[].text`）。

**curl 导入**

```bash
curl -s -X POST http://localhost:3000/api/knowledge \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Agent学习笔记\",\"content\":\"Workflow Runtime 是多步骤...（完整正文）\"}"
```

---

### TC-25-02 Chunk metadata（必测）

**步骤**

1. 打开 `.data/knowledge-store.json` 中任一块。
2. 或 `POST /api/knowledge/retrieve` 查看返回 `hits[]`。

**预期**

- Store 中每块含：`index`、`startOffset`、`endOffset`、`tokenEstimate`（可选）。
- API `hits` 含：`chunkIndex`、`startOffset`、`endOffset`。

---

### TC-25-03 TopK 控制（必测）

```bash
curl -s -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"Workflow Runtime\",\"topK\":5}"
```

**预期**

- 返回 `hits.length <= 5`。
- 响应含 `topK: 5`。

---

### TC-25-04 minScore 阈值（必测 ⭐）

```bash
# 高阈值：应常出现 0 条
curl -s -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"Workflow Runtime\",\"topK\":5,\"minScore\":0.99}"

# 低阈值：应有命中
curl -s -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"Workflow Runtime\",\"topK\":5,\"minScore\":0.1}"
```

**预期**

- `minScore: 0.99` 时 `hits` 多为空数组。
- `minScore: 0.1` 时 `hits` 非空（已 Import 前提下）。
- `metrics.retrieval.noResultCount` 在高阈值无结果时递增。

---

### TC-25-05 无结果 fallback（必测 ⭐）

**步骤**

1. 空库或 `minScore=0.99` 检索后，在 Workflow 中执行 `ragAnswer` 步骤，问题：「量子纠缠是什么？」（不在笔记中）。

**预期**

- 返回 `answer` 含：`知识库中没有找到足够相关的信息`（或等价 fallback 文案）。
- `hits` 为空数组；`usedFallback: true`（工具输出 JSON 中）。

**失败判定**：无命中仍调用 LLM 并编造「知识库」细节。

---

### TC-25-06 RAG Prompt V2（必测）

**步骤**

1. 先 Import 笔记，再对「HITL 的作用」触发 `ragAnswer` 或检索后对话。

**预期**

- 回答基于笔记中 HITL 描述，不编造未导入内容。
- 回答末尾或过程中能体现「参考片段」意识（Prompt 要求列出 chunk）。

---

### TC-25-07 RAG Debug Panel UI（必测）

**步骤**

1. 侧栏 **RAG Debug Panel** 输入 Query、调整 TopK（如 5）、MinScore（如 0.3），点击「检索」。

**预期**

| 字段 | 展示 |
|------|------|
| Query | 与输入一致 |
| TopK | 与输入一致 |
| MinScore | 与输入一致 |
| Similarity Score | 每条 hit 的 `score` |
| Document Title | `documentTitle` |
| Chunk Index | `chunk #N` |
| Offset | `startOffset-endOffset` |

---

### TC-25-08 RAG Metrics（必测）

**步骤**

1. 连续检索 3 次（含 1 次高 minScore 无结果）。
2. 查看侧栏指标或 `GET /api/knowledge`。

**预期**

- `metrics.retrieval.queryCount` ≥ 3
- `avgTopScore`、`avgRetrievedChunks`、`noResultCount` 有合理数值

### §2 实测汇总（2026-05-26）

| 用例 | 结果 | 实测要点 |
|------|------|----------|
| TC-25-01 Overlap 切块 | **通过**（长文单元测试） | 1500 字符：`chunkCount=4`，无重叠估算 `3`，`overlapOk=true`。短笔记（约 257 字）仅 **1 块** 属正常，不能用来验 overlap。 |
| TC-25-02 Chunk metadata | **通过** | store / API：`index`、`startOffset`、`endOffset`、`tokenEstimate`；`hits` 含 `chunkIndex`、offset。 |
| TC-25-03 TopK | **通过** | `topK=5`，`hitCount=1`（≤5），响应 `topK: 5`，`topScore≈0.746`。 |
| TC-25-04 minScore | **通过** | `minScore=0.99` → `highHits=0`；`minScore=0.1` → `lowHits=1`；`noResultCount` 递增。 |
| TC-25-05 无结果 fallback | **通过**（`executeRagAnswer`） | `hits=[]` 时：`usedFallback=true`，answer 含「知识库中没有找到足够相关的信息…」。仅 retrieve「量子纠缠」+ `minScore=0.3` 仍可能命中（score≈0.74），不能代替 fallback 验收。 |
| TC-25-06 RAG Prompt V2 | **通过**（五题 LLM） | 回答基于笔记、含「参考片段」；未见明显编造。 |
| TC-25-07 RAG Debug Panel | **通过**（API 字段） | TopK / minScore / score / chunkIndex / offset 已在 retrieve 响应验证；UI 未人工点选。 |
| TC-25-08 RAG Metrics | **通过** | `queryCount≥4`，`avgTopScore≈0.559`，`noResultCount≥1`，`avgRetrievedChunks≈0.75`。 |

**复现命令**

```bash
cd ollama-chat-day25
npm run dev
node scripts/run-day25-tests.mjs
npx tsx scripts/test-five-questions.mjs
npx tsx scripts/test-chunk-overlap-unit.mjs   # 1500 字 overlap 单元验证
```

---

## 3. 五个验收问题（任务 9）

导入 §1 测试笔记后，通过 `npx tsx scripts/test-five-questions.mjs`（检索 + `executeRagAnswer`）记录如下。

| # | 问题 | 检索是否正确 chunk | 回答是否准确 | 是否幻觉 | topScore | 备注 |
|---|------|-------------------|-------------|---------|----------|------|
| 1 | Workflow Runtime 是什么？ | **是** | **是** | **否** | 0.814 | 命中含「执行引擎 / DAG」；回答列出参考 Chunk |
| 2 | HITL 的作用是什么？ | **是** | **是** | **否** | 0.797 | 回答：关键步骤暂停、等待用户确认 |
| 3 | Tool Registry 解决了什么问题？ | **是** | **是** | **否** | 0.822 | 回答：统一注册工具与 capabilities、路由 action |
| 4 | Memory 和 RAG 有什么区别？ | **是** | **是** | **否** | 0.796 | 回答：Memory=会话上下文，RAG=外部知识库+检索注入 |
| 5 | 如果知识库没有相关内容，系统会怎么回答？ | **是**（0 命中） | **是** | **否** | — | Q5 检索 `minScore=0.99`；`usedFallback=true`，固定 fallback 文案 |

**第 5 题预期**：明确 fallback，不编造知识库内容。实测符合。

**回答摘要（预览）**

1. Workflow Runtime 是多步骤 Agent 执行引擎，支持 DAG、并行与持久化…参考片段：Chunk 1, 2
2. HITL 在关键步骤暂停，等待用户确认…参考片段：Chunk 1, 3, 5
3. Tool Registry 统一管理工具与 capabilities，并路由到具体 action…
4. Memory 是会话上下文；RAG 是外部知识库，检索后注入 Prompt…
5. 「知识库中没有找到足够相关的信息，我只能基于当前对话回答。」

**说明**

- 短文本 Import（§1 笔记约 257 字）只会产生 1 个 chunk；验证 overlap 请用 ≥1500 字长文或 `test-chunk-overlap-unit.mjs`。
- 离题问题在同一篇中文笔记下仍可能 retrieve 到较高分片段；无知识场景应测 `ragAnswer` + 空 hits 或高 `minScore`。

---

## 4. 回归（day24 能力未破坏）

| ID | 说明 |
|----|------|
| TC-25-R01 | `GET /api/tools` 仍含 `retrieval`、`ragAnswer` |
| TC-25-R02 | Workflow + HITL + MySQL/local 存储仍可用 |
| TC-25-R03 | `POST /api/knowledge` 导入失败时返回 Envelope 错误 |

---

## 5. 验收清单对照

| # | 验收项 | 对应用例 | 实测（2026-05-26） |
|---|--------|----------|-------------------|
| 1 | overlap chunking | TC-25-01 | **通过**（长文 1500 字） |
| 2 | chunk metadata | TC-25-02 | **通过** |
| 3 | topK | TC-25-03 | **通过** |
| 4 | minScore | TC-25-04 | **通过** |
| 5 | 无结果 fallback | TC-25-05 | **通过** |
| 6 | RAG prompt 优化 | TC-25-06 | **通过** |
| 7 | RAG Debug Panel | TC-25-07 | **通过**（API；UI 未手点） |
| 8 | RAG metrics | TC-25-08 | **通过** |
| 9 | 5 个测试问题 | §3 | **通过** |

---

*测试文档版本：2026-05-26（第 25 天 RAG V2）；实测记录写入：2026-05-26*
