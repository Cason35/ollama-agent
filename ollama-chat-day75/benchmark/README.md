# Agent Platform v1.0 Benchmark

## 目的与证据边界

本目录提供可复现协议和代码层基线，不把未执行的真实模型、Docker 或生产流量结果伪装成事实。`results.json` 中 `verified` 表示本地静态自动验收已经执行；`planned` 表示需要完整环境后采集。

## 测试环境

- OS：Windows，PowerShell。
- Node.js：以执行时 `node --version` 为准并写入报告。
- 应用版本：`v1.0.0`；Next.js `16.2.12`；React `19.2.4`。
- 完整环境：Docker Compose + MySQL + Redis + MinIO + Ollama；模型名称与量化版本必须记录。

## 数据与参数

| 领域 | 数据规模 | 执行次数 | 参数 | 指标 |
| --- | ---: | ---: | --- | --- |
| Agent | 50 个分层任务 | 3 轮 | temperature=0，固定 Prompt / Model | Success Rate、Task Completion Rate |
| Workflow | 100 个含故障 DAG | 3 轮 | 固定并发、重试和超时 | Avg Duration、Failure Recovery Rate |
| RAG | 200 个带 Gold Citation 查询 | 3 轮 | topK=10，rerankK=5 | Recall@K、Citation Accuracy |
| Model | 100 个固定输入 | 3 轮 | 固定模型与上下文长度 | P50/P95 Latency、Token、Cost、Quality |
| System | 100 并发、持续 60 秒 | 3 轮 | 相同镜像和硬件 | Throughput、Error Rate、P95 Latency |

## 复现命令

```powershell
npm ci
npm run typecheck
npm run test:all
npm run build
docker compose up -d --build
npm run load:test
npm run failure:test
```

每轮执行前记录 Git Commit、数据库版本、索引版本、模型、硬件、冷/热缓存状态和时间；结果追加到不可变原始报告，再汇总进 `results.json`。

## 当前结果

- Portfolio Acceptance：12 项交付物、10 ADR、5 图、30+ 问答、v1.0.0 元数据由 `test:day75` 验证。
- Agent / Workflow / RAG / Model / System：协议已定义，真实数值必须在完整基础设施和指定模型启动后采集。
