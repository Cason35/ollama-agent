# Day74 部署与启动指南

下面把“不需要额外软件的代码验证”和“需要 Docker 的完整环境验证”分开。

## 第一阶段：只验证代码

在 PowerShell 中进入项目：

```powershell
cd D:\mine\ollama\ollama-agent\ollama-chat-day74
npm install
npm run typecheck
npm run test:day74
npm run lint
npm run build
```

这一阶段不需要启动 MySQL、Redis、MinIO 或 Docker。

## 第二阶段：安装并检查软件

需要：

1. Docker Desktop，启用 WSL2 后端。
2. Node.js 22 与 npm。
3. 本机 Ollama；只有最终 AI 对话演示才必须启动。

检查命令：

```powershell
docker --version
docker compose version
node --version
npm --version
ollama --version
```

MySQL、Redis 和 MinIO 不需要单独安装 Windows 版本，它们由 Docker Compose 启动。

## 第三阶段：准备环境变量

```powershell
Copy-Item .env.example .env
notepad .env
```

至少修改：

- `MYSQL_PASSWORD`
- `MINIO_SECRET_KEY`
- `JWT_SECRET`

这些值不要提交到 Git。

## 第四阶段：启动基础设施

```powershell
docker compose up -d mysql redis minio
docker compose ps
```

预期三个服务都变为 `healthy`。MinIO 控制台地址为 `http://localhost:9001`。

## 第五阶段：执行数据库迁移

`docker compose up -d --build app` 会先运行一次性 `migrate` 服务，迁移成功后才启动应用。也可以从宿主机单独练习迁移，此时把 `.env` 中的服务地址临时改为宿主机地址：

```text
MYSQL_HOST=127.0.0.1
REDIS_URL=redis://127.0.0.1:6379
MINIO_ENDPOINT=127.0.0.1
APP_ENV=development
```

项目已经把教学环境 MySQL 映射到宿主机 `3306` 端口，然后执行：

```powershell
npm run migration:status
npm run migration:up
npm run migration:status
```

回滚最近一个版本：

```powershell
npm run migration:rollback
```

然后重新执行 `npm run migration:up` 回到最新版本。

## 第六阶段：启动完整应用

恢复 `.env` 中的容器服务名：

```text
APP_ENV=production
MYSQL_HOST=mysql
REDIS_URL=redis://redis:6379
MINIO_ENDPOINT=minio
```

执行：

```powershell
docker compose up -d --build app
docker compose ps
docker compose logs -f app
```

访问：

- `http://localhost:3000`
- `http://localhost:3000/production`
- `http://localhost:3000/api/live`
- `http://localhost:3000/api/ready`
- `http://localhost:3000/api/health`

## 第七阶段：连接宿主机 Ollama

应用容器使用：

```text
OLLAMA_API_URL=http://host.docker.internal:11434/api/chat
```

启动 Ollama 并确认模型存在：

```powershell
ollama serve
ollama list
```

## 第八阶段：备份恢复

```powershell
npm run backup
Get-ChildItem backups
npm run restore -- backups\<时间目录>
```

恢复会停止并重新启动 Redis、MinIO，请只对明确选择的教学环境执行。

## 第九阶段：压力和故障测试

```powershell
$env:LOAD_TEST_CONCURRENCY='100'
npm run load:test
npm run failure:test
```

故障测试会主动停止 Redis，确认 `/api/health` 返回 `503`，随后重新启动 Redis 并等待恢复健康。

## 第十阶段：停止环境

```powershell
docker compose down
```

不要使用 `docker compose down -v`，除非你明确希望删除 MySQL、Redis 和 MinIO 的持久化数据。
