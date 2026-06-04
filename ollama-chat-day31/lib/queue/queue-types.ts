export type JobStatus = "queued" | "running" | "success" | "failed"; // 定义任务状态：排队、执行、成功、失败

export type JobType = "workflow" | "retrieval" | "embedding" | "reindex"; // 定义第31天支持的任务类型

export type JobTimelineItem = { // 定义任务时间线条目类型
  label: "Created" | "Started" | "Completed" | "Failed"; // 定义时间线节点名称
  at: number; // 记录节点发生时间戳
  note: string; // 记录节点中文说明
}; // JobTimelineItem 类型结束

export type Job = { // 定义后台任务结构
  id: string; // 任务唯一 ID
  type: JobType; // 任务类型
  payload: Record<string, unknown>; // 任务输入载荷
  status: JobStatus; // 当前任务状态
  result?: Record<string, unknown>; // 成功结果
  error?: string; // 失败错误
  createdAt: number; // 创建时间
  startedAt?: number; // 开始时间
  completedAt?: number; // 完成时间
  timeline: JobTimelineItem[]; // 任务时间线
}; // Job 类型结束

export type JobStoreSnapshot = { // 定义 JobStore 对外快照
  jobs: Job[]; // 所有任务列表
  metrics: QueueMetrics; // 队列指标
}; // JobStoreSnapshot 类型结束

export type QueueMetrics = { // 定义队列指标
  queuedJobs: number; // 排队中任务数
  runningJobs: number; // 执行中任务数
  completedJobs: number; // 已成功任务数
  failedJobs: number; // 已失败任务数
  avgDuration: number; // 平均执行耗时毫秒
}; // QueueMetrics 类型结束

export type CreateJobInput = { // 定义创建任务输入
  type: JobType; // 用户选择的任务类型
  payload?: Record<string, unknown>; // 可选任务载荷
}; // CreateJobInput 类型结束

export interface JobStore { // 定义任务存储接口
  create(job: Job): Promise<Job>; // 创建任务
  get(id: string): Promise<Job | null>; // 按 ID 读取任务
  update(job: Job): Promise<Job>; // 更新任务
  list(): Promise<Job[]>; // 列出全部任务
} // JobStore 接口结束
