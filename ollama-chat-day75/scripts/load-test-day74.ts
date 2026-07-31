type LoadResult = { ok: boolean; status: number; latencyMs: number; error?: string }; // 第74天：定义单次压力请求结果结构。

const targetUrl = process.env.LOAD_TEST_URL ?? "http://127.0.0.1:3000/api/live"; // 第74天：读取压测目标并默认使用轻量存活接口。
const concurrency = Math.max(1, Math.min(1000, Number(process.env.LOAD_TEST_CONCURRENCY ?? 100))); // 第74天：读取并限制并发用户数量。
const requestsPerUser = Math.max(1, Math.min(100, Number(process.env.LOAD_TEST_REQUESTS_PER_USER ?? 1))); // 第74天：读取并限制每个并发用户请求次数。

async function requestOnce(): Promise<LoadResult> { // 第74天：定义执行单次带耗时统计请求的方法。
  const startedAt = performance.now(); // 第74天：记录高精度请求开始时间。
  try { // 第74天：捕获网络连接或响应读取异常。
    const response = await fetch(targetUrl, { cache: "no-store" }); // 第74天：请求目标接口并禁止客户端缓存。
    await response.arrayBuffer(); // 第74天：完整读取响应体确保计时覆盖传输过程。
    return { ok: response.ok, status: response.status, latencyMs: performance.now() - startedAt }; // 第74天：返回 HTTP 状态和请求耗时。
  } catch (error) { // 第74天：处理网络请求失败。
    return { ok: false, status: 0, latencyMs: performance.now() - startedAt, error: error instanceof Error ? error.message : String(error) }; // 第74天：返回失败结果和错误原因。
  } // 第74天：结束单次压力请求异常处理。
} // 第74天：结束单次压力请求函数。

async function virtualUser(): Promise<LoadResult[]> { // 第74天：定义单个虚拟用户请求序列。
  const results: LoadResult[] = []; // 第74天：保存当前虚拟用户全部请求结果。
  for (let index = 0; index < requestsPerUser; index += 1) results.push(await requestOnce()); // 第74天：按用户顺序执行配置数量的请求。
  return results; // 第74天：返回当前虚拟用户结果列表。
} // 第74天：结束单个虚拟用户请求序列。

function percentile(values: number[], ratio: number): number { // 第74天：定义压力测试延迟百分位计算函数。
  if (values.length === 0) return 0; // 第74天：空结果安全返回零。
  const sorted = [...values].sort((left, right) => left - right); // 第74天：复制并升序排列延迟数组。
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0; // 第74天：使用最近秩算法读取目标百分位。
} // 第74天：结束延迟百分位计算函数。

async function main(): Promise<void> { // 第74天：定义并发压力测试命令行入口。
  const startedAt = Date.now(); // 第74天：记录完整压测开始时间。
  const nested = await Promise.all(Array.from({ length: concurrency }, async () => await virtualUser())); // 第74天：并发启动全部虚拟用户。
  const results = nested.flat(); // 第74天：展开所有虚拟用户请求结果。
  const latencies = results.map((result) => result.latencyMs); // 第74天：提取延迟样本用于聚合。
  const passed = results.filter((result) => result.ok).length; // 第74天：统计成功请求数量。
  const report = { targetUrl, concurrency, requests: results.length, passed, failed: results.length - passed, successRate: results.length === 0 ? 0 : passed / results.length, durationMs: Date.now() - startedAt, averageLatencyMs: latencies.length === 0 ? 0 : latencies.reduce((sum, value) => sum + value, 0) / latencies.length, p95LatencyMs: percentile(latencies, 0.95), p99LatencyMs: percentile(latencies, 0.99), errors: results.filter((result) => result.error).slice(0, 10) }; // 第74天：生成并发、成功率、耗时和错误压力报告。
  console.log(JSON.stringify(report, null, 2)); // 第74天：输出结构化压力测试报告。
  if (report.failed > 0) process.exitCode = 1; // 第74天：存在失败请求时通知 CI 或人工验收失败。
} // 第74天：结束并发压力测试入口。

void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第74天：捕获压测程序自身异常并返回失败退出码。
