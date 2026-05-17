# 第18天学习总结：Conditional DAG + HITL 人工确认

对照 `ollama-chat-day17/day17_learning_summary.md` §8 学习计划，本仓库 **`ollama-chat-day18`** 已实现 Human-in-the-loop。

## 实现映射

| 任务 | 实现位置 |
|------|----------|
| `requiresConfirmation` / `confirmationMessage` / `waiting_confirmation` | `lib/workflow-types.ts`、`app/api/chat/route.ts` |
| Executor 暂停 | `executeWorkflow` 在 `Promise.all` 前检测 HITL |
| `POST /api/workflow/confirm` | `app/api/workflow/confirm/route.ts` |
| 用户确认续跑 / 取消（策略 A） | `confirm` + `applyWorkflowUserCancel` |
| Planner HITL 提示词 | `planWorkflowSteps` |
| Validator + repair | `validateWorkflow`、`repairWorkflowConfirmationMessage` |
| 前端确认按钮 | `app/page.tsx` |
| `[HITL]` 日志 | `route.ts`、`confirm/route.ts` |

## 第18天打卡

1. 是否实现 requiresConfirmation：**是**
2. 是否新增 waiting_confirmation 状态：**是**
3. Executor 是否能暂停 workflow：**是**
4. 前端是否能展示确认按钮：**是**
5. 用户确认后是否能继续执行：**是**
6. 用户取消后是否能停止 workflow：**是**（策略 A：`cancelled`）
7. Planner 是否能生成 requiresConfirmation：**是**
8. Validator 是否检查 confirmation：**是**
9. Timeline 是否展示 HITL 事件：**是**（⏸️ 等待、👤 用户已确认）
10. 是否增加 HITL debug 日志：**是**

12. 当前系统能力：**Conditional DAG Runtime + HITL**

## 手动测试建议

开启「多步 Workflow」，输入：

> 帮我整理今天学习内容，并生成最终提交版总结

预期：第一步自动执行后，含「最终提交」的步骤变为 ⏸️ `waiting_confirmation`，页面出现「确认执行 / 取消」按钮。
