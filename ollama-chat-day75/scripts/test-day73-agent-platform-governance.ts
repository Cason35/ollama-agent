import assert from "node:assert/strict"; // 第73天：引入Node.js严格断言验证多租户治理平台端到端行为。
import { readFile } from "node:fs/promises"; // 第73天：引入异步文件读取工具验证标题和逐行中文注释要求。
import { seedDay73GovernanceScenarios } from "@/lib/governance/governance-fixtures"; // 第73天：引入六类生产安全演示场景。
import { GovernanceRuntime } from "@/lib/governance/governance-runtime"; // 第73天：引入智能体平台治理核心运行时执行全部验收标准。
async function main(): Promise<void> { // 第73天：定义覆盖十三项任务和六类Production Security Test的测试入口。
  const runtime = new GovernanceRuntime(); // 第73天：创建隔离的身份、租户、RBAC、配额、审计和可观测治理运行时。
  const fixture = await seedDay73GovernanceScenarios(runtime); // 第73天：执行认证、权限拒绝、租户隔离、配额、审计和完整链路场景。
  const snapshot = runtime.getSnapshot(); // 第73天：读取治理仪表盘、Context、EventBus、Registry和Trace完整快照。
  assert.equal(snapshot.users.length, 4, "任务1应创建统一User Identity System"); // 第73天：断言用户身份系统保存四个启用用户及基本资料。
  assert.equal(snapshot.users.every((user) => user.status === "active" && user.createdAt > 0), true, "用户身份应包含状态和创建时间"); // 第73天：断言统一身份资料结构完整。
  assert.deepEqual(snapshot.tenants.map((tenant) => tenant.plan).sort(), ["enterprise", "free", "pro"], "任务2应支持free、pro和enterprise租户计划"); // 第73天：断言组织租户体系覆盖三类生产套餐。
  assert.equal(snapshot.memberships.every((membership) => snapshot.tenants.some((tenant) => tenant.id === membership.tenantId)), true, "租户应关联用户成员关系"); // 第73天：断言用户通过成员关系归属于明确租户。
  const authContext = snapshot.runtimeContexts.find((context) => context.traceId === "trace-day73-auth"); // 第73天：读取Case1登录请求生成的运行时上下文。
  assert.equal(authContext?.identityContext?.tenantId, fixture.alphaTenantId, "任务3 RuntimeContext应包含Tenant Context"); // 第73天：断言身份上下文保存当前租户标识。
  assert.equal(Boolean(authContext?.securityContext?.roles.length) && Boolean(authContext?.securityContext?.permissions.length), true, "RuntimeContext应包含角色和权限安全上下文"); // 第73天：断言安全上下文可沿全链路传播角色和权限。
  assert.deepEqual(snapshot.roles.map((role) => role.name).sort(), ["Admin", "Developer", "User", "Viewer"], "任务4应实现四个默认RBAC角色"); // 第73天：断言默认角色覆盖管理员、开发者、普通用户和查看者。
  assert.equal(snapshot.roles.find((role) => role.name === "Admin")?.permissions.includes("*"), true, "Admin应拥有全部平台权限"); // 第73天：断言管理员通过通配符拥有完整治理权限。
  const deniedAudit = snapshot.auditLogs.find((log) => log.action === "prompt.publish" && log.result === "permission_denied"); // 第73天：读取普通用户发布提示词的权限拒绝审计记录。
  assert.equal(Boolean(deniedAudit), true, "任务5 PermissionService应拒绝普通User执行prompt.publish"); // 第73天：断言权限检查器在关键操作之前生效。
  assert.equal(snapshot.events.some((event) => event.type === "permission.denied"), true, "权限不足应发布permission.denied事件"); // 第73天：断言权限拒绝事件进入统一事件总线。
  const alphaKnowledge = snapshot.resources.find((resource) => resource.id === fixture.alphaKnowledgeId); // 第73天：读取Alpha租户创建的私有知识资源。
  assert.equal(alphaKnowledge?.ownerContext.tenantId, fixture.alphaTenantId, "任务6资源应保存tenantId归属"); // 第73天：断言知识资源保存租户所有者上下文。
  assert.equal(alphaKnowledge?.ownerContext.createdBy, "user-alpha-admin", "资源应保存createdBy创建者"); // 第73天：断言资源归属可以追踪创建用户。
  assert.equal(runtime.resourceStore.get(fixture.betaTenantId, fixture.alphaKnowledgeId), undefined, "任务7 Tenant B不能读取Tenant A资源"); // 第73天：断言资源存储自动添加当前租户过滤条件。
  assert.equal(runtime.resourceStore.searchKnowledge(fixture.betaTenantId, "Alpha").length, 0, "跨租户知识检索必须返回空结果"); // 第73天：断言知识检索同样执行租户隔离。
  const quotaEvent = snapshot.events.find((event) => event.type === "quota.exceeded"); // 第73天：读取令牌额度超限事件。
  assert.equal(Boolean(quotaEvent), true, "任务8超过每日令牌额度应发布quota.exceeded事件"); // 第73天：断言租户配额拒绝进入统一事件总线。
  assert.equal(snapshot.quotas.find((item) => item.tenant.id === fixture.quotaTenantId)?.usage.dailyTokens, 100, "超限请求不应继续增加令牌用量"); // 第73天：断言被拒绝模型调用不会消耗额外额度。
  const mismatch = await runtime.execute({ token: "day73.alpha.admin.token", tenantId: fixture.betaTenantId, action: "governance.read", resourceType: "platform", requestId: "req-day73-tenant-mismatch", traceId: "trace-day73-tenant-mismatch" }); // 第73天：模拟客户端伪造其他租户标识验证API Gateway安全边界。
  assert.equal(mismatch.status, 403, "任务9 API Gateway应拒绝令牌租户与请求租户不一致"); // 第73天：断言网关统一执行认证和租户上下文校验。
  assert.equal(Boolean(mismatch.context?.requestId) && Boolean(mismatch.context?.traceId), true, "API Gateway应统一生成RequestId和TraceId"); // 第73天：断言被拒绝请求同样具有可审计请求上下文。
  assert.equal(snapshot.auditLogs.some((log) => log.resourceId === fixture.deletedWorkflowId && log.action === "workflow.delete" && log.result === "success"), true, "任务10删除Workflow应写入成功审计日志"); // 第73天：断言审计日志完整记录资源动作和结果。
  assert.equal(runtime.auditLogger.verifyIntegrity(), true, "审计日志SHA256哈希链应保持完整"); // 第73天：断言审计记录具备基础防篡改校验能力。
  const dashboard = await readFile("app/components/GovernanceDashboard.tsx", "utf8"); // 第73天：读取治理仪表盘验证四个任务区域和安全测试视图。
  for (const label of ["Tenant Explorer", "Permission Explorer", "Audit Explorer", "Quota Dashboard", "Security Tests"]) assert.equal(dashboard.includes(label), true, `任务11治理仪表盘应包含${label}`); // 第73天：断言治理页面覆盖租户、权限、审计、配额和安全区域。
  for (const type of ["user.created", "tenant.created", "permission.denied", "quota.exceeded", "audit.created"] as const) assert.equal(snapshot.events.some((event) => event.type === type), true, `任务12 EventBus应包含${type}`); // 第73天：断言五类治理事件全部接入统一事件总线。
  const registryIds = new Set(snapshot.registryItems.map((item) => item.id)); // 第73天：收集统一注册中心中的Day73治理能力标识。
  for (const id of ["governance:auth-provider", "governance:permission-service", "governance:quota-manager", "governance:audit-logger"]) assert.equal(registryIds.has(id), true, `任务12 UnifiedRegistry应注册${id}`); // 第73天：断言身份、权限、配额和审计四类能力全部可发现。
  assert.equal(snapshot.securityTests.length, 6, "任务13应完成六类Production Security Test"); // 第73天：断言安全测试覆盖文档要求的六个案例。
  assert.equal(snapshot.securityTests.every((test) => test.passed), true, "六类生产安全测试应全部通过"); // 第73天：断言身份、权限、隔离、配额、审计和完整链路全部闭环。
  assert.equal(snapshot.overview.productionReady, true, "全部安全测试通过后平台应标记Production Ready"); // 第73天：断言智能体平台第1.0版达到生产就绪演示状态。
  const governedTrace = runtime.observabilityRuntime.queryTrace(fixture.governedTraceId); // 第73天：读取完整生产请求关联的分布式链路。
  assert.equal(Boolean(governedTrace.trace) && governedTrace.tree.length > 0, true, "完整请求链应包含可查询Trace和Span Tree"); // 第73天：断言User到Audit链路中包含生产可观测Trace。
  assert.equal(snapshot.auditLogs.some((log) => log.traceId === fixture.governedTraceId && log.action === "agent.execute"), true, "完整请求链应把Trace关联到Audit"); // 第73天：断言审计记录可以跳转到同一智能体调用链路。
  const layout = await readFile("app/layout.tsx", "utf8"); // 第73天：读取根布局元数据验证浏览器标签页标题。
  const header = await readFile("app/components/Header.tsx", "utf8"); // 第73天：读取主工作台页头验证日期和治理标题。
  const page = await readFile("app/governance/page.tsx", "utf8"); // 第73天：读取治理页面元数据验证独立标签页标题。
  assert.equal(layout.includes("Day 75 - Agent Platform Portfolio & Engineering Maturity") && layout.includes("智能体平台作品集与工程成熟度"), true, "浏览器标签页应更新为Day75最终作品集主题"); // 第75天：断言根浏览器标题和中文描述已经更新。
  assert.equal(header.includes(">75</span>") && header.includes("Portfolio & Engineering Maturity") && header.includes("Agent Platform Portfolio & Engineering Maturity"), true, "主标题应更新为Day75相关描述"); // 第75天：断言页头Day徽标、作品集标签和主标题均已更新。
  assert.equal(page.includes("Day 75 - Governance Capability") && page.includes("智能体平台治理能力"), true, "治理标签页应使用Day75相关标题"); // 第75天：断言独立治理页面元数据已同步到最终作品集标题。
  const route = await readFile("app/api/v1/governance/route.ts", "utf8"); // 第73天：读取生产治理路由验证统一/api/v1接口入口。
  assert.equal(route.includes("productionGovernancePlatform.execute") && route.includes("authorization"), true, "API Gateway Route应执行认证令牌和统一治理平台入口"); // 第73天：断言路由接入Bearer Token和治理网关。
  const commentedFiles = ["lib/governance/types.ts", "lib/governance/identity-service.ts", "lib/governance/permission-service.ts", "lib/governance/tenant-resource-store.ts", "lib/governance/quota-manager.ts", "lib/governance/audit-logger.ts", "lib/governance/api-gateway.ts", "lib/governance/governance-runtime.ts", "lib/governance/governance-fixtures.ts", "lib/governance/production-governance-platform.ts", "app/api/v1/governance/route.ts", "app/governance/page.tsx", "app/components/GovernanceDashboard.tsx", "scripts/test-day73-agent-platform-governance.ts"]; // 第73天：列出本日新增且必须逐行包含中文注释的全部代码文件。
  for (const file of commentedFiles) { const lines = (await readFile(file, "utf8")).split(/\r?\n/u); const uncommented = lines.map((line, index) => ({ line, number: index + 1 })).filter(({ line }) => line.trim() && !/(?:\/\/|\/\*).*[\u3400-\u9fff]/u.test(line)); assert.deepEqual(uncommented, [], `${file}存在缺少中文注释的代码行`); } // 第74天：逐文件断言每一个非空代码行都包含中文注释，并允许生产交付项目升级继承页面。
  console.log("Day73 Agent Platform Governance：十三项任务、六个生产安全场景与逐行中文注释检查全部通过"); // 第73天：输出稳定成功信息供npm脚本和人工验收识别。
} // 第73天：结束智能体平台治理端到端测试入口。
void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第73天：运行测试并在断言或运行时失败时设置非零退出码。
