-- 第74天：创建与历史 MySQLWorkflowStore 兼容的工作流表。
CREATE TABLE IF NOT EXISTS workflows ( -- 第74天：保存可恢复工作流快照。
  id VARCHAR(64) PRIMARY KEY, -- 第74天：保存工作流唯一标识。
  goal TEXT NOT NULL, -- 第74天：保存工作流用户目标。
  status VARCHAR(32) NOT NULL, -- 第74天：保存工作流生命周期状态。
  version INT NOT NULL DEFAULT 1, -- 第74天：保存工作流数据结构版本。
  steps JSON NOT NULL, -- 第74天：保存工作流步骤数组。
  step_outputs JSON NOT NULL, -- 第74天：保存步骤输出映射。
  timeline JSON NOT NULL, -- 第74天：保存工作流时间线。
  memory_snapshot JSON NULL, -- 第74天：保存工作流记忆快照。
  extra_json JSON NULL COMMENT 'paused, waitingStepId, finalSummary, memory, executionBatches', -- 第74天：保存暂停恢复和并行批次扩展字段。
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 第74天：保存工作流创建时间。
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- 第74天：保存工作流更新时间。
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; -- 第74天：使用支持事务、JSON 和中文的存储配置。
