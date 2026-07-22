import { loadEnvConfig } from "@next/env"; // 第74天：引入 Next.js 官方环境变量加载器。

loadEnvConfig(process.cwd()); // 第74天：加载 Docker 恢复脚本需要的项目环境变量。

async function main(): Promise<void> { // 第74天：定义全量恢复命令行入口。
  const directory = process.argv[2]?.trim(); // 第74天：读取需要恢复的备份集合目录。
  if (!directory) throw new Error("请提供备份目录，例如 npm run restore -- backups/2026-07-21T00-00-00-000Z"); // 第74天：缺少恢复源时拒绝执行高风险操作。
  const { getBackupManager } = await import("@/lib/production/backup-manager"); // 第74天：环境变量就绪后加载备份管理器。
  await getBackupManager().restoreAll(directory); // 第74天：执行 MySQL、Redis 和 MinIO 全量恢复。
  console.log(`恢复完成：${directory}`); // 第74天：输出恢复成功目录。
} // 第74天：结束全量恢复命令行入口。

void main().catch((error) => { // 第74天：捕获恢复失败并返回非零退出码。
  console.error(error instanceof Error ? error.message : String(error)); // 第74天：输出恢复失败原因。
  process.exitCode = 1; // 第74天：通知命令行和发布系统恢复失败。
}); // 第74天：结束恢复异常处理。
