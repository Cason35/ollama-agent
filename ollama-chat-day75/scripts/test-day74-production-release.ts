import assert from "node:assert/strict"; // 第74天：引入 Node.js 严格断言验证生产交付能力。
import { mkdtemp, rm } from "node:fs/promises"; // 第74天：引入临时目录创建与安全清理能力。
import os from "node:os"; // 第74天：引入系统临时目录位置。
import path from "node:path"; // 第74天：引入跨平台路径处理能力。
import { BackupManager, type BackupCommand } from "@/lib/production/backup-manager"; // 第74天：引入可注入命令执行器的备份管理器。
import { loadEnvironmentConfig, validateEnvironmentConfig } from "@/lib/production/environment-config"; // 第74天：引入生产配置加载与校验函数。
import { FeatureFlagManager } from "@/lib/production/feature-flag-manager"; // 第74天：引入功能开关管理器。
import { ProductionHealthChecker, type HealthProbe } from "@/lib/production/health-checker"; // 第74天：引入可注入健康探针的生产健康检查器。
import { discoverMigrationFiles } from "@/lib/production/migration-manager"; // 第74天：引入数据库迁移文件发现函数。
import { createPlatformRelease } from "@/lib/production/release-manager"; // 第74天：引入平台发布版本生成函数。

type TestCase = { name: string; run: () => void | Promise<void> }; // 第74天：定义轻量测试用例结构。

const validProductionEnv = { // 第74天：定义不含本机地址且密钥完整的生产配置夹具。
  APP_ENV: "production", // 第74天：声明生产环境。
  MYSQL_HOST: "mysql", // 第74天：使用 Compose MySQL 服务名。
  MYSQL_DATABASE: "agent_runtime", // 第74天：声明平台数据库。
  MYSQL_USER: "agent", // 第74天：声明平台数据库用户。
  MYSQL_PASSWORD: "test-password", // 第74天：提供仅用于单元校验的数据库密钥。
  REDIS_URL: "redis://redis:6379", // 第74天：使用 Compose Redis 服务名。
  OBJECT_STORAGE_PROVIDER: "minio", // 第74天：启用生产 MinIO Provider。
  MINIO_ENDPOINT: "minio", // 第74天：使用 Compose MinIO 服务名。
  MINIO_ACCESS_KEY: "test-access-key", // 第74天：提供仅用于单元校验的 MinIO 用户名。
  MINIO_SECRET_KEY: "test-secret-key", // 第74天：提供仅用于单元校验的 MinIO 密码。
  JWT_SECRET_REF: "env:JWT_SECRET", // 第74天：声明 JWT 环境变量引用。
  JWT_SECRET: "test-jwt-secret", // 第74天：提供仅用于单元校验的 JWT 密钥。
}; // 第74天：结束有效生产配置夹具。

