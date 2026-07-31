# ADR-002：MySQL 与 Vector Store 分工存储

## Problem
事务元数据和语义向量具有不同查询、一致性与扩缩容要求。
## Decision
MySQL 保存用户、租户、工作流和文档元数据，Vector Store 保存 Embedding 与相似度索引。
## Alternatives
全部存 MySQL、全部存向量数据库、文档型数据库。
## Trade-off
获得清晰的数据模型和专业检索能力，但必须维护 ID、版本和删除操作的一致性。
## Consequence
索引可独立重建，MySQL 保持事实源，检索结果必须回查租户和版本元数据。
