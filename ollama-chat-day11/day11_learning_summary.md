# Day11 学习总结（Memory 体系升级）

## 已完成

1. 记忆结构升级为 `shortTerm + longTerm`
   - 通过把输入上下文拆成“最近窗口”和“沉淀事实”，把模型的注意力明确分配：shortTerm 负责当前语境保真，longTerm 负责稳定记忆可复用。
2. 对话超过阈值自动触发 Summary Memory（压缩旧消息）
   - 完成逻辑是：当 `messages` 超过 `MAX_CONTEXT_MESSAGES` 时，不直接无限拼接，而是把“旧消息”交给 `summarizeForMemory()` 做结构化压缩；这样既控制 token，又避免旧内容淹没新信息。
3. `longTerm` 采用追加+去重策略，并限制最大长度
   - 通过 `appendMemoryLines()` 进行“追加合并”，并结合按行去重（`splitMemoryLines()`）与截断（`trimLongTerm()`）保证：长期记忆会增长，但增长是可控且不会重复堆叠。
4. 增加防污染摘要 prompt，仅保留身份/目标/偏好/约束
   - 完成逻辑是用 prompt 约束摘要“只提炼认知要点”：禁用闲聊/角色化叙述（如“用户说/助手说”）、用 `- ` 项目符号输出事实，并要求避免重复已有事实；从源头减少 longTerm 的噪声。
5. 增加规则分层记忆（命中“我是/我想/目标/偏好”等语句）
   - 通过 `LONG_TERM_RULE_PATTERN` + `extractRuleBasedMemory()` 把“高置信、低歧义”的用户自述信息直接落库为长期事实；即使摘要模型偶发波动，这类关键身份信息也能稳定沉淀。
6. 前端新增 Memory Debug 面板，可视化 `longTerm`
   - 通过在 `page.tsx` 中把路由返回的 `memory` 以可观测方式呈现，做到“记忆质量可诊断”：能快速判断是否污染、是否过长、以及裁剪/注入是否按预期生效。

## 完成的整体逻辑链路（从输入到输出）
1. 输入组织：前端每轮请求都携带 `{ messages, memory }`，其中 `memory` 用于承接上轮沉淀的长期事实。
2. 内存构建：后端 `buildMemory()` 同时产出 `shortTerm`（最近窗口）与 `longTerm`（规则提纯 + 摘要累积后的事实集合）。
3. 摘要触发与压缩：仅当上下文超阈值时才触发 `summarizeForMemory()`，把“旧对话”转成可合并的事实条目，避免频繁摘要带来的不稳定与额外 token 成本。
4. 长期更新与去污染：`longTerm` 不是覆盖而是 append；用去重与长度截断控制增长，并依赖摘要 prompt 的约束降低闲聊污染。
5. 注入推理：最终模型上下文采用 `system(longTerm) + shortTerm`，让长期事实先进入“决策框架”，短期窗口再补齐“当前语境”。
6. 状态闭环：路由返回更新后的 `memory`，前端 `setMemory(data.memory)` 同步到下一轮，使系统能够持续演化而不是每轮重来。

## 第11天打卡

1. 是否实现 Summary Memory：是
2. 是否在对话过长时自动触发：是
3. longTerm memory 是否生效：是
4. 模型是否能记住早期信息：是（通过 `system(longTerm) + shortTerm` 的上下文注入顺序）
5. 是否实现 memory 可视化：是
6. 是否优化 summary prompt：是
7. 是否区分长期/短期记忆：是（规则版）
8. 遇到的最大问题：如何避免长期记忆冗余和闲聊污染
9. 当前系统能力：多工具路由 + 摘要记忆 + 记忆可视化 + 容错
10. 明天准备优化：加入自动化测试，评估 token 与记忆召回准确率
