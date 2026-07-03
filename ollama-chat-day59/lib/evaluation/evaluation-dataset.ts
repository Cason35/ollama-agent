import type { EvaluationCase, EvaluationDataset, EvaluationDimension, EvaluationRubric } from "./regression-types"; /* 第46天：引入评估数据集与评分规则类型。 */

const DIMENSIONS: EvaluationDimension[] = ["completeness", "correctness", "relevance", "coverage"]; /* 第46天：定义固定的四个评分维度。 */

function createRubric(requiredTerms: Record<EvaluationDimension, string[]>, passThreshold = 75): EvaluationRubric { /* 第46天：根据关键术语创建稳定评分规则。 */
  return { /* 第46天：返回包含通过阈值和四维规则的评分表。 */
    passThreshold, /* 第46天：写入案例通过分数线。 */
    dimensions: { /* 第46天：开始定义四个维度规则。 */
      completeness: { criteria: "覆盖任务要求中的必要信息", requiredTerms: requiredTerms.completeness, weight: 0.25 }, /* 第46天：定义完整性规则。 */
      correctness: { criteria: "关键事实、动作或结构正确", requiredTerms: requiredTerms.correctness, weight: 0.35 }, /* 第46天：定义正确性规则。 */
      relevance: { criteria: "回答紧扣输入且不跑题", requiredTerms: requiredTerms.relevance, weight: 0.2 }, /* 第46天：定义相关性规则。 */
      coverage: { criteria: "覆盖风险、边界或下一步", requiredTerms: requiredTerms.coverage, weight: 0.2 }, /* 第46天：定义覆盖度规则。 */
    }, /* 第46天：结束四个维度规则。 */
  }; /* 第46天：结束评分表。 */
} /* 第46天：结束评分规则创建函数。 */

