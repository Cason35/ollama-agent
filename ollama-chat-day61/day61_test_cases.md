# Day 61 测试用例：Object Storage（对象存储）

## 测试范围

本文档覆盖 `ollama-chat-day61` 的对象存储能力：

- StorageProvider（对象存储接口）
- MinIOStorageProvider（MinIO 对象存储实现）
- LocalObjectStorageProvider（本地对象存储降级实现）
- ObjectStorageClient（对象存储客户端）
- Knowledge Runtime（知识库运行时）源文件上传元数据
- Workspace Export（工作区导出）
- Trace Attachment（追踪附件）
- Storage Explorer（对象存储浏览器）
- Storage Metrics（对象存储指标）

## 自动化测试

### TC-61-01：对象上传、下载、删除链路

执行命令：

```bash
npm run test:day61
```

预期结果：

- 上传模拟 Knowledge PDF（知识库 PDF）对象成功。
- `bucket`、`objectKey`、`size`、`etag`、`contentType`、`type` 元数据正确。
- `download()` 下载内容与上传内容一致。
- `exists()` 上传后为 `true`，删除后为 `false`。
- `getSignedUrl()` 返回可访问对象 URL。

### TC-61-02：Storage Metrics（对象存储指标）

执行命令：

```bash
npm run test:day61
```

预期结果：

- `totalObjects` 能统计对象数量。
- `totalSize` 能统计对象总大小。
- `uploadCount`、`downloadCount`、`deleteCount` 随操作变化。
- `avgUploadTime` 为非负数。

### TC-61-03：Workspace Export（工作区导出）

执行命令：

```bash
npm run test:day61
```

预期结果：

- 测试脚本构造 Workspace（工作区）快照。
- Runtime 将 Workspace 渲染为 Markdown。
- Markdown 文件上传到 Object Storage（对象存储）。
- 返回 `workspaceId`、`markdownObject` 和 `signedUrl`。

### TC-61-04：Trace Attachment（追踪附件）

执行命令：

```bash
npm run test:day61
```

预期结果：

- 测试脚本构造 Trace（追踪记录）。
- Runtime 将 Prompt Snapshot（提示词快照）序列化为 JSON 附件。
- 附件上传到 Object Storage（对象存储）。
- 数据结构只保存对象引用，不把大内容直接塞进 Trace。

## 手工测试

### TC-61-05：Storage Explorer 页面

执行命令：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

预期结果：

- 浏览器标签页显示 `Day 61 - Object Storage | 对象存储`。
- 页面标题显示 `Object Storage 对象存储`。
- 右侧控制台默认打开 `存储` 标签页。
- Storage Explorer 显示 Provider、Bucket、对象数量、总大小、上传次数和平均上传耗时。

### TC-61-06：Storage Explorer 操作

操作步骤：

1. 点击 `上传`。
2. 点击 `导出`。
3. 点击 `附件`。
4. 查看对象列表。
5. 点击 `Preview`。
6. 点击 `Copy URL`。
7. 点击 `Delete`。

预期结果：

- `上传` 会生成通用对象。
- `导出` 会生成 `workspace-export` 类型对象。
- `附件` 会生成 `trace-attachment` 类型对象。
- 对象列表展示 Bucket、Object Key、Size、Last Modified、Type 和 ETag。
- `Preview` 可以打开对象内容。
- `Copy URL` 可以复制对象访问链接。
- `Delete` 删除对象后列表刷新。

### TC-61-07：MinIO 模式

启动 MinIO：

```bash
docker run -d --name minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin quay.io/minio/minio server /data --console-address ":9001"
```

`.env.local` 配置：

```text
OBJECT_STORAGE_PROVIDER=minio
OBJECT_STORAGE_BUCKET=agent-platform
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

预期结果：

- Storage Explorer 的 provider 显示 `minio`。
- 对象会写入 MinIO 的 `agent-platform` Bucket。
- `Preview` 使用 MinIO 签名 URL 打开对象。

## 验收清单

- 是否实现 StorageProvider（对象存储接口）：是
- 是否实现 MinIOStorageProvider（MinIO 对象存储实现）：是
- 是否实现 ObjectStorageClient（对象存储客户端）：是
- Knowledge Runtime 是否保存 Object Storage 元数据：是
- Workspace Export 是否接入 Object Storage：是
- Trace Attachment 是否接入 Object Storage：是
- 是否实现 Storage Explorer：是
- 是否增加 Storage Metrics：是
- 是否提供 `npm run test:day61`：是