const tests: TestCase[] = [ // 第74天：定义 Day74 代码层验收用例集合。
  { name: "Production Config：生产服务名和密钥引用通过校验", run: () => { const config = loadEnvironmentConfig(validProductionEnv); const result = validateEnvironmentConfig(config, validProductionEnv); assert.equal(config.environment, "production"); assert.equal(config.database.passwordRef, "env:MYSQL_PASSWORD"); assert.equal(config.security.jwtSecretRef, "env:JWT_SECRET"); assert.equal(result.valid, true); } }, // 第74天：验证生产配置只保存引用且完整配置有效。
  { name: "Production Config：生产环境拒绝 localhost 和缺失密钥", run: () => { const source = { APP_ENV: "production", MYSQL_HOST: "localhost", REDIS_URL: "redis://127.0.0.1:6379", OBJECT_STORAGE_PROVIDER: "minio", MINIO_ENDPOINT: "localhost" }; const result = validateEnvironmentConfig(loadEnvironmentConfig(source), source); assert.equal(result.valid, false); assert.ok(result.issues.some((issue) => issue.key === "MYSQL_HOST")); assert.ok(result.issues.some((issue) => issue.key === "env:JWT_SECRET")); } }, // 第74天：验证生产环境硬编码和密钥缺失会阻断启动。
  { name: "Health Check：全部必需探针成功时返回 healthy", run: async () => { const probes: HealthProbe[] = ["database", "redis", "storage", "queue", "registry"].map((name) => ({ name: name as HealthProbe["name"], required: true, run: async () => `${name} ok` })); const snapshot = await new ProductionHealthChecker(probes, 100).checkAll(); assert.equal(snapshot.status, "healthy"); assert.equal(snapshot.services.length, 5); assert.ok(snapshot.services.every((service) => service.state === "healthy")); } }, // 第74天：验证综合健康检查成功路径。
  { name: "Health Check：必需依赖失败时返回 unhealthy", run: async () => { const probes: HealthProbe[] = [{ name: "database", required: true, run: async () => { throw new Error("connection refused"); } }, { name: "registry", required: true, run: async () => "registry ok" }]; const snapshot = await new ProductionHealthChecker(probes, 100).checkAll(); assert.equal(snapshot.status, "unhealthy"); assert.equal(snapshot.services[0]?.state, "unhealthy"); assert.match(snapshot.services[0]?.message ?? "", /connection refused/u); } }, // 第74天：验证依赖故障会阻断就绪。
  { name: "Health Check：超时探针被安全判定为不健康", run: async () => { const probes: HealthProbe[] = [{ name: "redis", required: true, run: async () => await new Promise<string>(() => undefined) }]; const snapshot = await new ProductionHealthChecker(probes, 10).checkAll(); assert.equal(snapshot.status, "unhealthy"); assert.match(snapshot.services[0]?.message ?? "", /超过 10ms/u); } }, // 第74天：验证健康探针不会无限挂起。
  { name: "Feature Flag：关闭和全量模式符合预期", run: () => { const manager = new FeatureFlagManager(); assert.equal(manager.decide("enable_model_router_v2", "tenant-alpha").enabled, false); assert.equal(manager.decide("enable_memory_merge", "tenant-alpha").enabled, true); } }, // 第74天：验证关闭与全量开启功能开关。
  { name: "Feature Flag：灰度分桶对同一主体保持稳定", run: () => { const manager = new FeatureFlagManager(); const first = manager.decide("enable_new_rag", "tenant-alpha"); const second = manager.decide("enable_new_rag", "tenant-alpha"); assert.equal(first.bucket, second.bucket); assert.equal(first.enabled, second.enabled); manager.update("enable_new_rag", { mode: "enabled" }); assert.equal(manager.decide("enable_new_rag", "tenant-alpha").enabled, true); } }, // 第74天：验证稳定灰度决策和快速全量发布。
  { name: "Release Version：平台、Git、数据库和部署版本保持关联", run: () => { const config = loadEnvironmentConfig({ ...validProductionEnv, PLATFORM_VERSION: "1.0.0-rc.1", GIT_COMMIT: "abc123", DATABASE_VERSION: "005_knowledge", DEPLOYMENT_VERSION: "release-74" }); const release = createPlatformRelease(config); assert.equal(release.version, "1.0.0-rc.1"); assert.equal(release.gitCommit, "abc123"); assert.equal(release.databaseVersion, "005_knowledge"); assert.equal(release.deploymentId, "release-74"); assert.ok(release.changelog.length >= 3); } }, // 第74天：验证统一发布版本完整性。
  { name: "Database Migration：发现五个向上与五个回滚迁移", run: async () => { const files = await discoverMigrationFiles(); assert.deepEqual(files.map((file) => file.version), ["001_user", "002_tenant", "003_workflow", "004_memory", "005_knowledge"]); assert.ok(files.every((file) => file.downPath.includes(`${path.sep}rollback${path.sep}`))); } }, // 第74天：验证迁移版本顺序和回滚文件映射。
  { name: "Backup & Restore：无真实Docker时可通过注入执行器验证命令计划", run: async () => { const directory = await mkdtemp(path.join(os.tmpdir(), "day74-backup-test-")); const commands: BackupCommand[] = []; const manager = new BackupManager(async (command) => { commands.push(command); }, directory); try { const result = await manager.backupAll(); assert.equal(result.jobs.length, 3); assert.ok(result.jobs.every((job) => job.status === "completed")); assert.ok(commands.some((command) => command.args.includes("mysqldump -u\"$MYSQL_USER\" -p\"$MYSQL_PASSWORD\" \"$MYSQL_DATABASE\""))); assert.ok(commands.some((command) => command.args.includes("SAVE"))); assert.ok(commands.some((command) => command.args.includes("minio:/data/."))); } finally { await rm(directory, { recursive: true, force: true }); } } }, // 第74天：验证三类备份命令与任务生命周期而不操作真实服务。
]; // 第74天：结束 Day74 代码层验收用例集合。

async function main(): Promise<void> { // 第74天：定义 Day74 自动化测试入口。
  let passed = 0; // 第74天：初始化通过用例计数。
  for (const test of tests) { // 第74天：按声明顺序执行全部测试用例。
    try { // 第74天：捕获单个测试失败并继续输出明确用例名称。
      await test.run(); // 第74天：执行当前同步或异步测试用例。
      passed += 1; // 第74天：累计一条通过用例。
      console.log(`✅ ${test.name}`); // 第74天：输出通过用例名称。
    } catch (error) { // 第74天：处理单个测试断言失败。
      console.error(`❌ ${test.name}`); // 第74天：输出失败用例名称。
      throw error; // 第74天：继续抛错让 CI 返回失败。
    } // 第74天：结束单个测试异常处理。
  } // 第74天：结束全部测试遍历。
  console.log(`Day74测试完成：${passed}/${tests.length}条通过。`); // 第74天：输出最终测试通过数量。
} // 第74天：结束 Day74 自动化测试入口。

void main().catch((error) => { // 第74天：捕获测试套件失败并设置非零退出码。
  console.error(error); // 第74天：输出完整断言错误堆栈。
  process.exitCode = 1; // 第74天：通知 CI 流水线测试失败。
}); // 第74天：结束测试套件异常处理。
