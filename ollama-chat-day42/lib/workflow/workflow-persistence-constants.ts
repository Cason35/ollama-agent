/**
 * 第19–20天：持久化常量（从 workflow-persistence 拆出供 Store 共享）。
 * 每行带中文行尾注释。
 */

/** 当前持久化 schema 版本（任务 7）。 */
export const WORKFLOW_STATE_VERSION = 1 as const; // 仅支持 version===1

/** 过期清理阈值：7 天（任务 8 / 第20天 purgeExpired）。 */
export const WORKFLOW_STATE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // 毫秒

/** 单条 workflow 存储键前缀（LocalWorkflowStore 使用）。 */
export const WORKFLOW_KEY_PREFIX = "workflow:" as const; // 完整键 workflow:{id}

/** 索引键：记录所有 workflowId 便于列表与清理（兼容第19天数据）。 */
export const WORKFLOW_INDEX_KEY = "workflow:index" as const; // JSON 字符串数组

/** 用户选择的 Storage Mode 偏好键（仅 UI 元数据，非业务快照）。 */
export const WORKFLOW_STORAGE_MODE_KEY = "workflow:storageMode" as const; // local | backend
