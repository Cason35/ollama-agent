# Day63 Secrets Management 测试用例

## 测试目标

验证 Day63 新增的 Secrets Management（密钥管理）能力是否满足以下要求：

- SecretItem（密钥项）只在后端保存真实值。
- SecretProvider（密钥提供者）只能列出 key，不能批量列出 value。
- SecretsManager（密钥管理器）支持 get、set、rotate、delete。
- 运行时写入密钥使用 AES-256-GCM 加密保存。
- Secret Rotation（密钥轮换）会让新值生效、旧版本失效。
- Trace（追踪记录）不会输出 API Key、Password、Token、Secret 等敏感内容。
- Secrets Explorer（密钥浏览器）只展示脱敏元数据，不展示真实 value。
- Secrets Metrics（密钥指标）能统计总数、轮换次数、访问次数、加密数量和过期数量。

## 自动测试

执行命令：

```bash
npm run test:day63
```

预期结果：

```text
Day63 Secrets Management tests passed.
```

## 用例 1：写入密钥并验证加密

步骤：

1. 通过 `SecretsManager.set()` 写入 `DAY63_TEST_SECRET`。
2. 读取内存 Provider 的测试用密文。
3. 检查密文以 `day63:v1.` 开头。
4. 检查密文不包含原始明文。

预期结果：

- 真实密钥不会明文保存在内存密钥库。
- `SecretsSnapshot` 中不会出现真实 value。

## 用例 2：读取密钥

步骤：

1. 调用 `SecretsManager.get("DAY63_TEST_SECRET")`。
2. 比对返回值是否等于写入值。

预期结果：

- Manager 能解密并返回真实密钥。
- `accessCount` 指标递增。

## 用例 3：轮换密钥

步骤：

1. 调用 `rotateSecret("DAY63_TEST_SECRET", "new-value")`。
2. 比对新旧版本 ID。
3. 再次调用 `get()` 读取密钥。

预期结果：

- 新旧版本 ID 不同。
- 读取结果为新值。
- 快照仍不包含真实新值。

## 用例 4：运行时接入

步骤：

1. 写入 `XIAOMI_MIMO_API_KEY`。
2. 调用 `buildModelRuntime("mimo", MIMO_MODEL_IDS[0])`。
3. 检查 `rt.mimoApiKey` 来源。

预期结果：

- MiMo 运行时从 `SecretsManager` 读取 API Key。
- 不再从配置中心读取 `model.mimoApiKey`。

## 用例 5：Trace 脱敏

步骤：

1. 创建 Trace。
2. 写入包含 `apiKey`、`password`、`token` 的 metadata。
3. 读取 Trace 并序列化检查。

预期结果：

- Trace 不包含敏感明文。
- 敏感字段统一显示为 `************`。

## 用例 6：Secrets Explorer 手测

步骤：

1. 启动项目并打开首页。
2. 进入右侧默认的“密钥”标签页。
3. 新增一个密钥。
4. 轮换该密钥。
5. 删除该密钥。

预期结果：

- 页面只显示 Key、Category、Source、Encrypted、Version ID 和时间。
- 页面不显示真实 value。
- 轮换历史会出现新旧版本 ID。
- 环境变量来源密钥不能从页面删除。
