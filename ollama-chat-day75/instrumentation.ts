export async function register(): Promise<void> { // 第74天：定义 Next.js 服务实例启动前执行的 Instrumentation 注册函数。
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // 第74天：仅在 Node.js 运行时执行基础设施启动校验。
  if (process.env.ENABLE_STARTUP_VALIDATION !== "true") return; // 第74天：本地构建和纯代码测试默认不连接外部基础设施。
  const { assertStartupReady } = await import("@/lib/production/startup-validator"); // 第74天：按需加载 Node.js 启动校验模块避免影响其他运行时。
  await assertStartupReady(); // 第74天：在服务器接收请求前执行 Fail Fast 生产依赖校验。
} // 第74天：结束 Next.js Instrumentation 注册函数。
