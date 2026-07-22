# Day74 Security 架构

## 密钥规则

生产配置对象不保存真实密码，只保存以下引用：

- `env:MYSQL_PASSWORD`
- `env:MINIO_ACCESS_KEY`
- `env:MINIO_SECRET_KEY`
- `env:JWT_SECRET`

`.env` 被 Git 忽略，仓库只提交 `.env.example`。示例值只能用于本地教学，生产环境应由 Vault、Kubernetes Secret 或云 Secret Manager 注入。

## 启动校验

生产环境会拒绝：

- MySQL、Redis、MinIO 使用 `localhost` 或 `127.0.0.1`。
- 缺少 MySQL 密码或 JWT 密钥。
- MinIO 模式下缺少 Access Key 或 Secret Key。
- Redis URL 未使用 `redis://` 或 `rediss://`。

## 运行时安全

Day74 继承 Day73 的 Authentication、Tenant、RBAC、Resource Ownership、Quota、Rate Limit 和 SHA-256 Audit Hash Chain。

## 容器安全

- Next.js 生产容器使用无特权 `nextjs` 用户。
- 使用 standalone 输出减少生产镜像依赖。
- 隐藏 `X-Powered-By` 响应头。
- 容器密钥通过环境变量注入，不写入镜像层。
