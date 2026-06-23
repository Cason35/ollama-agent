# Day 49 测试用例文档（Long-Term Memory V2 长期记忆第 2 版）

本文件整理第 49 天 `ollama-chat-day49` 项目的测试用例，覆盖自动化测试（`scripts/test-day49-memory.ts`）与手动验证（Memory Explorer V2 面板 / `/api/memory` 接口）。

- 自动化测试运行命令：`npm run test:day49`
- 开发预览运行命令：`npm run dev`，打开右侧控制台「记忆」标签页
- 核心主题：`Cache（缓存）负责避免重复思考，Long-Term Memory（长期记忆）负责积累经验。`

---

## 一、自动化测试用例（`npm run test:day49`）

### TC-01 记忆存储增删改查（对应任务 1、任务 2、任务 9）

| 项目 | 内容 |
| --- | --- |
| 测试函数 | `testMemoryStoreCrud` |
| 前置条件 | 新建独立 `LongTermMemoryStore` |
| 步骤 | 1. `add({ type: "fact", content: "LangGraph 是图式工作流框架" })`；2. `update(id, { importance: 0.95 })`；3. `stats()`；4. `delete(id)` |
| 预期结果 | 类型正确写入；自动生成 `embedding`（向量）；更新后 `importance = 0.95`；`totalMemories = 1`；删除返回 `true`；删除后 `totalMemories = 0` |
| 验收点 | MemoryItemV2 字段完整、LongTermMemoryStore 的 add/retrieve/update/delete/stats 可用 |

### TC-02 经验提取（对应任务 3）

| 项目 | 内容 |
| --- | --- |
| 测试函数 | `testExperienceExtraction` |
| 步骤 | 1. `deriveTopic("研究 LangGraph")`；2. `extractExperiences({ goal, topAgents: ["research:92"], evaluations: [{ agentId: "research", score: 92 }], reflectionSuggestions: ["补充关键概念与边界条件"] })` |
| 预期结果 | 主题提炼为 `LangGraph`；至少生成一条 `type = lesson`（教训）；经验内容包含主题 `LangGraph`；生成一条 `type = decision`（协作策略决策） |
| 验收点 | 能从 Workspace / Reflection / Evaluation 中自动提取经验，并落为 lesson |

### TC-03 综合打分检索（对应任务 6）

| 项目 | 内容 |
| --- | --- |
| 测试函数 | `testMemoryRetrievalV2` |
| 前置数据 | 高重要性教训「LangGraph 是图式工作流框架……」(importance 0.9) + 无关事实「Redis 是内存数据库」(importance 0.5) |
| 步骤 | `retrieve("介绍 LangGraph", { topK: 2 })` |
| 预期结果 | 返回结果非空；语义最相关的 LangGraph 记忆排首位；综合分满足 `score >= 0.5×语义 + 0.3×重要性`（公式：`0.5×semantic + 0.3×importance + 0.2×recency`） |
| 验收点 | Memory Retrieval V2 综合 semantic + importance + recency + access frequency |

### TC-04 记忆整合（对应任务 4）

| 项目 | 内容 |
| --- | --- |
| 测试函数 | `testMemoryConsolidation` |
| 前置数据 | 写入 5 条完全相同的教训「LangGraph DAG（有向无环图）很重要」 |
| 步骤 | `consolidateMemories()` |
| 预期结果 | 整合前 `totalMemories = 5`；整合后 `after = 1`、`removed = 4`；整合后记忆 `consolidatedFrom = 5` |
| 验收点 | 重复经验被压缩为一条，并保留整合来源条数 |

### TC-05 重要性衰减（对应任务 5）

| 项目 | 内容 |
| --- | --- |
| 测试函数 | `testImportanceDecay` |
| 前置数据 | 两条 importance 均为 0.8 的记忆（LangGraph / Redis）；对 Redis 记忆检索 10 次抬高访问次数 |
| 步骤 | `importanceDecay()` |
| 预期结果 | 至少一条记忆发生衰减（`decayed > 0`）；高访问量的 Redis 记忆衰减更慢，最终 `importance` 高于低访问量的 LangGraph 记忆 |
| 验收点 | 重要性随时间下降，但 accessCount 越高衰减越慢 |

### TC-06 Agent Runtime 接入长期记忆（对应任务 7、任务 10）

