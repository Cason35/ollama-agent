# Day74 RAG 架构

## 生产数据分工

- MySQL：保存知识文档 ID、租户、对象键、内容摘要和状态。
- MinIO：保存原始文档、附件与导出文件。
- Redis：保存检索缓存、队列状态和临时锁。
- Vector Store：保存文档切片向量和索引版本。

`migrations/005_knowledge.sql` 创建租户隔离的知识文档元数据表。

## 功能开关

`enable_new_rag` 默认使用 25% 稳定灰度：

```text
SHA-256(flagKey + subjectId)
  → 0..99 Bucket
  → bucket < rolloutPercentage 时启用
```

同一个租户或用户会稳定落入同一个桶，不会因刷新页面随机切换版本。

## 备份范围

RAG 的可恢复备份至少包含：

1. MySQL 知识元数据。
2. MinIO 原始文档。
3. 向量索引版本与重建参数。
4. Prompt Version 与 Feature Flag 状态。
