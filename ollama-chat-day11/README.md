# Ollama Chat Day11

基于 Day10 业务能力，完成第 11 天 Memory 体系升级：

- Summary Memory：对话超过阈值后，旧消息会被压缩到 `longTerm`
- 记忆结构升级：`shortTerm + longTerm`
- 记忆可视化：前端提供 `Memory Debug` 面板实时查看 `longTerm`
- 防污染总结：摘要提示词只保留身份/目标/偏好/约束等事实
- 记忆分层规则：命中 `我是/我想/目标/偏好` 等表达自动加入长期记忆

## 启动

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。
