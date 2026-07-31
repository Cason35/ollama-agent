-- 第74天：创建生产知识文档索引表。
CREATE TABLE IF NOT EXISTS knowledge_documents ( -- 第74天：保存知识文档元数据和对象存储位置。
  id VARCHAR(96) PRIMARY KEY, -- 第74天：保存知识文档唯一标识。
  tenant_id VARCHAR(64) NOT NULL, -- 第74天：保存知识文档所属租户。
  title VARCHAR(255) NOT NULL, -- 第74天：保存知识文档标题。
  object_key VARCHAR(512) NOT NULL, -- 第74天：保存 MinIO 对象键。
  content_hash CHAR(64) NOT NULL, -- 第74天：保存文档内容 SHA-256 摘要。
  status ENUM('active','archived','deleted') NOT NULL DEFAULT 'active', -- 第74天：保存知识文档生命周期状态。
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 第74天：保存知识文档创建时间。
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 第74天：保存知识文档更新时间。
  INDEX idx_knowledge_tenant_status (tenant_id, status) -- 第74天：加速租户知识文档筛选。
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; -- 第74天：使用支持事务和中文的存储配置。