| 项目 | 内容 |
| --- | --- |
| 测试函数 | `testAgentRuntimeMemoryIntegration` |
| 步骤 | 1. 依次 `answerWithLongTermMemory("研究 LangGraph" / "研究 CrewAI" / "研究 MCP…")`；2. `answerWithLongTermMemory("如何学习 Agent（智能体）？")` |
| 预期结果 | 多次研究后自动生成 `lesson`（教训）记忆；提问学习路径时 `retrievedExperiences.length > 0`（复用历史经验）；返回答案非空；Trace 中 `type === "memory"` 的 span 数量 `>= 2` |
| 验收点 | Research 执行时 Prompt 升级为 Prompt + Long-Term Experience，并在 Trace 中以 memory span 观测检索与写回 |

**全部通过时输出：** `Day 49 Long-Term Memory V2 tests passed.`

---

## 二、接口测试用例（`/api/memory`）

| 编号 | 方法 | 用例 | 预期 |
| --- | --- | --- | --- |
| API-01 | `GET /api/memory` | 读取最近长期记忆快照 | `ok = true`，`data` 含 `items` / `metrics` / `retrieval` / `consolidation`；首次访问会自动跑演示链路 |
| API-02 | `POST /api/memory` | 强制重跑记忆演示 | 清空旧记忆后重新生成快照，`msg = "long-term memory demo rerun completed"` |
| API-03 | `PATCH /api/memory`（body：`{ id, pinned: true }`） | 置顶单条记忆 | 目标记忆 `pinned = true`、`importance = 1`，返回最新快照 |
| API-04 | `PATCH /api/memory`（缺少 `id`） | 参数校验 | `ok = false`，提示「缺少要更新的记忆 id」 |
| API-05 | `DELETE /api/memory?id=xxx` | 删除单条记忆 | 对应记忆被删除，返回最新快照 |
| API-06 | `DELETE /api/memory`（无 id） | 清空全部记忆 | 全部记忆被清空，`msg = "memory cleared"` |

---

## 三、前端手动验证用例（Memory Explorer V2 · 控制台「记忆」标签页）

| 编号 | 操作 | 预期 |
| --- | --- | --- |
| UI-01 | 打开页面，右侧控制台默认停在「记忆」标签页 | 顶部徽标显示 `Day 49`；标题为「Memory Explorer V2（长期记忆浏览器）」 |
| UI-02 | 查看「记忆概览」子页 | 展示记忆总数、检索命中率、平均重要性、平均访问次数、整合压缩比、衰减条目数与类型分布；并显示整合摘要（如 `8 条 → 4 条`） |
| UI-03 | 切换「记忆条目」子页并点击类型筛选（教训 / 决策 / 经验 / 事实 / 偏好 / 全部） | 列表按所选类型过滤，展示重要性、置信度、访问次数、最近访问时间与来源 |
| UI-04 | 点击某条记忆的「置顶」按钮 | 该记忆标记为「置顶」，重新加载后排在列表最前 |
| UI-05 | 点击某条记忆的「删除」按钮 | 该记忆从列表移除，指标随之更新 |
| UI-06 | 切换「经验检索」子页 | 展示「如何学习 Agent（智能体）？」的检索综合分及语义 / 重要性 / 新近度三个分量 |
| UI-07 | 点击「重新运行」 | 重新生成研究 LangGraph / CrewAI / MCP 的经验记忆与整合结果 |
| UI-08 | 检查浏览器标签页标题 | 显示「Day 49 - Long-Term Memory V2 | Advanced Optimization V2」 |

---

## 四、第 49 天验收标准对照

| 验收项 | 实现位置 | 状态 |
| --- | --- | --- |
| 1. 定义 MemoryItemV2 | `lib/memory/long-term-memory-types.ts` | ✅ |
| 2. 实现 LongTermMemoryStore | `lib/memory/long-term-memory-store.ts` | ✅ |
| 3. Experience Extraction（经验提取） | `lib/memory/experience-extraction.ts` | ✅ |
| 4. Memory Consolidation（记忆整合） | `LongTermMemoryStore.consolidateMemories()` | ✅ |
| 5. Importance Decay（重要性衰减） | `LongTermMemoryStore.importanceDecay()` | ✅ |
| 6. 升级 Memory Retrieval（记忆检索 V2） | `LongTermMemoryStore.retrieve()` | ✅ |
| 7. Agent Runtime 接入 Long-Term Memory | `AgentRuntime.answerWithLongTermMemory()` + Prompt 注入 | ✅ |
| 8. Memory Explorer V2 | `app/components/MemoryExplorerV2.tsx` + `app/api/memory/route.ts` | ✅ |
| 9. Memory Metrics（记忆指标） | `LongTermMemoryStore.stats()` | ✅ |
| 10. Long-Term Memory Test（长期记忆测试） | `scripts/test-day49-memory.ts` | ✅ |
