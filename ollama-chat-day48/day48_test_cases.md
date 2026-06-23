# Day 48 测试用例文档：Semantic Cache Runtime（语义缓存运行时）

本文档整理第 48 天 Advanced Optimization V1（高级优化第 1 版）——Semantic Cache Runtime（语义缓存运行时）的测试用例，覆盖 10 项验收标准。

- 自动化测试脚本：`scripts/test-day48-cache.ts`
- 运行命令：`npm run test:day48`
- 接口冒烟测试：`GET / POST / DELETE /api/cache`
- 前端验证：控制台「缓存」标签页（`app/components/CacheExplorer.tsx`）

---

## 一、核心约定

| 项目 | 值 |
| --- | --- |
| 命中阈值（Threshold） | `0.9`（Cosine Similarity，余弦相似度） |
| 默认 TTL 策略 | `24h`（24 小时） |
| 支持的 TTL 策略 | `24h` / `7d` / `never`（永不过期） |
| 淘汰策略 | LRU（Least Recently Used，最近最少使用） |
| 默认容量上限 | `50` 条 |
| 词元/费用估算 | 复用第 47 天 `estimateTokenCount` 与 `estimateUsageCost` |

> 说明：查询向量使用本地确定性算法（清洗疑问/填充词 + 词袋 + 字符二元组哈希 + 归一化），保证离线演示与自动化测试结果稳定，不依赖外部 Tokenizer 或模型。

---

## 二、自动化测试用例

### TC-01 Query Embedding 与 Similarity Search（任务 3、4）

对应函数：`testQueryEmbeddingAndSimilarity`

| 步骤 | 输入 | 期望结果 |
| --- | --- | --- |
| 1 | `cleanQuery("介绍 LangGraph")` | 返回 `"langgraph"`（剥离填充词，归一化） |
| 2 | `cosineSimilarity("LangGraph 是什么", "介绍 LangGraph")` | `≥ 0.9`，达到命中阈值 |
| 3 | `cosineSimilarity("LangGraph 是什么", "Redis 是什么")` | `< 0.9`，低于命中阈值 |

验收点：相同语义不同问法相似度高，无关查询相似度低。

---

### TC-02 SemanticCache 命中/未命中四案例（任务 1、2、10）

对应函数：`testSemanticCacheHitMiss`

前置：写入一条缓存 `"LangGraph 是什么"`。

| 序号 | 查询 | 期望状态 |
| --- | --- | --- |
| 1 | `LangGraph 是什么` | Hit（命中，完全相同） |
| 2 | `介绍 LangGraph` | Hit（命中，近义） |
| 3 | `LangGraph 有什么作用` | Hit（命中，另一种问法） |
| 4 | `Redis 是什么` | Miss（未命中，无关主题） |

验收点：完全对应任务 10 描述的 Case1 期望（Miss → Hit → Hit → Miss）。

---

### TC-03 Cache Metrics 缓存指标（任务 6）

对应函数：`testCacheMetrics`

步骤：写入 1 条缓存 → 命中 1 次（`介绍 LangGraph`）→ 未命中 1 次（`Redis 是什么`）。

| 指标 | 期望值 |
| --- | --- |
| `hitCount` | `1` |
| `missCount` | `1` |
| `hitRate` | `0.5` |
| `savedTokens` | `> 0` |
| `savedCost` | `> 0` |
| `avgLatencyReduction` | `> 0` |

验收点：命中率、节省词元、节省费用与平均延迟降低均被正确累计。

---

### TC-04 TTL 失效与 LRU 淘汰（任务 9）

对应函数：`testCacheTTLAndLRU`

TTL 部分（注入可控时钟）：

| 步骤 | 操作 | 期望结果 |
| --- | --- | --- |
| 1 | 写入 `24h` 策略缓存 | — |
| 2 | 立即检索 `介绍 LangGraph` | Hit（未过期） |
| 3 | 时钟前进 25 小时后再次检索 | Miss（超过 TTL，自动失效） |

LRU 部分（容量上限 = 2）：

| 步骤 | 操作 | 期望结果 |
| --- | --- | --- |
| 1 | 写入 `LangGraph 是什么` | — |
| 2 | 写入 `Redis 是什么` | — |
| 3 | 访问 `Redis 是什么`（更新最近使用） | — |
| 4 | 写入 `Kafka 是什么`（超出容量触发淘汰） | — |
| 5 | 检索 `LangGraph 是什么` | Miss（最久未访问被淘汰） |
| 6 | 检索 `Kafka 是什么` | Hit（新条目保留） |

