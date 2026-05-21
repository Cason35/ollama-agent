/**
 * 第21天：MySQLWorkflowStore — 将 WorkflowState 持久化到 MySQL（替换 day20 进程内 Map）。
 * 每行带中文行尾注释；仅用于 API Route，不可在客户端 import。
 */

import { pool } from "@/lib/mysql"; // 连接池
import type { RowDataPacket } from "mysql2"; // mysql2 行类型基类
import type { WorkflowState } from "@/lib/workflow-types"; // 快照类型
import {
  WORKFLOW_STATE_VERSION,
} from "@/lib/workflow-persistence-constants"; // 版本常量

/** MySQL 行类型（snake_case 列名，继承 RowDataPacket 满足 mysql2 泛型约束）。 */
interface WorkflowRow extends RowDataPacket {
  id: string; // 主键 workflowId
  goal: string; // 用户目标
  status: string; // 持久化状态
  version: number; // schema 版本
  steps: unknown; // JSON 步骤
  step_outputs: unknown; // JSON 已成功输出
  timeline: unknown; // JSON 时间线
  memory_snapshot: unknown | null; // JSON 长期记忆条目
  extra_json: unknown | null; // JSON HITL 等扩展字段
  created_at: Date | string; // 创建时间
  updated_at: Date | string; // 更新时间
} // WorkflowRow 结束

/** 将 JSON 列解析为对象（驱动可能返回 string 或已解析对象）。 */
function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback; // 空值用默认
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T; // 字符串则 parse
    } catch {
      return fallback; // 解析失败兜底
    } // catch
  } // string 分支
  return value as T; // 已是对象则直接断言
} // parseJsonColumn 结束

/** 扩展字段结构（存入 extra_json）。 */
type WorkflowExtraJson = {
  paused?: boolean; // HITL 暂停
  waitingStepId?: string; // 待确认步骤 id
  finalSummary?: string; // 卡片摘要
  memory?: WorkflowState["memory"]; // 完整 Memory（confirm 续跑）
  executionBatches?: WorkflowState["executionBatches"]; // 并行批次
}; // WorkflowExtraJson 结束

/** 数据库行 → WorkflowState。 */
function toWorkflowState(row: WorkflowRow): WorkflowState {
  const extra = parseJsonColumn<WorkflowExtraJson | null>(row.extra_json, null); // 读扩展
  const createdAt = new Date(row.created_at).getTime(); // Unix 毫秒
  const updatedAt = new Date(row.updated_at).getTime(); // Unix 毫秒
  return {
    version: row.version as 1, // 表内 version，读取后断言为 1
    workflowId: row.id, // id 列 ↔ workflowId
    status: row.status as WorkflowState["status"], // status 列
    goal: row.goal, // goal 列
    steps: parseJsonColumn(row.steps, []), // steps JSON
    stepOutputs: parseJsonColumn<Record<string, unknown>>(row.step_outputs, {}), // step_outputs
    timeline: parseJsonColumn(row.timeline, []), // timeline JSON
    memorySnapshot: parseJsonColumn(row.memory_snapshot, undefined), // memory_snapshot
    createdAt, // 由 created_at 转换
    updatedAt, // 由 updated_at 转换
    paused: extra?.paused, // 从 extra_json 恢复
    waitingStepId: extra?.waitingStepId, // 从 extra_json 恢复
    finalSummary: extra?.finalSummary, // 从 extra_json 恢复
    memory: extra?.memory, // 从 extra_json 恢复
    executionBatches: extra?.executionBatches, // 从 extra_json 恢复
  }; // WorkflowState 对象
} // toWorkflowState 结束

