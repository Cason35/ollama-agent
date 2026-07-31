import { spawn } from "node:child_process"; // 第74天：引入无 Shell 子进程能力操作 Docker Compose 服务。

const healthUrl = process.env.FAILURE_TEST_HEALTH_URL ?? "http://127.0.0.1:3000/api/health"; // 第74天：读取故障测试健康接口地址。

async function dockerCompose(args: string[]): Promise<void> { // 第74天：定义安全执行 Docker Compose 命令的函数。
  await new Promise<void>((resolve, reject) => { // 第74天：把 Docker 子进程生命周期包装为 Promise。
    const child = spawn("docker", ["compose", ...args], { stdio: "inherit", windowsHide: true }); // 第74天：直接传递参数并继承输出，不经过宿主机 Shell。
    child.on("error", reject); // 第74天：Docker CLI 无法启动时拒绝 Promise。
    child.on("close", (code) => { if (code === 0) resolve(); else reject(new Error(`docker compose ${args.join(" ")} 退出码为 ${code}`)); }); // 第74天：根据 Docker 退出码判断命令成功或失败。
  }); // 第74天：结束 Docker 子进程 Promise 包装。
} // 第74天：结束 Docker Compose 命令函数。

async function readHealth(): Promise<{ statusCode: number; body: unknown }> { // 第74天：定义读取综合健康接口状态的方法。
  const response = await fetch(healthUrl, { cache: "no-store" }); // 第74天：请求实时综合健康状态。
  return { statusCode: response.status, body: await response.json() }; // 第74天：返回 HTTP 状态码和健康快照。
} // 第74天：结束综合健康接口读取函数。

async function waitForRedisRecovery(timeoutMs = 30000): Promise<{ statusCode: number; body: unknown }> { // 第74天：定义轮询等待 Redis 恢复的方法。
  const deadline = Date.now() + timeoutMs; // 第74天：计算最大恢复等待截止时间。
  while (Date.now() < deadline) { // 第74天：在截止时间前持续检查健康状态。
    const health = await readHealth(); // 第74天：读取当前综合健康快照。
    const services = (health.body as { services?: { name?: string; state?: string }[] }).services ?? []; // 第74天：安全读取服务健康列表。
    if (services.find((service) => service.name === "redis")?.state === "healthy") return health; // 第74天：Redis 恢复健康后立即结束等待。
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 第74天：每秒重试一次避免高频探测。
  } // 第74天：结束恢复状态轮询。
  throw new Error(`Redis 在 ${timeoutMs}ms 内没有恢复健康`); // 第74天：超过等待时间后报告故障恢复失败。
} // 第74天：结束 Redis 恢复等待函数。

async function main(): Promise<void> { // 第74天：定义 Redis 故障注入和恢复测试入口。
  console.log("故障注入前健康状态：", JSON.stringify(await readHealth(), null, 2)); // 第74天：记录基线健康状态。
  await dockerCompose(["stop", "redis"]); // 第74天：主动停止 Redis 注入依赖故障。
  try { // 第74天：确保故障测试结束后一定重新启动 Redis。
    const failedHealth = await readHealth(); // 第74天：读取 Redis 停止后的综合健康状态。
    console.log("Redis停止后健康状态：", JSON.stringify(failedHealth, null, 2)); // 第74天：输出故障发现证据。
    if (failedHealth.statusCode !== 503) throw new Error("Redis停止后 /api/health 未返回503"); // 第74天：验证系统能够发现必需依赖故障。
  } finally { // 第74天：进入 Redis 恢复清理阶段。
    await dockerCompose(["start", "redis"]); // 第74天：无论断言是否成功都重新启动 Redis。
  } // 第74天：结束 Redis 故障恢复清理阶段。
  console.log("Redis恢复后健康状态：", JSON.stringify(await waitForRedisRecovery(), null, 2)); // 第74天：输出服务恢复后的健康证据。
} // 第74天：结束 Redis 故障注入和恢复测试入口。

void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第74天：捕获故障测试失败并返回非零退出码。
