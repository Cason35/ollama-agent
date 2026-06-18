import { buildModelRuntime } from "@/lib/model/model-runtime"; // 第37天：引入模型运行时构造器，Worker 执行 WorkflowJob 时恢复模型配置。
import type { Job, JobStore, JobTimelineItem, RetryPolicy, WorkerInfo, WorkflowJobPayload } from "@/lib/queue/queue-types"; // 引入任务、存储、时间线、重试策略、Worker 信息和 WorkflowJob 载荷类型。
import type { QueueManager } from "@/lib/queue/queue-manager"; // 引入队列管理器类型。
import { WORKFLOW_DEFAULT_STEP_RETRIES, executeWorkflow, synthesizeWorkflowResult } from "@/lib/workflow/workflow-executor"; // 第37天：引入真正的 Workflow Runtime 执行入口。

const DEFAULT_TIMEOUT_MS = 30 * 1000; // 第36天：定义 Worker 侧默认超时时间。
const CANCEL_CHECK_INTERVAL_MS = 200; // 第36天：定义长任务协作取消检查间隔。
export class JobCancelledError extends Error { // 第36天：定义任务取消错误。
  constructor() { // 定义取消错误构造函数。
    super("Job cancelled"); // 设置取消错误消息。
    this.name = "JobCancelledError"; // 设置错误名称，方便 Worker 区分是否需要重试。
  } // 结束取消错误构造函数。
} // 结束 JobCancelledError。
export class JobTimeoutError extends Error { // 第36天：定义任务超时错误。
  constructor(timeoutMs: number) { // 定义超时错误构造函数。
    super(`Job timeout after ${timeoutMs}ms`); // 设置超时错误消息。
    this.name = "JobTimeoutError"; // 设置错误名称，方便 Worker 走超时策略。
  } // 结束超时错误构造函数。
} // 结束 JobTimeoutError。
type JobExecutionContext = { // 第36天：定义任务执行上下文。
  jobId: string; // 记录当前任务 ID。
  isCancelled: () => Promise<boolean>; // 提供协作式取消状态查询函数。
}; // 结束 JobExecutionContext 类型。
const sleep = async (ms: number, ctx?: JobExecutionContext) => { // 第36天：定义可协作取消的异步等待工具。
  const startedAt = Date.now(); // 记录等待开始时间。
  while (Date.now() - startedAt < ms) { // 按小步长循环等待，避免长 Promise 无法感知取消。
    if (await ctx?.isCancelled()) throw new JobCancelledError(); // 如果任务已请求取消，则抛出取消错误。
    const remaining = ms - (Date.now() - startedAt); // 计算剩余等待时间。
    await new Promise((resolve) => setTimeout(resolve, Math.min(CANCEL_CHECK_INTERVAL_MS, Math.max(0, remaining)))); // 等待一个小时间片。
  } // 结束循环等待。
}; // 结束 sleep。

function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 定义创建时间线节点的工具。
  return { label, at: Date.now(), note }; // 返回带当前时间的时间线节点。
} // 结束 timeline。

function isWorkflowJobPayload(payload: Record<string, unknown>): payload is Record<string, unknown> & WorkflowJobPayload { // 第37天：定义 WorkflowJob 载荷运行时守卫。
  return typeof payload.workflowId === "string" && typeof payload.workflow === "object" && payload.workflow !== null && typeof payload.memory === "object" && payload.memory !== null; // 校验 workflowId、workflow 与 memory 三个核心字段存在。
} // 结束 isWorkflowJobPayload。

function formatWorkflowPartialSummary(workflow: WorkflowJobPayload["workflow"]): string { // 第37天：定义 Workflow 失败时的本地兜底摘要。
  const successSteps = workflow.steps.filter((step) => step.status === "success"); // 收集已经成功的步骤。
  const failedSteps = workflow.steps.filter((step) => step.status === "failed"); // 收集失败的步骤。
  const successText = successSteps.length ? successSteps.map((step) => `- ${step.name}：${typeof step.output === "string" ? step.output : JSON.stringify(step.output ?? "")}`).join("\n") : "- 暂无成功步骤输出"; // 生成成功步骤可读文本。
  const failedText = failedSteps.length ? failedSteps.map((step) => `- ${step.name}：${step.error ?? "未知错误"}`).join("\n") : "- 未记录具体失败步骤"; // 生成失败步骤可读文本。
  return `工作流部分完成，但有步骤失败。\n\n已完成结果：\n${successText}\n\n失败原因：\n${failedText}`; // 返回前端可直接展示的部分结果摘要。
} // 结束 formatWorkflowPartialSummary。