/** 从 WorkflowState 组装 extra_json 载荷。 */
function buildExtraJson(workflow: WorkflowState): WorkflowExtraJson | null {
  const hasExtra =
    workflow.paused !== undefined ||
    workflow.waitingStepId !== undefined ||
    workflow.finalSummary !== undefined ||
    workflow.memory !== undefined ||
    workflow.executionBatches !== undefined; // 任一扩展字段存在
  if (!hasExtra) return null; // 无扩展则 NULL 入库
  return {
    paused: workflow.paused, // 暂停标记
    waitingStepId: workflow.waitingStepId, // 待确认 id
    finalSummary: workflow.finalSummary, // 摘要
    memory: workflow.memory, // 完整 memory
    executionBatches: workflow.executionBatches, // 批次
  }; // extra 对象
} // buildExtraJson 结束

/** 第21天：MySQL 版 Workflow 存储实现。 */
export class MySQLWorkflowStore {
  /** 写入或更新一条 WorkflowState（INSERT ... ON DUPLICATE KEY UPDATE）。 */
  async save(workflow: WorkflowState): Promise<void> {
    if (workflow.version !== WORKFLOW_STATE_VERSION) return; // 版本不对拒绝写入
    const extra = buildExtraJson(workflow); // 组装扩展 JSON
    await pool.execute(
      `
      INSERT INTO workflows
      (id, goal, status, version, steps, step_outputs, timeline, memory_snapshot, extra_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        goal = VALUES(goal),
        status = VALUES(status),
        version = VALUES(version),
        steps = VALUES(steps),
        step_outputs = VALUES(step_outputs),
        timeline = VALUES(timeline),
        memory_snapshot = VALUES(memory_snapshot),
        extra_json = VALUES(extra_json)
      `,
      [
        workflow.workflowId, // id
        workflow.goal, // goal
        workflow.status, // status
        workflow.version, // version
        JSON.stringify(workflow.steps), // steps
        JSON.stringify(workflow.stepOutputs), // step_outputs
        JSON.stringify(workflow.timeline), // timeline
        JSON.stringify(workflow.memorySnapshot ?? []), // memory_snapshot
        extra ? JSON.stringify(extra) : null, // extra_json
      ]
    ); // execute 结束
  } // save 结束

  /** 按 workflowId 读取；不存在返回 null。 */
  async get(workflowId: string): Promise<WorkflowState | null> {
    const [rows] = await pool.execute<WorkflowRow[]>(
      `SELECT * FROM workflows WHERE id = ? LIMIT 1`,
      [workflowId] // 参数绑定防注入
    ); // query 结束
    const list = rows; // mysql2 已解析为 WorkflowRow[]
    if (!list.length) return null; // 无行
    return toWorkflowState(list[0]); // 映射为 WorkflowState
  } // get 结束

  /** 列出全部，按 updated_at 降序。 */
  async list(): Promise<WorkflowState[]> {
    const [rows] = await pool.execute<WorkflowRow[]>(
      `SELECT * FROM workflows ORDER BY updated_at DESC`
    ); // 全表查询
    const list = rows; // 行数组
    return list.map((row) => toWorkflowState(row)); // 逐行映射
  } // list 结束

  /** 删除单条，返回是否曾存在。 */
  async delete(workflowId: string): Promise<boolean> {
    const [result] = await pool.execute(
      `DELETE FROM workflows WHERE id = ?`,
      [workflowId] // 绑定 id
    ); // delete 结束
    const header = result as { affectedRows?: number }; // 结果头
    return (header.affectedRows ?? 0) > 0; // 影响行数 > 0 表示删除成功
  } // delete 结束

  /** 清理 7 天未更新的记录（与第20天 EXPIRE_MS 语义一致）。 */
  async purgeExpired(): Promise<number> {
    const [result] = await pool.execute(
      `DELETE FROM workflows WHERE updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
    ); // SQL 按天清理
    const header = result as { affectedRows?: number }; // 结果头
    return header.affectedRows ?? 0; // 返回删除条数
  } // purgeExpired 结束
} // MySQLWorkflowStore 结束

/** 单例，供 workflow-db 薄封装委托。 */
export const mysqlWorkflowStore = new MySQLWorkflowStore(); // 全局实例
