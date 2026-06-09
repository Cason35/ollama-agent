import type { Agent, AgentMetrics } from "@/lib/agents/agent-types"; /* 引入智能体类型与指标类型 */

export class AgentRegistry { /* 定义第39天智能体注册表 */
  private readonly agents = new Map<string, Agent>(); /* 使用 Map 按 id 保存所有智能体 */

  register(agent: Agent): void { /* 定义注册单个智能体的方法 */
    this.agents.set(agent.id, agent); /* 将智能体写入注册表 */
  } /* 结束 register 方法 */

  get(id: string): Agent | undefined { /* 定义按 id 查找智能体的方法 */
    return this.agents.get(id); /* 返回命中的智能体或 undefined */
  } /* 结束 get 方法 */

  list(): Agent[] { /* 定义列出所有智能体的方法 */
    return Array.from(this.agents.values()); /* 将 Map values 转成稳定数组返回 */
  } /* 结束 list 方法 */

  findByCapability(capability: string): Agent[] { /* 定义按能力搜索智能体的方法 */
    const normalized = capability.trim().toLowerCase(); /* 标准化查询能力 */
    if (!normalized) return []; /* 空能力查询直接返回空列表 */
    return this.list().filter((agent) => agent.capabilities.some((item) => item.toLowerCase() === normalized)); /* 返回拥有该能力的智能体 */
  } /* 结束 findByCapability 方法 */

  getMetrics(runtimeMetrics?: Partial<Pick<AgentMetrics, "executedTasks" | "delegatedTasks" | "avgTaskDuration" | "successRate">>): AgentMetrics { /* 定义注册表与运行时指标聚合方法 */
    const agents = this.list(); /* 读取当前所有智能体 */
    const capabilities = new Set(agents.flatMap((agent) => agent.capabilities)); /* 去重统计所有能力 */
    const tools = new Set(agents.flatMap((agent) => agent.tools)); /* 去重统计所有工具 */
    return { totalAgents: agents.length, capabilityCount: capabilities.size, toolCoverage: tools.size, executedTasks: runtimeMetrics?.executedTasks ?? 0, delegatedTasks: runtimeMetrics?.delegatedTasks ?? 0, avgTaskDuration: runtimeMetrics?.avgTaskDuration ?? 0, successRate: runtimeMetrics?.successRate ?? 0 }; /* 返回第39天指标快照 */
  } /* 结束 getMetrics 方法 */
} /* 结束 AgentRegistry 类定义 */
