import { loadEnvConfig } from "@next/env"; // 第74天：引入 Next.js 官方环境变量加载器。

loadEnvConfig(process.cwd()); // 第74天：加载 Docker 备份脚本需要的项目环境变量。

async function main(): Promise<void> { // 第74天：定义全量备份命令行入口。
  const { getBackupManager } = await import("@/lib/production/backup-manager"); // 第74天：环境变量就绪后加载备份管理器。
  const result = await getBackupManager().backupAll(); // 第74天：执行 MySQL、Redis 和 MinIO 全量备份。
  console.log(JSON.stringify(result, null, 2)); // 第74天：输出备份目录和任务状态。
} // 第74天：结束全量备份命令行入口。

void main().catch((error) => { // 第74天：捕获备份失败并返回非零退出码。
  console.error(error instanceof Error ? error.message : String(error)); // 第74天：输出备份失败原因。
  process.exitCode = 1; // 第74天：通知命令行和调度系统备份失败。
}); // 第74天：结束备份异常处理。
