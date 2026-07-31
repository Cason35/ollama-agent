# ADR-006：RAG 检索后执行 Rerank

## Problem
向量 Top-K 更偏语义相似，不一定最相关，也难兼顾关键词和时间等信号。
## Decision
先混合召回扩大候选集，再用 Rerank 综合语义、关键词、质量与新鲜度排序。
## Alternatives
仅向量检索、仅关键词检索、让大模型读取全部候选。
## Trade-off
提升 Recall 与 Citation Accuracy，但增加一次排序延迟和计算成本。
## Consequence
分别监控召回与重排指标，保留降级到原始排序的能力并记录索引版本。
