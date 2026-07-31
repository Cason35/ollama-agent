-- 第74天：创建长期记忆生产持久化表。
CREATE TABLE IF NOT EXISTS memories ( -- 第74天：保存用户与租户长期记忆。
  id VARCHAR(96) PRIMARY KEY, -- 第74天：保存记忆唯一标识。
  tenant_id VARCHAR(64) NOT NULL, -- 第74天：保存记忆所属租户。
  user_id VARCHAR(64) NOT NULL, -- 第74天：保存记忆所属用户。
  content TEXT NOT NULL, -- 第74天：保存记忆正文。
  importance DECIMAL(5,4) NOT NULL DEFAULT 0.5000, -- 第74天：保存记忆重要性分数。
  metadata_json JSON NULL, -- 第74天：保存记忆来源与标签元数据。
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 第74天：保存记忆创建时间。
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 第74天：保存记忆更新时间。
  INDEX idx_memories_tenant_user (tenant_id, user_id) -- 第74天：加速租户用户记忆检索。
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; -- 第74天：使用支持事务和中文的存储配置。
