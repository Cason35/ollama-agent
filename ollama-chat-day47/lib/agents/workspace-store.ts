import type { Workspace, WorkspaceEntry, WorkspaceMetrics } from "@/lib/agents/agent-types"; /* 第42天：引入共享工作空间相关类型。 */

export interface WorkspaceStore { /* 第42天：定义工作空间存储接口，后续可替换为 MySQL 实现。 */
  create(workspace: Workspace): Promise<void>; /* 第42天：创建一次新的共享工作空间。 */
  get(id: string): Promise<Workspace | null>; /* 第42天：按 ID 读取共享工作空间快照。 */
  addEntry(workspaceId: string, entry: WorkspaceEntry): Promise<void>; /* 第42天：向共享工作空间追加 Agent 条目。 */
  listEntries(workspaceId: string): Promise<WorkspaceEntry[]>; /* 第42天：列出共享工作空间里的全部条目。 */
  getMetrics(workspaceId: string): Promise<WorkspaceMetrics>; /* 第42天：计算共享工作空间可观测指标。 */
} /* 第42天：结束 WorkspaceStore 接口定义。 */

export class MemoryWorkspaceStore implements WorkspaceStore { /* 第42天：定义内存版工作空间存储，适合作为教学项目的默认实现。 */
  private readonly workspaces = new Map<string, Workspace>(); /* 第42天：用 Map 保存所有工作空间快照。 */

  async create(workspace: Workspace): Promise<void> { /* 第42天：实现创建工作空间方法。 */
    this.workspaces.set(workspace.id, { ...workspace, entries: [...workspace.entries] }); /* 第42天：复制写入，避免外部直接修改内部状态。 */
  } /* 第42天：结束 create 方法。 */

  async get(id: string): Promise<Workspace | null> { /* 第42天：实现按 ID 读取工作空间方法。 */
    const workspace = this.workspaces.get(id); /* 第42天：从内存 Map 中查找工作空间。 */
    return workspace ? { ...workspace, entries: [...workspace.entries] } : null; /* 第42天：返回拷贝或空值，保护内部状态。 */
  } /* 第42天：结束 get 方法。 */

  async addEntry(workspaceId: string, entry: WorkspaceEntry): Promise<void> { /* 第42天：实现向工作空间追加条目方法。 */
    const workspace = this.workspaces.get(workspaceId); /* 第42天：读取目标工作空间。 */
    if (!workspace) return; /* 第42天：工作空间不存在时直接跳过，避免演示运行时崩溃。 */
    workspace.entries = [...workspace.entries, entry]; /* 第42天：追加新条目并保持不可变更新风格。 */
    workspace.updatedAt = Math.max(workspace.updatedAt, entry.createdAt); /* 第42天：用条目时间更新工作空间更新时间。 */
  } /* 第42天：结束 addEntry 方法。 */

  async listEntries(workspaceId: string): Promise<WorkspaceEntry[]> { /* 第42天：实现列出工作空间条目方法。 */
    const workspace = this.workspaces.get(workspaceId); /* 第42天：读取目标工作空间。 */
    return workspace ? [...workspace.entries] : []; /* 第42天：返回条目拷贝，避免调用方修改内部数组。 */
  } /* 第42天：结束 listEntries 方法。 */

  async getMetrics(workspaceId: string): Promise<WorkspaceMetrics> { /* 第42天：实现工作空间指标计算方法。 */
    const workspace = this.workspaces.get(workspaceId); /* 第42天：读取目标工作空间。 */
    const entries = workspace?.entries ?? []; /* 第42天：取出条目列表，空工作空间使用空数组。 */
    const entriesByType = countBy(entries, (entry) => entry.type); /* 第42天：统计不同条目类型数量。 */
    const entriesByAgent = countBy(entries, (entry) => entry.agentId); /* 第42天：统计不同 Agent 写入数量。 */
    return { entryCount: entries.length, entriesByType, entriesByAgent, lastUpdatedAt: workspace?.updatedAt ?? 0 }; /* 第42天：返回工作空间指标快照。 */
  } /* 第42天：结束 getMetrics 方法。 */
} /* 第42天：结束 MemoryWorkspaceStore 类定义。 */

export function createWorkspace(goal: string): Workspace { /* 第42天：定义创建工作空间快照的工具函数。 */
  const now = Date.now(); /* 第42天：记录创建时间，保证 createdAt 与 updatedAt 初始一致。 */
  return { id: `workspace-${now}-${Math.random().toString(36).slice(2, 8)}`, goal, entries: [], createdAt: now, updatedAt: now }; /* 第42天：返回可直接存储的工作空间对象。 */
} /* 第42天：结束 createWorkspace 函数。 */

function countBy(entries: WorkspaceEntry[], pickKey: (entry: WorkspaceEntry) => string): Record<string, number> { /* 第42天：定义通用分组计数函数。 */
  return entries.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [pickKey(entry)]: (acc[pickKey(entry)] ?? 0) + 1 }), {}); /* 第42天：按指定 key 聚合条目数量。 */
} /* 第42天：结束 countBy 函数。 */
