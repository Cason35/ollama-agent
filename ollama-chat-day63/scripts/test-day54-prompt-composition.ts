import assert from "node:assert/strict"; /* 第54天：引入 Node.js 严格断言工具。 */
import { AgentRuntime } from "../lib/agents/agent-runtime"; /* 第54天：引入 Agent Runtime，用于验证运行时已接入 PromptBuilder。 */
import { createDefaultAgentRegistry } from "../lib/agents/default-agents"; /* 第54天：引入默认 Agent Registry 工厂。 */
import { comparePromptBlocks } from "../lib/prompts/prompt-block-diff"; /* 第54天：引入 PromptBlock Diff 测试目标。 */
import { calculatePromptBlockMetrics } from "../lib/prompts/prompt-block-metrics"; /* 第54天：引入 PromptBlock Metrics 测试目标。 */
import { promptBuilder } from "../lib/prompts/prompt-builder"; /* 第54天：引入 PromptBuilder 测试目标。 */
import { buildRuntimePromptBlocks, createDefaultPromptBlockRegistry } from "../lib/prompts/default-prompt-blocks"; /* 第54天：引入默认块注册表和运行时块组装函数。 */
import { buildSamplePromptVariables } from "../lib/prompts/prompt-contracts"; /* 第54天：引入样例变量构造器。 */
import { createDefaultPromptRegistry } from "../lib/prompts/default-prompts"; /* 第54天：引入默认 Prompt Registry 工厂。 */
async function main(): Promise<void> { /* 第54天：定义测试入口函数。 */
  const blockRegistry = createDefaultPromptBlockRegistry(); /* 第54天：创建隔离 PromptBlockRegistry，避免测试污染共享单例。 */
  const memoryBlock = blockRegistry.get("memory.context"); /* 第54天：读取默认记忆块。 */
  const memoryBlockV2 = blockRegistry.get("memory.context.v2"); /* 第54天：读取增强版记忆块。 */
  assert.ok(memoryBlock); /* 第54天：验证默认记忆块已注册。 */
  assert.ok(memoryBlockV2); /* 第54天：验证增强版记忆块已注册。 */
  blockRegistry.disable("tool.context"); /* 第54天：禁用工具块以测试注册表 disable 能力。 */
  assert.equal(blockRegistry.get("tool.context")?.enabled, false); /* 第54天：验证工具块禁用状态已写入。 */
  blockRegistry.enable("tool.context"); /* 第54天：重新启用工具块以测试注册表 enable 能力。 */
  assert.equal(blockRegistry.get("tool.context")?.enabled, true); /* 第54天：验证工具块启用状态已恢复。 */
  const promptRegistry = createDefaultPromptRegistry(); /* 第54天：创建隔离 PromptRegistry，用于读取 active Prompt Version。 */
  const activeResearch = promptRegistry.getActive("research"); /* 第54天：读取 research 当前 active 提示词。 */
  assert.ok(activeResearch); /* 第54天：验证 research active 提示词存在。 */
  const runtimeBlocks = buildRuntimePromptBlocks("research", activeResearch, "你是研究型 Agent。", blockRegistry); /* 第54天：把 active Prompt 和默认上下文块组装成运行时块列表。 */
  const sampleVariables = buildSamplePromptVariables(activeResearch); /* 第54天：构造带 task、memory、workspace、tools 的样例变量。 */
  const fullResult = promptBuilder.buildPromptWithReport(runtimeBlocks, sampleVariables); /* 第54天：使用完整上下文构建组合提示词。 */
  assert.ok(fullResult.usedBlockIds.includes("memory.context")); /* 第54天：验证有记忆上下文时 Memory Block 被命中。 */
  assert.ok(fullResult.usedBlockIds.includes("workspace.context")); /* 第54天：验证有工作空间上下文时 Workspace Block 被命中。 */
  assert.ok(fullResult.text.includes("##")); /* 第54天：验证组合输出包含块标题边界，便于调试。 */
  assert.ok(fullResult.text.includes(sampleVariables.task)); /* 第54天：验证变量 task 已正确渲染。 */
  const withoutMemory = promptBuilder.buildPromptWithReport(runtimeBlocks, { ...sampleVariables, memory: "" }); /* 第54天：使用缺少 memory 的上下文再次构建提示词。 */
  assert.ok(withoutMemory.skippedBlockIds.includes("memory.context")); /* 第54天：验证 memory 缺失时 Memory Block 自动条件跳过。 */
  assert.ok(withoutMemory.usedBlockIds.includes("task.goal")); /* 第54天：验证 Task Block 不受 memory 缺失影响。 */
  const blockDiff = comparePromptBlocks(memoryBlock, memoryBlockV2); /* 第54天：对比基础记忆块和增强版记忆块。 */
  assert.ok(blockDiff.changes.some((change) => change.field === "template")); /* 第54天：验证 Block Diff 能识别模板正文变化。 */
  assert.ok(blockDiff.addedLines.length > 0); /* 第54天：验证 Block Diff 能识别新增行。 */
  const metrics = calculatePromptBlockMetrics(blockRegistry.list(), [fullResult, withoutMemory]); /* 第54天：基于两次构建结果计算块指标。 */
  assert.equal(metrics.totalBlocks, blockRegistry.list().length); /* 第54天：验证指标中的块总数和注册表一致。 */
  assert.ok(metrics.enabledRate > 0); /* 第54天：验证启用率为正数。 */
  const memoryMetric = metrics.blocks.find((block) => block.blockId === "memory.context"); /* 第54天：读取记忆块指标。 */
  assert.equal(memoryMetric?.hitCount, 1); /* 第54天：验证记忆块只在有 memory 的构建中命中一次。 */
  assert.equal(memoryMetric?.renderCount, 2); /* 第54天：验证记忆块参与了两次组合样例统计。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry()); /* 第54天：创建 AgentRuntime，验证真实运行入口可使用 PromptBuilder。 */
  const agentResult = await runtime.executeAgent("research", { id: "day54-runtime-test", goal: "验证 Day54 Prompt Composition Runtime 接入。" }, { memory: { notes: ["Day54 使用 PromptBuilder 组合提示词。"] }, workflow: null, tools: ["retrieval"] }); /* 第54天：无模型执行 research Agent，触发 resolvePrompt 的组合式路径。 */
  assert.equal(agentResult.metadata?.ok, true); /* 第54天：验证 Agent Runtime 无模型路径执行成功。 */
  assert.ok(agentResult.output.includes("Research Agent")); /* 第54天：验证运行时返回了可读的模拟输出。 */
  console.log("Day 54 Prompt Composition tests passed."); /* 第54天：输出测试通过信息。 */
} /* 第54天：结束测试入口函数。 */
main().catch((error) => { /* 第54天：捕获未处理异常并标记测试失败。 */
  console.error(error); /* 第54天：输出失败原因。 */
  process.exitCode = 1; /* 第54天：设置进程失败状态码。 */
}); /* 第54天：结束异常兜底。 */