export function getRetryDelay(attempts: number, policy: RetryPolicy): number { // 定义退避延迟计算函数。
  if (policy.backoff === "fixed") return policy.baseDelayMs; // 固定退避直接返回基础延迟。
  return policy.baseDelayMs * Math.pow(2, Math.max(0, attempts - 1)); // 指数退避按尝试次数放大延迟。
} // 结束 getRetryDelay。

async function executeJob(job: Job, ctx: JobExecutionContext): Promise<Record<string, unknown>> { // 第36天：定义支持协作取消的任务执行器。
  if (job.type === "workflow") { // 第37天：判断是否为 Workflow as Job 任务。
    if (!isWorkflowJobPayload(job.payload)) throw new Error("WorkflowJobPayload 缺少 workflowId、workflow 或 memory"); // 缺少核心载荷时拒绝执行。
    if (await ctx.isCancelled()) throw new JobCancelledError(); // 启动前先检查是否已被用户取消。
    const { rt, errorResponse } = buildModelRuntime(job.payload.provider, job.payload.mimoModel); // 恢复创建 Job 时的模型运行时。
    if (!rt) throw new Error(`WorkflowJob 模型运行时不可用：${await errorResponse?.text()}`); // 模型配置失败时让 Job 进入失败或重试。
    const workflow = { ...job.payload.workflow, jobId: job.id, status: "running" as const }; // 将 Job ID 写回 Workflow，并同步为 running。
    const timelineBuffer = [...(workflow.executionTimeline ?? []), { ts: Date.now(), message: `Queue Job ${job.id} 已由 Worker 接管，Workflow Runtime 开始执行` }]; // 合并已有 Workflow 时间线并写入 Worker 接管事件。
    const execResult = await executeWorkflow(workflow, job.payload.memory, rt, { timeline: timelineBuffer, defaultStepRetries: WORKFLOW_DEFAULT_STEP_RETRIES }); // 由 Worker 调用 Workflow Runtime 执行 DAG。
    if (await ctx.isCancelled()) throw new JobCancelledError(); // 执行结束后再次检查取消请求，避免取消期间误报成功。
    const executedWorkflow = { ...execResult.workflow, executionTimeline: timelineBuffer, status: execResult.paused ? "paused" as const : execResult.workflow.status }; // 同步暂停态或最终状态到 Workflow。
    const finalSummary = executedWorkflow.status === "success" && executedWorkflow.steps.length > 0 ? await synthesizeWorkflowResult(executedWorkflow, rt) : executedWorkflow.status === "success" ? "工作流已完成。" : executedWorkflow.status === "paused" ? "工作流已暂停，等待人工确认后继续。" : executedWorkflow.status === "cancelled" ? "工作流已取消。" : formatWorkflowPartialSummary(executedWorkflow); // 生成 Job 结果中的工作流摘要。
    return { message: "workflow job 已由 Worker 执行", workflowId: job.payload.workflowId, workflowStatus: executedWorkflow.status, workflow: executedWorkflow, finalSummary }; // 返回 Job 结果，Dashboard 可查看 Workflow 关联。
  } // 结束 WorkflowJob 分支。
  if (job.type === "chat") { // 判断是否为 chat 任务。
    await sleep(900, ctx); // 短暂等待以模拟 LLM 聊天调用，并允许取消。
    return { message: "chat 任务已通过 llm 资源模拟完成", prompt: job.payload.prompt ?? "Day36 chat" }; // 返回聊天任务结果。
  } // 结束 chat 分支。
  if (job.type === "unstable") { // 判断是否为不稳定任务。
    await sleep(800, ctx); // 短暂等待以模拟外部调用，并允许取消。
    if (Math.random() < 0.7) throw new Error("Random failure from unstable job"); // 70% 概率抛错以测试自动重试。
    return { message: "unstable 任务最终执行成功", attempts: job.attempts }; // 返回不稳定任务成功结果。
  } // 结束 unstable 分支。
  if (job.type === "alwaysFail") { // 判断是否为必定失败任务。
    await sleep(600, ctx); // 短暂等待以模拟失败任务耗时，并允许取消。
    throw new Error("AlwaysFail job forced failure"); // 永远抛错以测试死信队列。
  } // 结束 alwaysFail 分支。
  if (job.type === "reminder") { // 判断是否为定时提醒任务。
    await sleep(500, ctx); // 短暂等待以模拟提醒投递，并允许取消。
    return { message: "reminder 定时提醒已触发", text: job.payload.text ?? "该处理定时任务了" }; // 返回提醒任务结果。
  } // 结束 reminder 分支。
  if (job.type === "embedding") { // 判断是否为向量化模拟任务。
    const duration = Number(job.payload.durationMs ?? 5000); // 读取模拟耗时，默认 5 秒。
    await sleep(Math.max(500, Math.min(duration, 10000)), ctx); // 等待 0.5 到 10 秒之间的耗时，并允许取消。
    return { message: "embedding 长任务模拟完成", durationMs: duration }; // 返回模拟结果。
  } // 结束 embedding 分支。
  if (job.type === "reindex") { // 判断是否为重建索引模拟任务。
    await sleep(2500, ctx); // 等待 2.5 秒模拟索引重建，并允许取消。
    return { message: "reindex 模拟完成，可在 RAG 面板继续执行真实 Reindex" }; // 返回重建索引模拟结果。
  } // 结束 reindex 分支。
  if (job.type === "retrieval") { // 判断是否为检索模拟任务。
    await sleep(1500, ctx); // 等待 1.5 秒模拟检索任务，并允许取消。
    return { message: "retrieval 异步检索模拟完成", query: job.payload.query ?? "Workflow Runtime" }; // 返回检索模拟结果。
  } // 结束 retrieval 分支。
  await sleep(2000, ctx); // 默认等待 2 秒模拟未知任务，并允许取消。
  return { message: "unknown 异步执行模拟完成", goal: job.payload.goal ?? "队列中的未知任务" }; // 返回未知任务模拟结果。
} // 结束 executeJob。

