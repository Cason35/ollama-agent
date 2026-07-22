import { readdir, readFile } from "node:fs/promises"; // 第74天：引入异步文件读取能力加载 SQL 迁移文件。
import path from "node:path"; // 第74天：引入跨平台路径处理能力。
import type { PoolConnection, RowDataPacket } from "mysql2/promise"; // 第74天：引入 MySQL 连接与查询行类型。
import { pool } from "@/lib/db/mysql"; // 第74天：引入共享 MySQL 连接池执行迁移。

export type MigrationFile = { version: string; fileName: string; upPath: string; downPath: string }; // 第74天：定义单个数据库迁移文件结构。
export type MigrationStatus = { version: string; fileName: string; applied: boolean; appliedAt?: number }; // 第74天：定义数据库迁移状态结构。

type MigrationRow = RowDataPacket & { version: string; applied_at: Date | string }; // 第74天：定义 schema_migrations 查询结果行类型。

export async function discoverMigrationFiles(rootDirectory = process.cwd()): Promise<MigrationFile[]> { // 第74天：发现并按版本排序全部向上迁移文件。
  const migrationDirectory = path.join(rootDirectory, "migrations"); // 第74天：计算向上迁移目录绝对路径。
  const rollbackDirectory = path.join(migrationDirectory, "rollback"); // 第74天：计算回滚迁移目录绝对路径。
  const fileNames = (await readdir(migrationDirectory)).filter((fileName) => /^\d+_.+\.sql$/u.test(fileName)).sort(); // 第74天：筛选并按文件名稳定排序 SQL 迁移。
  return fileNames.map((fileName) => ({ version: path.basename(fileName, ".sql"), fileName, upPath: path.join(migrationDirectory, fileName), downPath: path.join(rollbackDirectory, fileName) })); // 第74天：为每个版本生成向上与回滚文件路径。
} // 第74天：结束数据库迁移文件发现函数。

