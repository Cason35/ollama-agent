# Day74 测试用例文档

## 测试范围

本文档覆盖 Production Config、Docker、Migration、Health、Startup Validation、CI、Automated Test、Backup & Restore、Release、Feature Flag、Production Dashboard、Final Demo、Load Test 与 Failure Recovery。

## 一、无需外部软件的代码层测试

运行：

```bash
npm run test:day74
```

| 编号 | 测试目标 | 输入或操作 | 预期结果 |
| --- | --- | --- | --- |
| TC74-001 | 生产配置正确加载 | 使用 `mysql`、`redis`、`minio` 服务名和完整密钥 | 校验通过，配置对象只有密钥引用 |
| TC74-002 | 禁止生产 localhost | MySQL、Redis、MinIO 使用回环地址 | 返回阻断错误 |
| TC74-003 | 缺失密钥 | 不设置 MySQL 或 JWT 密钥 | 返回阻断错误 |
| TC74-004 | 健康检查成功 | 注入五个成功探针 | 综合状态为 `healthy` |
| TC74-005 | 必需依赖失败 | 数据库探针抛出 connection refused | 综合状态为 `unhealthy` |
| TC74-006 | 健康检查超时 | Redis 探针永不结束 | 超时后返回 `unhealthy`，测试不挂死 |
| TC74-007 | Feature Flag Disabled | 查询 `enable_model_router_v2` | 所有主体都关闭 |
| TC74-008 | Feature Flag Enabled | 查询 `enable_memory_merge` | 所有主体都开启 |
| TC74-009 | Feature Flag Gradual | 同一租户重复计算灰度开关 | 分桶与决策稳定一致 |
| TC74-010 | Release Version | 注入平台、Git、DB、Deployment 版本 | 发布对象字段完整且互相关联 |
| TC74-011 | Migration Discovery | 扫描 `migrations` | 按 001–005 排序并存在回滚映射 |
| TC74-012 | Backup Command Plan | 注入假的 Docker 命令执行器 | 生成 MySQL、Redis、MinIO 三个完成任务 |

## 二、静态质量测试

| 编号 | 命令 | 预期结果 |
| --- | --- | --- |
| TC74-013 | `npm run typecheck` | TypeScript 无错误 |
| TC74-014 | `npm run lint` | ESLint 无错误 |
| TC74-015 | `npm run build` | Next.js standalone 生产构建成功 |
| TC74-016 | `docker build -t ollama-chat-day74 .` | 多阶段生产镜像构建成功 |

## 三、需要 MySQL 的测试

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| TC74-017 | `npm run migration:up` | 001–005 全部应用 |
| TC74-018 | 再次运行 `migration:up` | 幂等执行，没有重复表或版本 |
| TC74-019 | `npm run migration:rollback` | 只回滚最近的 005 版本 |
| TC74-020 | 回滚后重新 `migration:up` | 恢复到 `005_knowledge` |
| TC74-021 | 停止 MySQL 后请求 `/api/health` | database 为 unhealthy，HTTP 503 |

## 四、需要 Redis 的测试

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| TC74-022 | Redis 正常时请求 `/api/health` | redis 与 queue 为 healthy |
| TC74-023 | `docker compose stop redis` | 健康接口发现故障并返回 503 |
| TC74-024 | `docker compose start redis` | Redis 与队列恢复 healthy |
| TC74-025 | `npm run failure:test` | 自动完成停止、发现、重启和恢复验证 |

## 五、需要 MinIO 的测试

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| TC74-026 | MinIO 正常时请求 `/api/health` | storage 为 healthy |
| TC74-027 | 上传文档后执行备份 | `minio-data` 中存在对象副本 |
| TC74-028 | 恢复 MinIO 备份 | 原对象可以重新列出和下载 |

## 六、健康与启动测试

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| TC74-029 | 请求 `/api/live` | 只要 Node.js 进程存活就返回 200 |
| TC74-030 | 全部依赖健康时请求 `/api/ready` | 返回 ready 与 HTTP 200 |
| TC74-031 | 任意必需依赖故障时请求 `/api/ready` | 返回 not_ready 与 HTTP 503 |
| TC74-032 | `ENABLE_STARTUP_VALIDATION=true` 且 Redis 关闭 | 应用启动输出 Startup Failed |

## 七、备份恢复测试

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| TC74-033 | `npm run backup` | 生成 MySQL SQL、Redis RDB、MinIO 目录和 manifest |
| TC74-034 | 删除测试数据后执行 restore | MySQL、Redis、MinIO 数据恢复 |
| TC74-035 | 查看 Production Dashboard Backup 页 | 显示三类任务状态与目标路径 |

## 八、压力与长任务测试

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| TC74-036 | 100 并发请求 `/api/live` | 成功率 100%，输出平均、P95、P99 延迟 |
| TC74-037 | 把压测目标改为业务 API | Queue、Worker、Lock、Database 无异常 |
| TC74-038 | 运行 30 分钟 Workflow | Checkpoint 持续写入，可暂停并恢复 |

## 九、页面与标题测试

| 编号 | 页面 | 预期标签页和主标题 |
| --- | --- | --- |
| TC74-039 | `/` | Day 74 - Agent Platform Production Delivery & Release |
| TC74-040 | `/production` | Day 74 - Production Delivery & Release |
| TC74-041 | `/governance` | Day 74 - Governance Capability |
| TC74-042 | `/observability` | Day 74 - Observability Dashboard |

## 十、最终验收命令

```bash
npm run test:all
npm run typecheck
npm run lint
npm run build
docker compose config
docker compose up -d --build
npm run migration:status
npm run validate:startup
npm run backup
npm run load:test
npm run failure:test
```
