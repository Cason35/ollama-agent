# Day74 运行时链路

## 请求链路

```text
HTTP Request
  → API Gateway
  → Authentication
  → Tenant Isolation
  → Rate Limit
  → RBAC Permission
  → Resource Ownership
  → Quota Pre-Check
  → Agent / Workflow / RAG / Memory
  → Usage Accounting
  → Structured Log / Metric / Trace
  → Audit Log
```

## 进程启动链路

Next.js 16 使用项目根目录的 `instrumentation.ts`。当 `ENABLE_STARTUP_VALIDATION=true` 且运行时为 Node.js 时，服务器接收请求之前执行：

1. 加载 `EnvironmentConfig`。
2. 检查生产环境是否出现 `localhost`、非法 Redis URL 或缺失的密钥引用。
3. 对 MySQL 执行 `SELECT 1`。
4. 对 Redis 执行 `PING`。
5. 读取对象存储快照。
6. 检查统一注册中心是否存在启用能力。
7. 任意必需项失败时抛出 `Startup Failed`，阻止假启动。

## 探针语义

- `/api/live`：只判断 Node.js 进程是否存活，不访问外部依赖。
- `/api/ready`：配置与全部必需依赖健康时才返回 `200`。
- `/api/health`：返回每项依赖的状态、延迟、检查时间和错误证据。

健康接口使用 `Cache-Control: no-store`，避免负载均衡器读取旧状态。
