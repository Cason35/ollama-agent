# Ollama Chat Day10

在 Day9 多工具 Agent 基础上，Day10 已完成：

- `summary` 由占位实现升级为真实 LLM 总结
- `todo` 由占位实现升级为结构化 JSON 列表
- 增加统一日志（`[Agent] route/result/error`）
- 增加 `todo` JSON 解析容错与 fallback
- 补充关键测试用例文档（正常/边界/异常）

## 下一步（Day11：Memory 体系升级）

- 实现 Summary Memory：长对话时自动压缩旧消息并写入 `longTerm`
- 记忆结构升级为 `shortTerm + longTerm`，替代纯 `messages.slice(-10)`
- 增加 memory debug 面板，实时可视化 `longTerm`
- 优化 summary prompt，防止无效闲聊污染长期记忆
- 先用规则区分长期/短期记忆（后续再引入 embedding）

## 启动

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。
