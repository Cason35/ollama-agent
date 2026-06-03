-- 第21天：MySQL 初始化脚本（在 MySQL 客户端或 Workbench 中执行）
-- 创建数据库与 workflows 表

CREATE DATABASE IF NOT EXISTS agent_runtime
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE agent_runtime;

CREATE TABLE IF NOT EXISTS workflows (
  id VARCHAR(64) PRIMARY KEY,
  goal TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  steps JSON NOT NULL,
  step_outputs JSON NOT NULL,
  timeline JSON NOT NULL,
  memory_snapshot JSON NULL,
  -- 第21天扩展：HITL / confirm 续跑所需字段（day20 Map 存全量 WorkflowState）
  extra_json JSON NULL COMMENT 'paused, waitingStepId, finalSummary, memory, executionBatches',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