async function runWithTimeout(job: Job, ctx: JobExecutionContext): Promise<Record<string, unknown>> { // 第36天：定义任务超时包装器。
  const timeoutMs = job.timeoutMs ?? DEFAULT_TIMEOUT_MS; // 读取任务超时时间，缺省使用 30 秒。
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null; // 保存超时计时器引用。
  try { // 开始执行 Promise.race。
    return await Promise.race([ // 同时竞争真实任务和超时 Promise。
      executeJob(job, ctx), // 执行业务任务。
      new Promise<Record<string, unknown>>((_, reject) => { // 创建超时 Promise。
        timeoutHandle = setTimeout(() => reject(new JobTimeoutError(timeoutMs)), timeoutMs); // 到达阈值后抛出超时错误。
      }), // 结束超时 Promise。
    ]); // 结束 Promise.race。
  } finally { // 无论成功、取消或超时都清理计时器。
    if (timeoutHandle) clearTimeout(timeoutHandle); // 清除超时计时器，避免悬挂回调。
  } // 结束 finally。
} // 结束 runWithTimeout。

export class Worker { // 定义第35天本地 Worker。
  private timer: ReturnType<typeof setInterval> | null = null; // 保存轮询计时器。
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null; // 保存心跳计时器。
  private acceptingJobs = false; // 第36天：标记 Worker 是否继续认领新任务。
  private currentRun: Promise<void> | null = null; // 第36天：保存当前执行 Promise，供优雅关闭等待。
  private readonly info: WorkerInfo; // 保存 Worker 对外状态。
  constructor( // 定义 Worker 构造函数。
    private readonly id: string, // 注入 Worker ID。
    private readonly queue: QueueManager, // 注入队列管理器。
    private readonly store: JobStore, // 注入任务存储。
    private readonly retryPolicy: RetryPolicy, // 注入默认重试策略。
    private readonly onJobFinished?: (job: Job) => void // 注入任务完成回调用于统计吞吐。
  ) { // 构造函数主体开始。
    const now = Date.now(); // 获取初始化时间。
    this.info = { id, status: "stopped", startedAt: now, lastHeartbeatAt: now, processedJobs: 0, failedJobs: 0 }; // 初始化 WorkerInfo。
  } // 结束构造函数。
  start(): void { // 定义启动 Worker 方法。
    if (this.timer) return; // 已启动时直接返回。
    const now = Date.now(); // 获取启动时间。
    this.acceptingJobs = true; // 第36天：启动后允许认领新任务。
    this.info.status = "idle"; // 将状态设置为空闲。
    this.info.startedAt = now; // 记录启动时间。
    this.info.lastHeartbeatAt = now; // 记录初始心跳时间。
    this.timer = setInterval(() => void this.tick(), 600); // 每 600ms 尝试认领任务。
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 1000); // 每 1000ms 更新一次心跳。
  } // 结束 start。
  stop(): void { // 定义停止 Worker 方法。
    this.acceptingJobs = false; // 第36天：停止后不再认领新任务。
    if (this.timer) clearInterval(this.timer); // 清除轮询计时器。
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer); // 清除心跳计时器。
    this.timer = null; // 重置轮询计时器引用。
    this.heartbeatTimer = null; // 重置心跳计时器引用。
    this.info.status = "stopped"; // 将状态设置为已停止。
    this.info.currentJobId = undefined; // 清空当前任务。
    this.heartbeat(); // 停止时也更新一次心跳。
  } // 结束 stop。
  stopAccepting(): void { // 第36天：定义只停止认领新任务的方法。
    this.acceptingJobs = false; // 标记不再接受新任务。
    if (this.timer) clearInterval(this.timer); // 清除轮询计时器。
    this.timer = null; // 重置轮询计时器引用。
    if (this.info.status === "idle") this.info.status = "stopped"; // 空闲 Worker 直接进入 stopped。
    this.heartbeat(); // 更新一次心跳，方便 Dashboard 观察关闭动作。
  } // 结束 stopAccepting。
  async waitUntilIdle(): Promise<void> { // 第36天：等待当前运行任务自然结束。
    await this.currentRun; // 等待当前任务 Promise，如果没有任务则立即返回。
  } // 结束 waitUntilIdle。
  getInfo(): WorkerInfo { // 定义读取 Worker 状态方法。
    return { ...this.info }; // 返回状态副本，避免外部直接修改。
  } // 结束 getInfo。
  private heartbeat(): void { // 定义 Worker 心跳方法。
    this.info.lastHeartbeatAt = Date.now(); // 写入最近心跳时间。
  } // 结束 heartbeat。
  private async tick(): Promise<void> { // 定义轮询执行方法。
    if (!this.acceptingJobs) return; // 第36天：优雅关闭期间不再认领新任务。
    if (this.info.status === "running") return; // 当前有任务在执行则跳过。
    const job = this.queue.claimNextJob(this.id); // 从队列认领一个满足限制条件的任务。
    if (!job) return; // 没有可运行任务则结束。
    this.info.status = "running"; // 标记 Worker 正在运行。
    this.info.currentJobId = job.id; // 记录当前任务 ID。
    this.heartbeat(); // 认领后立即更新心跳。
    try { // 开始执行任务。
      this.currentRun = this.process(job).then((finished) => { // 第36天：保存当前任务 Promise 供优雅关闭等待。
        this.onJobFinished?.(finished); // 通知 WorkerPool 记录完成统计。
      }); // 结束当前任务 Promise 注册。
      await this.currentRun; // 等待当前任务完成。
    } finally { // 无论成功失败都清理 Worker 和资源状态。
      this.queue.releaseJobResource(job); // 第35天：释放任务认领时占用的资源额度。
      this.info.status = this.acceptingJobs ? "idle" : "stopped"; // 第36天：如果正在优雅关闭，则任务结束后进入 stopped。
      this.info.currentJobId = undefined; // 清空当前任务 ID。
      this.currentRun = null; // 第36天：清空当前任务 Promise。
      this.heartbeat(); // 完成后更新心跳。
    } // 结束 try/finally。
  } // 结束 tick。
  async process(claimedJob: Job): Promise<Job> { // 定义处理单个已认领任务的方法。
    const now = Date.now(); // 获取当前时间戳。
    const attemptNumber = claimedJob.attempts + 1; // 计算本次尝试序号。
    const startTimeline = [...claimedJob.timeline, timeline("Started", `Worker ${this.id} 开始执行第 ${attemptNumber} 次尝试，当前资源类型为 ${claimedJob.resourceType}`)]; // 构造通用开始时间线。
    if (claimedJob.type === "workflow") startTimeline.push(timeline("WorkflowStarted", `Workflow ${claimedJob.workflowId ?? claimedJob.payload.workflowId ?? "unknown"} 已作为 Job 进入 Worker 执行阶段`)); // 第37天：WorkflowJob 追加工作流启动节点。
    const running: Job = { // 构造 running 状态任务。
      ...claimedJob, // 继承已认领任务字段。
      status: "running", // 确保状态为执行中。
      attempts: attemptNumber, // 写入本次尝试次数。
      blockedReason: undefined, // 开始执行后清空阻塞原因。
      nextRunAt: undefined, // 清空下一次运行时间。
      scheduledAt: undefined, // 清空计划时间，表示调度已经兑现。
      startedAt: now, // 写入最近开始时间。
      updatedAt: now, // 写入更新时间。
      timeline: startTimeline, // 追加开始节点与可选 WorkflowStarted 节点。
    }; // 结束 running 任务。
    await this.store.update(running); // 保存 running 状态。
    const ctx: JobExecutionContext = { // 第36天：构造协作式取消上下文。
      jobId: running.id, // 写入当前任务 ID。
      isCancelled: async () => { // 定义取消状态查询函数。
        const latest = await this.store.get(running.id); // 从持久化 Store 读取最新任务状态。
        return latest?.status === "cancelling" || latest?.status === "cancelled"; // running 任务被标记 cancelling 或 cancelled 时视为需要停止。
      }, // 结束取消状态查询函数。
    }; // 结束执行上下文。
    try { // 开始调用任务执行器。
      const result = await runWithTimeout(running, ctx); // 第36天：通过超时包装器执行不同类型任务。
      const workflowStatus = typeof result.workflowStatus === "string" ? result.workflowStatus : undefined; // 第37天：读取 WorkflowJob 返回的工作流状态。
      const completionTimeline = [...running.timeline, timeline("Completed", `Worker ${this.id} 完成第 ${attemptNumber} 次尝试并释放资源额度`)]; // 构造通用完成时间线。
      if (workflowStatus === "success") completionTimeline.push(timeline("WorkflowSuccess", `关联 Workflow ${running.workflowId ?? running.payload.workflowId ?? "unknown"} 已成功完成`)); // 第37天：记录工作流成功。
      if (workflowStatus === "paused") completionTimeline.push(timeline("WorkflowPaused", `关联 Workflow ${running.workflowId ?? running.payload.workflowId ?? "unknown"} 已暂停等待确认`)); // 第37天：记录工作流暂停。
      if (workflowStatus === "failed") completionTimeline.push(timeline("WorkflowFailed", `关联 Workflow ${running.workflowId ?? running.payload.workflowId ?? "unknown"} 执行失败`)); // 第37天：记录工作流失败。
      if (workflowStatus === "cancelled") completionTimeline.push(timeline("WorkflowCancelled", `关联 Workflow ${running.workflowId ?? running.payload.workflowId ?? "unknown"} 已取消`)); // 第37天：记录工作流取消。
      const success: Job = { // 构造成功状态任务。
        ...running, // 继承 running 字段。
        status: "success", // 状态改为成功。
        result, // 写入执行结果。
        error: undefined, // 清空旧错误。
        workerId: undefined, // 成功后释放 Worker 归属。
        lockedAt: undefined, // 成功后释放任务锁。
        completedAt: Date.now(), // 写入完成时间。
        updatedAt: Date.now(), // 写入更新时间。
        timeline: completionTimeline, // 追加完成节点和 Workflow 状态同步节点。
      }; // 结束 success 任务。
      await this.store.update(success); // 保存成功状态。
      this.info.processedJobs += 1; // 累加成功处理数。
      return success; // 返回成功任务。
    } catch (error) { // 捕获执行失败、取消或超时。
      const message = error instanceof Error ? error.message : "未知任务错误"; // 规范化错误消息。
      this.info.failedJobs += 1; // 累加失败处理数。
      if (error instanceof JobCancelledError) { // 第36天：取消错误不进入 retry。
        const now = Date.now(); // 获取取消完成时间。
        const cancelled: Job = { // 构造已取消任务。
          ...running, // 继承 running 字段。
          status: "cancelled", // 将状态改为已取消。
          error: undefined, // 取消不是业务错误。
          workerId: undefined, // 释放 Worker 归属。
          lockedAt: undefined, // 释放任务锁。
          nextRunAt: undefined, // 清空下次运行时间。
          scheduledAt: undefined, // 清空计划时间。
          cancelRequestedAt: running.cancelRequestedAt ?? now, // 记录取消请求时间。
          cancelledAt: now, // 记录取消完成时间。
          completedAt: now, // 将完成时间标记为取消完成时间。
          updatedAt: now, // 更新任务时间。
          timeline: [...running.timeline, timeline("Cancelled", `Worker ${this.id} 检测到取消请求并协作退出任务`)], // 追加取消完成节点。
        }; // 结束已取消任务。
        await this.store.update(cancelled); // 保存已取消状态。
        return cancelled; // 返回已取消任务。
      } // 结束取消错误处理。
      if (error instanceof JobTimeoutError) { // 第36天：超时错误按可重试错误处理。
        const now = Date.now(); // 获取超时发生时间。
        const timeoutTimeline = [...running.timeline, timeline("Timeout", `Worker ${this.id} 执行超过 ${running.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms，触发任务超时`)]; // 追加超时事件。
        if (attemptNumber < running.maxAttempts) { // 判断超时后是否还允许重试。
          const delayMs = getRetryDelay(attemptNumber, this.retryPolicy); // 计算超时后的退避延迟。
          const retrying: Job = { // 构造超时后等待重试任务。
            ...running, // 继承 running 字段。
            status: "retrying", // 状态改为等待重试。
            error: message, // 写入超时错误。
            timeoutAt: now, // 记录超时时间。
            workerId: undefined, // 释放 Worker 归属。
            lockedAt: undefined, // 释放任务锁。
            nextRunAt: now + delayMs, // 写入下次可运行时间。
            updatedAt: now, // 更新时间。
            timeline: [...timeoutTimeline, timeline("RetryScheduled", `${delayMs}ms 后安排第 ${attemptNumber + 1} 次重试`)], // 追加重试调度节点。
          }; // 结束 retrying 任务。
          await this.store.update(retrying); // 保存等待重试状态。
          this.queue.enqueue(retrying); // 重新放入内存队列等待到期执行。
          return retrying; // 返回等待重试任务。
        } // 结束可重试判断。
        const timedOut: Job = { // 构造最终超时任务。
          ...running, // 继承 running 字段。
          status: "timeout", // 最终状态标记为已超时。
          error: message, // 写入超时错误。
          timeoutAt: now, // 记录超时时间。
          workerId: undefined, // 释放 Worker 归属。
          lockedAt: undefined, // 释放任务锁。
          nextRunAt: undefined, // 清空下次运行时间。
          scheduledAt: undefined, // 清空计划时间。
          completedAt: now, // 记录结束时间。
          updatedAt: now, // 更新时间。
          timeline: timeoutTimeline, // 写入超时时间线。
        }; // 结束最终超时任务。
        await this.store.update(timedOut); // 保存最终超时状态。
        return timedOut; // 返回最终超时任务。
      } // 结束超时错误处理。
      if (attemptNumber < running.maxAttempts) { // 判断是否还允许重试。
        const delayMs = getRetryDelay(attemptNumber, this.retryPolicy); // 计算失败后的退避延迟。
        const retrying: Job = { // 构造等待重试任务。
          ...running, // 继承 running 字段。
          status: "retrying", // 状态改为等待重试。
          error: message, // 写入最近一次错误。
          workerId: undefined, // 重试等待时释放 Worker 归属。
          lockedAt: undefined, // 重试等待时释放任务锁。
          nextRunAt: Date.now() + delayMs, // 写入下一次可运行时间。
          updatedAt: Date.now(), // 写入更新时间。
          timeline: [...running.timeline, timeline("Failed", `Worker ${this.id} 第 ${attemptNumber} 次尝试失败：${message}`), timeline("RetryScheduled", `${delayMs}ms 后安排第 ${attemptNumber + 1} 次重试`)], // 追加失败与重试节点。
        }; // 结束 retrying 任务。
        await this.store.update(retrying); // 保存等待重试状态。
        this.queue.enqueue(retrying); // 重新放入内存队列等待到期执行。
        return retrying; // 返回等待重试任务。
      } // 结束重试判断。
      const deadLetter: Job = { // 构造死信任务。
        ...running, // 继承 running 字段。
        status: "dead_letter", // 状态改为死信。
        error: message, // 写入最终错误。
        workerId: undefined, // 死信后释放 Worker 归属。
        lockedAt: undefined, // 死信后释放任务锁。
        nextRunAt: undefined, // 清空下一次运行时间。
        scheduledAt: undefined, // 清空计划执行时间。
        completedAt: Date.now(), // 写入进入死信时间。
        updatedAt: Date.now(), // 写入更新时间。
        timeline: [...running.timeline, timeline("Failed", `Worker ${this.id} 第 ${attemptNumber} 次尝试失败：${message}`), timeline("DeadLetter", `已达到最大尝试次数 ${running.maxAttempts}，任务进入死信队列`)], // 追加失败与死信节点。
      }; // 结束 deadLetter 任务。
      await this.store.update(deadLetter); // 保存死信状态。
      return deadLetter; // 返回死信任务。
    } // 结束 try/catch。
  } // 结束 process。
} // 结束 Worker。
