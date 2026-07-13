# Ollama Chat Day 63

Day 63 在 Day 62 Configuration Center（配置中心）基础上，进入 Production Infrastructure V6（生产基础设施第6版），核心主题是 Secrets Management（密钥管理）。

本项目保留 Chat、Workflow、RAG、Redis、Queue、Distributed Lock、Object Storage 和 Configuration Center，并新增：

- `SecretItem`：统一密钥项结构，记录 key、category、encrypted、createdAt 和 updatedAt。
- `SecretProvider`：统一密钥提供者接口，只允许 `listKeys()`，不提供 `listValues()`。
- `SecretsManager`：统一读取、写入、轮换、删除、指标和安全快照入口。
- `Secret Encryption`：运行时写入密钥使用 AES-256-GCM 加密保存。
- `Secret Rotation`：支持新值轮换并记录旧版本与新版本 ID。
- `Secret Masking`：Trace metadata 自动脱敏 API Key、Password、Token 和 Secret。
- `Secrets Explorer`：前端只展示脱敏元数据，不展示真实密钥值。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 63 Secrets Management。

## 测试

```bash
npm run test:day63
```

Day 63 的测试用例说明见 `day63_test_cases.md`。
