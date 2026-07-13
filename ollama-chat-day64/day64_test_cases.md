# Day64 Unified Runtime Context 测试用例

## 测试目标

验证 RuntimeContext V2、RuntimeContextBuilder、Context Middleware，以及 Agent、Tool、RAG、Prompt、Model、Evaluation、Trace 模块是否共享同一份运行时上下文。

## 自动化执行

```bash
npm run test:day64
```

## 测试用例

| 编号 | 场景 | 操作 | 预期结果 |
| --- | --- | --- | --- |
| TC64-01 | 自动生成标识 | 构建空白上下文 | 自动生成 `req_` Request ID、`trace_` Trace ID 与 Session ID |
| TC64-02 | 复用会话 | 传入固定 Session ID | 构建结果保留原 Session ID |
| TC64-03 | 密钥安全边界 | Model Context 传入 `secretRef` | 上下文只包含密钥引用，不包含密钥明文 |
| TC64-04 | Context Middleware | 执行 Auth、Trace、Memory 中间件 | 用户、追踪状态和记忆来源被统一补齐 |
| TC64-05 | Agent Runtime 接入 | 执行 Research Task | Agent 记录使用统一 Request ID 和 Trace ID |
| TC64-06 | Tool Runtime 接入 | 查看 Tool 模块记录 | Tool 与 Agent 共享用户、会话、记忆和用量上下文 |
| TC64-07 | RAG 与 Prompt 接入 | 查看 RAG、Prompt 模块记录 | 读取 `hybrid` 检索策略和 `research.v64` 提示词版本 |
| TC64-08 | Model Runtime 接入 | 查看 Model 模块记录 | 读取模型选择和 `XIAOMI_MIMO_API_KEY` 引用，不泄露真实值 |
| TC64-09 | Evaluation 接入 | 完整链路执行结束 | Evaluation 关联 Prompt、Model、Usage、Trace，状态为 `passed` |
| TC64-10 | 全链路一致性 | 检查七个模块记录 | Agent、Tool、RAG、Prompt、Model、Evaluation、Trace 的 Request ID 与 Trace ID 完全一致 |
| TC64-11 | Explorer 页面 | 打开右侧“上下文”标签 | 展示一致性结论、模块摘要和脱敏后的完整 Context JSON |
| TC64-12 | API 重跑 | GET 或 POST `/api/runtime/context` | 返回新的或指定标识的统一运行时快照 |

## 手工验收步骤

1. 执行 `npm run dev`。
2. 打开首页，确认浏览器标签标题包含 `Day 64` 和 `Unified Runtime Context`。
3. 确认页头显示 Day 64、Production Upgrade V1、统一运行时上下文。
4. 在右侧控制台打开“上下文”标签。
5. 确认“上下文一致性”为“通过”。
6. 确认七个模块均显示“同一 Trace”。
7. 点击“重新测试”，确认生成新的 Request ID、Trace ID 和 Session ID。
8. 检查 JSON，仅出现 `secretRef`，不出现真实 API Key。

## 验收结论

以上用例全部通过时，Day64 的十项验收标准完成。