export const DAY46_EVALUATION_DATASET: EvaluationDataset = { /* 第46天：建立覆盖正常、失败和边界输入的小型评估数据集。 */
  id: "continuous-evaluation-core", /* 第46天：设置数据集唯一标识。 */
  name: "Day 46 Continuous Evaluation Core", /* 第46天：设置数据集展示名称。 */
  version: "46.1.0", /* 第46天：设置数据集版本。 */
  description: "覆盖知识问答、规划、工具调用、历史失败与边界输入的固定回归测试集。", /* 第46天：说明数据集覆盖范围。 */
  cases: [ /* 第46天：开始定义全部评估案例。 */
    { /* 第46天：定义正常知识问答案例。 */
      id: "normal-knowledge-capital", /* 第46天：设置案例 ID。 */
      name: "知识问答事实正确性", /* 第46天：设置案例名称。 */
      kind: "normal", /* 第46天：标记为正常案例。 */
      input: "法国的首都是哪里？请用一句话回答。", /* 第46天：设置知识问答输入。 */
      expectedOutput: "法国的首都是巴黎。", /* 第46天：设置期望输出。 */
      rubric: createRubric({ completeness: ["法国", "巴黎"], correctness: ["巴黎"], relevance: ["首都"], coverage: ["法国"] }), /* 第46天：设置知识问答评分规则。 */
      tags: ["知识问答", "事实正确性"], /* 第46天：设置能力标签。 */
      difficulty: "easy", /* 第46天：设置难度。 */
      priority: "high", /* 第46天：设置优先级。 */
      source: "manual", /* 第46天：设置案例来源。 */
    }, /* 第46天：结束正常知识问答案例。 */
    { /* 第46天：定义正常规划案例。 */
      id: "normal-plan-release", /* 第46天：设置案例 ID。 */
      name: "版本发布计划", /* 第46天：设置案例名称。 */
      kind: "normal", /* 第46天：标记为正常案例。 */
      input: "为一次小版本发布给出可执行的三步计划。", /* 第46天：设置规划输入。 */
      referenceAnswer: "先验证测试，再灰度发布，最后监控并准备回滚。", /* 第46天：设置参考答案。 */
      rubric: createRubric({ completeness: ["测试", "发布", "监控"], correctness: ["测试", "灰度"], relevance: ["发布"], coverage: ["回滚"] }), /* 第46天：设置规划评分规则。 */
      tags: ["规划", "可执行性"], /* 第46天：设置能力标签。 */
      difficulty: "medium", /* 第46天：设置难度。 */
      priority: "medium", /* 第46天：设置优先级。 */
      source: "manual", /* 第46天：设置案例来源。 */
    }, /* 第46天：结束正常规划案例。 */
    { /* 第46天：定义工具调用正常案例。 */
      id: "normal-tool-weather", /* 第46天：设置案例 ID。 */
      name: "天气工具调用参数", /* 第46天：设置案例名称。 */
      kind: "normal", /* 第46天：标记为正常案例。 */
      input: "查询明天上海天气，并给出应携带物品建议。", /* 第46天：设置工具调用输入。 */
      expectedOutput: "调用 weather 工具，location 为上海，date 为明天，再根据降雨给出雨具建议。", /* 第46天：设置期望输出。 */
      rubric: createRubric({ completeness: ["weather", "上海", "明天", "建议"], correctness: ["location", "上海", "明天"], relevance: ["天气"], coverage: ["雨具"] }, 80), /* 第46天：设置工具调用评分规则。 */
      tags: ["工具调用", "参数校验"], /* 第46天：设置能力标签。 */
      difficulty: "medium", /* 第46天：设置难度。 */
      priority: "critical", /* 第46天：设置为不可退步的关键案例。 */
      source: "manual", /* 第46天：设置案例来源。 */
    }, /* 第46天：结束工具调用案例。 */
    { /* 第46天：定义历史事实错误案例。 */
      id: "bad-factual-arithmetic", /* 第46天：设置案例 ID。 */
      name: "历史事实错误复现", /* 第46天：设置案例名称。 */
      kind: "bad_case", /* 第46天：标记为失败案例。 */
      input: "2 + 2 等于多少？只返回算式和结果。", /* 第46天：设置失败复现输入。 */
      expectedOutput: "2 + 2 = 4", /* 第46天：设置期望输出。 */
      rubric: createRubric({ completeness: ["2 + 2", "4"], correctness: ["= 4"], relevance: ["2 + 2"], coverage: ["4"] }, 90), /* 第46天：设置事实错误评分规则。 */
      tags: ["知识问答", "Bad Case", "事实错误"], /* 第46天：设置失败标签。 */
      difficulty: "easy", /* 第46天：设置难度。 */
      priority: "critical", /* 第46天：设置关键优先级。 */
      source: "production_failure", /* 第46天：标记来源为线上失败。 */
    }, /* 第46天：结束历史事实错误案例。 */
    { /* 第46天：定义历史遗漏案例。 */
      id: "bad-deploy-rollback", /* 第46天：设置案例 ID。 */
      name: "部署计划遗漏回滚", /* 第46天：设置案例名称。 */
      kind: "bad_case", /* 第46天：标记为失败案例。 */
      input: "给出生产发布前的最小检查清单。", /* 第46天：设置失败复现输入。 */
      referenceAnswer: "检查测试、备份、监控、灰度方案和回滚预案。", /* 第46天：设置参考答案。 */
      rubric: createRubric({ completeness: ["测试", "备份", "监控", "回滚"], correctness: ["测试", "回滚"], relevance: ["发布"], coverage: ["灰度", "回滚"] }, 80), /* 第46天：设置遗漏问题评分规则。 */
      tags: ["规划", "Bad Case", "遗漏"], /* 第46天：设置失败标签。 */
      difficulty: "hard", /* 第46天：设置难度。 */
      priority: "high", /* 第46天：设置高优先级。 */
      source: "historical_regression", /* 第46天：标记来源为历史回归。 */
    }, /* 第46天：结束历史遗漏案例。 */
    { /* 第46天：定义空输入边界案例。 */
      id: "edge-empty-input", /* 第46天：设置案例 ID。 */
      name: "空输入澄清", /* 第46天：设置案例名称。 */
      kind: "edge_case", /* 第46天：标记为边界案例。 */
      input: "", /* 第46天：使用空字符串验证极端输入。 */
      expectedOutput: "请补充具体问题、目标或上下文。", /* 第46天：设置期望澄清输出。 */
      rubric: createRubric({ completeness: ["补充", "问题"], correctness: ["补充"], relevance: ["问题"], coverage: ["上下文"] }, 70), /* 第46天：设置空输入评分规则。 */
      tags: ["Edge Case", "空输入"], /* 第46天：设置边界标签。 */
      difficulty: "easy", /* 第46天：设置难度。 */
      priority: "medium", /* 第46天：设置优先级。 */
      source: "manual", /* 第46天：设置案例来源。 */
    }, /* 第46天：结束空输入边界案例。 */
    { /* 第46天：定义超时隔离边界案例。 */
      id: "edge-model-timeout", /* 第46天：设置案例 ID。 */
      name: "单案例超时隔离", /* 第46天：设置案例名称。 */
      kind: "edge_case", /* 第46天：标记为边界案例。 */
      input: "处理一段超长文本并在超时时保持批任务继续执行。", /* 第46天：设置长文本与超时输入。 */
      expectedOutput: "限制长度，记录超时，并继续执行后续案例。", /* 第46天：设置期望降级输出。 */
      rubric: createRubric({ completeness: ["限制", "超时", "继续"], correctness: ["超时", "继续"], relevance: ["长文本"], coverage: ["后续案例"] }, 75), /* 第46天：设置超时隔离评分规则。 */
      tags: ["Edge Case", "长文本", "超时"], /* 第46天：设置边界标签。 */
      difficulty: "hard", /* 第46天：设置难度。 */
      priority: "low", /* 第46天：设置低优先级以演示非阻断边界失败。 */
      source: "manual", /* 第46天：设置案例来源。 */
    }, /* 第46天：结束超时隔离边界案例。 */
  ], /* 第46天：结束全部评估案例。 */
}; /* 第46天：结束第46天评估数据集。 */

