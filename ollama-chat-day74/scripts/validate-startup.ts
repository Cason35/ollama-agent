import { loadEnvConfig } from "@next/env"; // 第74天：引入 Next.js 官方环境变量加载器供独立脚本使用。

loadEnvConfig(process.cwd()); // 第74天：加载项目根目录下的 .env 文件。

async function main(): Promise<void> { // 第74天：定义命令行启动校验入口。
  const { assertStartupReady, getStartupValidationSnapshot } = await import("@/lib/production/startup-validator"); // 第74天：环境变量加载完成后再创建基础设施客户端。
  await assertStartupReady(); // 第74天：执行配置和全部基础设施 Fail Fast 校验。
  console.log(JSON.stringify(getStartupValidationSnapshot(), null, 2)); // 第74天：输出可供 CI 或人工检查的启动校验快照。
} // 第74天：结束命令行启动校验入口。

void main().catch((error) => { // 第74天：捕获启动校验失败并设置非零退出码。
  console.error(error instanceof Error ? error.message : String(error)); // 第74天：输出启动失败原因。
  process.exitCode = 1; // 第74天：通知命令行和流水线启动校验失败。
}); // 第74天：结束命令行异常处理。
