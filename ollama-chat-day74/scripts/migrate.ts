import { loadEnvConfig } from "@next/env"; // 第74天：引入 Next.js 官方环境变量加载器。

loadEnvConfig(process.cwd()); // 第74天：在加载数据库模块前读取项目 .env 文件。

async function main(): Promise<void> { // 第74天：定义数据库迁移命令行入口。
  const { MigrationManager } = await import("@/lib/production/migration-manager"); // 第74天：环境变量就绪后再加载 MySQL 迁移管理器。
  const manager = new MigrationManager(); // 第74天：创建当前项目迁移管理器。
  const action = process.argv[2] ?? "status"; // 第74天：读取 up、rollback 或 status 动作。
  const result = action === "up" ? await manager.up() : action === "rollback" ? await manager.rollback() : await manager.status(); // 第74天：执行对应迁移动作。
  console.table(result); // 第74天：以表格形式输出全部数据库版本状态。
} // 第74天：结束数据库迁移命令行入口。

void main().catch((error) => { // 第74天：捕获迁移失败并返回非零退出码。
  console.error(error instanceof Error ? error.message : String(error)); // 第74天：输出迁移失败原因。
  process.exitCode = 1; // 第74天：通知 CI 或发布系统数据库迁移失败。
}); // 第74天：结束数据库迁移异常处理。