export function validateEvaluationDataset(dataset: EvaluationDataset): string[] { /* 第46天：校验数据集结构并返回全部错误。 */
  const errors: string[] = []; /* 第46天：创建错误收集数组。 */
  const ids = new Set<string>(); /* 第46天：创建案例 ID 去重集合。 */
  if (!dataset.id.trim() || !dataset.name.trim() || !dataset.version.trim()) errors.push("数据集 id、name 和 version 不能为空"); /* 第46天：校验数据集基础元数据。 */
  if (dataset.cases.length === 0) errors.push("评估数据集至少需要一个案例"); /* 第46天：校验数据集非空。 */
  dataset.cases.forEach((item: EvaluationCase) => { /* 第46天：逐个校验评估案例。 */
    if (ids.has(item.id)) errors.push(`案例 ID 重复：${item.id}`); /* 第46天：记录重复 ID 错误。 */
    ids.add(item.id); /* 第46天：登记当前案例 ID。 */
    if (!item.expectedOutput && !item.referenceAnswer) errors.push(`案例 ${item.id} 缺少期望输出或参考答案`); /* 第46天：校验参考答案存在。 */
    if (item.tags.length === 0) errors.push(`案例 ${item.id} 至少需要一个标签`); /* 第46天：校验案例标签。 */
    if (item.rubric.passThreshold < 0 || item.rubric.passThreshold > 100) errors.push(`案例 ${item.id} 的通过阈值无效`); /* 第46天：校验通过阈值。 */
    const totalWeight = DIMENSIONS.reduce((sum, dimension) => sum + item.rubric.dimensions[dimension].weight, 0); /* 第46天：计算四个维度总权重。 */
    if (Math.abs(totalWeight - 1) > 0.001) errors.push(`案例 ${item.id} 的评分权重之和必须为 1`); /* 第46天：校验评分权重之和。 */
  }); /* 第46天：结束逐案例校验。 */
  return errors; /* 第46天：返回完整错误列表。 */
} /* 第46天：结束数据集校验函数。 */

export function assertEvaluationDataset(dataset: EvaluationDataset): void { /* 第46天：定义失败即抛错的数据集断言。 */
  const errors = validateEvaluationDataset(dataset); /* 第46天：执行完整数据集校验。 */
  if (errors.length > 0) throw new Error(`Evaluation Dataset 校验失败：${errors.join("；")}`); /* 第46天：存在错误时阻止批量评估启动。 */
} /* 第46天：结束数据集断言。 */