export class MigrationManager { // 第74天：定义支持升级、回滚和状态查询的 MySQL 迁移管理器。
  constructor(private readonly rootDirectory = process.cwd()) {} // 第74天：允许测试或脚本指定项目根目录。
  async status(): Promise<MigrationStatus[]> { // 第74天：读取全部迁移文件及其数据库应用状态。
    await this.ensureMigrationTable(); // 第74天：确保迁移历史表存在。
    const files = await discoverMigrationFiles(this.rootDirectory); // 第74天：发现全部迁移文件。
    const [rows] = await pool.query<MigrationRow[]>("SELECT version, applied_at FROM schema_migrations ORDER BY version ASC"); // 第74天：读取数据库已应用版本。
    const applied = new Map(rows.map((row) => [row.version, new Date(row.applied_at).getTime()])); // 第74天：把已应用版本转换为快速查找表。
    return files.map((file) => ({ version: file.version, fileName: file.fileName, applied: applied.has(file.version), appliedAt: applied.get(file.version) })); // 第74天：返回文件与数据库状态合并结果。
  } // 第74天：结束数据库迁移状态查询方法。
  async up(): Promise<MigrationStatus[]> { // 第74天：执行全部尚未应用的向上迁移。
    await this.ensureMigrationTable(); // 第74天：确保迁移历史表存在。
    const statuses = await this.status(); // 第74天：读取当前迁移状态。
    const files = await discoverMigrationFiles(this.rootDirectory); // 第74天：发现全部迁移文件。
    const pending = files.filter((file) => !statuses.find((status) => status.version === file.version)?.applied); // 第74天：筛选尚未应用的迁移。
    for (const file of pending) await this.applyMigration(file); // 第74天：按版本顺序逐个执行迁移。
    return this.status(); // 第74天：返回升级后的最新状态。
  } // 第74天：结束数据库向上迁移方法。
  async rollback(): Promise<MigrationStatus[]> { // 第74天：回滚最近一次已经应用的迁移。
    await this.ensureMigrationTable(); // 第74天：确保迁移历史表存在。
    const statuses = await this.status(); // 第74天：读取当前迁移状态。
    const latest = statuses.filter((status) => status.applied).sort((left, right) => right.version.localeCompare(left.version))[0]; // 第74天：查找版本号最大的已应用迁移。
    if (!latest) return statuses; // 第74天：没有已应用迁移时保持幂等返回。
    const file = (await discoverMigrationFiles(this.rootDirectory)).find((item) => item.version === latest.version); // 第74天：查找最近迁移对应的回滚文件。
    if (!file) throw new Error(`找不到回滚迁移文件：${latest.version}`); // 第74天：迁移文件缺失时拒绝破坏历史记录。
    await this.rollbackMigration(file); // 第74天：执行最近迁移的回滚 SQL。
    return this.status(); // 第74天：返回回滚后的最新状态。
  } // 第74天：结束数据库回滚方法。
  private async ensureMigrationTable(): Promise<void> { // 第74天：创建数据库迁移历史表。
    await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(128) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"); // 第74天：使用版本主键防止同一迁移重复应用。
  } // 第74天：结束迁移历史表初始化方法。
  private async applyMigration(file: MigrationFile): Promise<void> { // 第74天：执行单个向上迁移并记录版本。
    const sql = await readFile(file.upPath, "utf8"); // 第74天：读取向上迁移 SQL 文本。
    const connection = await pool.getConnection(); // 第74天：获取独占连接保证迁移记录一致。
    try { // 第74天：捕获 SQL 或版本记录写入失败。
      await connection.beginTransaction(); // 第74天：开始迁移事务。
      await connection.query(sql); // 第74天：执行迁移 SQL。
      await connection.query("INSERT INTO schema_migrations (version) VALUES (?)", [file.version]); // 第74天：记录迁移版本。
      await connection.commit(); // 第74天：提交迁移与版本记录。
    } catch (error) { // 第74天：处理迁移执行失败。
      await connection.rollback(); // 第74天：尽力回滚事务内变更。
      throw error; // 第74天：继续抛错阻止发布进入下一版本。
    } finally { // 第74天：进入迁移连接清理阶段。
      connection.release(); // 第74天：释放数据库连接回连接池。
    } // 第74天：结束迁移连接清理阶段。
  } // 第74天：结束单个向上迁移方法。
  private async rollbackMigration(file: MigrationFile): Promise<void> { // 第74天：执行单个回滚迁移并删除版本记录。
    const sql = await readFile(file.downPath, "utf8"); // 第74天：读取回滚 SQL 文本。
    const connection = await pool.getConnection(); // 第74天：获取独占连接执行回滚。
    await this.executeRollback(connection, file, sql); // 第74天：委托统一回滚事务方法。
  } // 第74天：结束单个回滚迁移方法。
  private async executeRollback(connection: PoolConnection, file: MigrationFile, sql: string): Promise<void> { // 第74天：在指定连接上执行回滚事务。
    try { // 第74天：捕获回滚 SQL 或历史删除失败。
      await connection.beginTransaction(); // 第74天：开始回滚事务。
      await connection.query(sql); // 第74天：执行回滚 SQL。
      await connection.query("DELETE FROM schema_migrations WHERE version = ?", [file.version]); // 第74天：删除已回滚版本记录。
      await connection.commit(); // 第74天：提交回滚与历史更新。
    } catch (error) { // 第74天：处理回滚执行失败。
      await connection.rollback(); // 第74天：尽力恢复回滚前状态。
      throw error; // 第74天：继续抛错通知发布系统停止操作。
    } finally { // 第74天：进入回滚连接清理阶段。
      connection.release(); // 第74天：释放数据库连接回连接池。
    } // 第74天：结束回滚连接清理阶段。
  } // 第74天：结束统一回滚事务方法。
} // 第74天：结束 MySQL 迁移管理器类。