验收点：TTL 到期条目自动失效；超容量时淘汰最近最少使用条目。

---

### TC-05 Agent Runtime 接入 Cache 与 Trace cache span（任务 5、7）

对应函数：`testAgentRuntimeCacheIntegration`

| 步骤 | 输入 | 期望结果 |
| --- | --- | --- |
| 1 | `answerWithCache("LangGraph 是什么")` | `cacheStatus = "miss"`，返回真实生成答案（非空） |
| 2 | `answerWithCache("介绍 LangGraph")` | `cacheStatus = "hit"`，`savedFromCache = true` |
| 3 | 对比耗时 | 命中耗时 `≤` 首次生成耗时 |
| 4 | 检查 Trace 跨度 | 至少存在 2 个 `type = "cache"` 的 Span |
| 5 | 检查 cache span 状态 | 同时存在 `cacheStatus = "hit"` 与 `"miss"` 的 Span |

验收点：未命中走正常智能体链路并写入缓存；命中直接返回；每次查询都在 Trace 中产生 cache span。

---

## 三、接口（API）测试用例

接口文件：`app/api/cache/route.ts`

| 用例 | 方法与路径 | 期望 |
| --- | --- | --- |
| API-01 读取快照 | `GET /api/cache` | `ok: true`，`data` 含 `entries`、`metrics`、`events`、`threshold` |
| API-02 重新运行演示 | `POST /api/cache` | 清空旧缓存并重跑演示，`events` 为 `Miss/Hit/Hit/Miss` |
| API-03 失效单条 | `DELETE /api/cache?id=<id>` | 删除指定条目并返回最新快照 |
| API-04 清空全部 | `DELETE /api/cache`（无 id） | 清空全部缓存并返回空 `entries` |

手动冒烟（开发服务器运行后）：

```bash
curl -X POST http://localhost:3000/api/cache    # 重新运行缓存演示
curl http://localhost:3000/api/cache            # 查看缓存快照
```

期望 `metrics.hitCount = 2`、`metrics.missCount = 2`、`metrics.hitRate = 0.5`。

---

## 四、前端（Cache Explorer）测试用例

组件：`app/components/CacheExplorer.tsx`（控制台「缓存」标签页）

| 用例 | 操作 | 期望 |
| --- | --- | --- |
| UI-01 缓存概览 | 打开「缓存概览」标签 | 展示 Hit Rate、Saved Cost、Hit/Miss、Saved Tokens、Avg Latency Reduction、Threshold |
| UI-02 缓存条目 | 打开「缓存条目」标签 | 列出每条查询、答案预览、命中次数、节省费用、TTL 与过期状态 |
| UI-03 查询事件 | 打开「查询事件」标签 | 展示 4 条事件，状态依次为 未命中 / 命中 / 命中 / 未命中 |
| UI-04 手动失效 | 点击条目「失效」按钮 | 该条目从列表移除，指标随之刷新 |
| UI-05 重新运行 | 点击「重新运行」 | 清空并重跑演示，命中率回到 50% |

---

## 五、验收标准对照表

| 序号 | 第 48 天验收标准 | 对应用例 | 结论 |
| --- | --- | --- | --- |
| 1 | 是否定义 CacheEntry（缓存条目） | TC-02、`lib/cache/cache-types.ts` | 是 |
| 2 | 是否实现 SemanticCache（语义缓存） | TC-02、`lib/cache/semantic-cache.ts` | 是 |
| 3 | 是否实现 Query Embedding（查询向量） | TC-01、`lib/cache/query-embedding.ts` | 是 |
| 4 | 是否实现 Similarity Search（相似度检索） | TC-01、TC-02 | 是 |
| 5 | Agent Runtime 是否接入 Cache | TC-05、`answerWithCache` | 是 |
| 6 | 是否增加 Cache Metrics（缓存指标） | TC-03 | 是 |
| 7 | Trace 是否接入 Cache（cache span） | TC-05 | 是 |
| 8 | 是否实现 Cache Explorer（缓存浏览器） | UI-01~UI-05、API-01~04 | 是 |
| 9 | 是否支持 TTL 与失效策略 | TC-04 | 是 |
| 10 | 是否完成 Cache Test（缓存测试） | 全部 TC + API + UI | 是 |

---

## 六、运行结果

```text
> npm run test:day48
Day 48 Semantic Cache Runtime tests passed.

> npm run test:day47
Day 47 Usage & Cost Observability tests passed.

> npm run build
✓ Compiled successfully
✓ /api/cache 路由已注册
```
