/** 第61天：实现 MinIOStorageProvider（MinIO 对象存储提供者），兼容 S3 协议的真实对象存储访问。 */
import crypto from "crypto"; // 第61天：引入 crypto，用于在 ETag 缺失时生成内容摘要。
import { Readable } from "stream"; // 第61天：引入 Readable 类型，用于读取 MinIO 下载流。
import { Client } from "minio"; // 第61天：引入 MinIO SDK 客户端。
import { configManager } from "@/lib/config/config-runtime"; // 第62天：引入配置中心，统一读取 MinIO 连接配置。
import { secretsManager } from "@/lib/secrets/secrets-runtime"; // 第63天：引入密钥管理器，统一读取 MinIO 敏感凭证。
import type { StorageDownloadResult, StorageMetrics, StorageObjectMetadata, StorageObjectSummary, StorageProvider, StorageProviderKind, StorageUploadInput } from "@/lib/storage/storage-types"; // 第61天：引入统一对象存储类型。

const DEFAULT_CONTENT_TYPE = "application/octet-stream"; // 第61天：定义默认 MIME 类型。

const metricsState = { uploadCount: 0, downloadCount: 0, deleteCount: 0, uploadDurationSum: 0 }; // 第61天：保存 MinIO Provider 进程内累计指标。

type MinioListItem = { // 第61天：定义 MinIO 列表流返回对象的最小字段集合。
  name?: string; // 第61天：保存对象键。
  size?: number; // 第61天：保存对象大小。
  etag?: string; // 第61天：保存对象 ETag。
  lastModified?: Date; // 第61天：保存最后修改时间。
  prefix?: string; // 第61天：保存目录前缀，递归列表下通常不用。
}; // 第61天：结束 MinioListItem 类型定义。

export class MinIOStorageProvider implements StorageProvider { // 第61天：定义 MinIO 对象存储 Provider 类。
  readonly kind: StorageProviderKind = "minio"; // 第61天：声明当前 Provider 类型为 minio。

  readonly defaultBucket: string; // 第61天：保存默认 Bucket（存储桶）。

  private readonly client: Client; // 第61天：保存 MinIO SDK 客户端实例。

  constructor(options: { endPoint?: string; port?: number; useSSL?: boolean; accessKey?: string; secretKey?: string; bucket?: string } = {}) { // 第61天：允许通过环境变量或测试参数创建 Provider。
    this.defaultBucket = options.bucket ?? configManager.getString("storage.bucket", "agent-platform"); // 第62天：从配置中心读取默认 Bucket。
    this.client = new Client({ endPoint: options.endPoint ?? configManager.getString("storage.minioEndpoint", "127.0.0.1"), port: options.port ?? configManager.getNumber("storage.minioPort", 9000), useSSL: options.useSSL ?? configManager.getBoolean("storage.minioUseSsl", false), accessKey: options.accessKey ?? secretsManager.getSync("MINIO_ACCESS_KEY") ?? "", secretKey: options.secretKey ?? secretsManager.getSync("MINIO_SECRET_KEY") ?? "" }); // 第63天：非敏感连接参数来自配置中心，敏感 MinIO 凭证来自 SecretsManager。
  } // 第61天：结束构造函数。

  async upload(input: StorageUploadInput): Promise<StorageObjectMetadata> { // 第61天：实现上传对象方法。
    const startedAt = Date.now(); // 第61天：记录上传开始时间。
    const bucket = input.bucket ?? this.defaultBucket; // 第61天：选择请求 Bucket 或默认 Bucket。
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body); // 第61天：把上传正文统一转换为 Buffer。
    await this.ensureBucket(bucket); // 第61天：确保 Bucket 已存在。
    const contentType = input.contentType ?? DEFAULT_CONTENT_TYPE; // 第61天：读取或补齐 MIME 类型。
    const uploadInfo = await this.client.putObject(bucket, input.objectKey, body, body.length, { "Content-Type": contentType, "x-amz-meta-object-type": input.type ?? "generic", ...(input.metadata ?? {}) }); // 第61天：调用 MinIO putObject 上传内容。
    metricsState.uploadCount += 1; // 第61天：累计上传次数。
    metricsState.uploadDurationSum += Math.max(1, Date.now() - startedAt); // 第61天：累计上传耗时。
    return { bucket, objectKey: input.objectKey, size: body.length, etag: uploadInfo.etag || this.hashBody(body), contentType, type: input.type ?? "generic", lastModified: Date.now() }; // 第61天：返回对象元数据。
  } // 第61天：结束 upload 方法。

  async download(bucket: string, objectKey: string): Promise<StorageDownloadResult> { // 第61天：实现下载对象方法。
    const stream = await this.client.getObject(bucket, objectKey); // 第61天：从 MinIO 获取对象读取流。
    const body = await this.streamToBuffer(stream); // 第61天：把读取流收集为 Buffer。
    const stat = await this.client.statObject(bucket, objectKey); // 第61天：读取对象状态元数据。
    metricsState.downloadCount += 1; // 第61天：累计下载次数。
    return { body, metadata: { bucket, objectKey, size: stat.size, etag: stat.etag || this.hashBody(body), contentType: this.pickContentType(stat.metaData), type: this.pickObjectType(stat.metaData), lastModified: stat.lastModified?.getTime?.() ?? Date.now() } }; // 第61天：返回下载结果与元数据。
  } // 第61天：结束 download 方法。

  async delete(bucket: string, objectKey: string): Promise<boolean> { // 第61天：实现删除对象方法。
    await this.client.removeObject(bucket, objectKey); // 第61天：调用 MinIO 删除对象。
    metricsState.deleteCount += 1; // 第61天：累计删除次数。
    return true; // 第61天：返回删除成功。
  } // 第61天：结束 delete 方法。

  async exists(bucket: string, objectKey: string): Promise<boolean> { // 第61天：实现对象存在性检查。
    try { // 第61天：捕获对象不存在异常。
      await this.client.statObject(bucket, objectKey); // 第61天：读取对象状态。
      return true; // 第61天：状态可读表示对象存在。
    } catch { // 第61天：处理对象不存在或连接失败。
      return false; // 第61天：返回不存在。
    } // 第61天：结束异常处理。
  } // 第61天：结束 exists 方法。

  async getSignedUrl(bucket: string, objectKey: string, expiresSeconds = 60 * 15): Promise<string> { // 第61天：实现签名下载链接生成。
    return this.client.presignedGetObject(bucket, objectKey, expiresSeconds); // 第61天：返回 MinIO/S3 兼容签名 URL。
  } // 第61天：结束 getSignedUrl 方法。

  async list(bucket = this.defaultBucket, prefix = ""): Promise<StorageObjectSummary[]> { // 第61天：实现对象列表查询。
    await this.ensureBucket(bucket); // 第61天：确保 Bucket 存在，避免空环境列表报错。
    const stream = this.client.listObjectsV2(bucket, prefix, true); // 第61天：递归列出指定前缀下的对象。
    const items = await this.collectListStream(stream); // 第61天：收集 MinIO 列表流结果。
    const summaries = await Promise.all(items.filter((item) => item.name).map(async (item) => this.itemToSummary(bucket, item))); // 第61天：把 MinIO 对象转换为 Explorer 摘要。
    return summaries.sort((a, b) => b.lastModified - a.lastModified); // 第61天：按最后修改时间倒序返回。
  } // 第61天：结束 list 方法。

  async metrics(): Promise<StorageMetrics> { // 第61天：实现对象存储指标读取。
    const objects = await this.list(this.defaultBucket); // 第61天：读取默认 Bucket 对象列表。
    const totalSize = objects.reduce((sum, item) => sum + item.size, 0); // 第61天：累计对象总大小。
    return { totalObjects: objects.length, totalSize, uploadCount: metricsState.uploadCount, downloadCount: metricsState.downloadCount, deleteCount: metricsState.deleteCount, avgUploadTime: metricsState.uploadCount > 0 ? Math.round(metricsState.uploadDurationSum / metricsState.uploadCount) : 0 }; // 第61天：返回指标快照。
  } // 第61天：结束 metrics 方法。

  private async ensureBucket(bucket: string): Promise<void> { // 第61天：确保 Bucket 存在。
    const exists = await this.client.bucketExists(bucket).catch(() => false); // 第61天：查询 Bucket 是否存在，连接错误时视为不存在并交给 makeBucket 抛错。
    if (!exists) await this.client.makeBucket(bucket); // 第61天：不存在则创建 Bucket。
  } // 第61天：结束 ensureBucket 方法。

  private async itemToSummary(bucket: string, item: MinioListItem): Promise<StorageObjectSummary> { // 第61天：把 MinIO 列表对象转换为统一摘要。
    const objectKey = item.name ?? ""; // 第61天：读取对象键。
    const signedUrl = objectKey ? await this.getSignedUrl(bucket, objectKey).catch(() => "") : ""; // 第61天：尽力生成签名 URL。
    return { bucket, objectKey, size: item.size ?? 0, etag: item.etag ?? "", contentType: DEFAULT_CONTENT_TYPE, type: "generic", lastModified: item.lastModified?.getTime?.() ?? Date.now(), signedUrl }; // 第61天：返回对象摘要。
  } // 第61天：结束 itemToSummary 方法。

  private collectListStream(stream: Readable): Promise<MinioListItem[]> { // 第61天：收集 MinIO 列表流。
    return new Promise((resolve, reject) => { // 第61天：把事件流包装为 Promise。
      const items: MinioListItem[] = []; // 第61天：保存列表项。
      stream.on("data", (item: MinioListItem) => items.push(item)); // 第61天：收到对象时追加到数组。
      stream.on("end", () => resolve(items)); // 第61天：流结束时返回数组。
      stream.on("error", reject); // 第61天：流错误时抛出异常。
    }); // 第61天：结束 Promise 包装。
  } // 第61天：结束 collectListStream 方法。

  private streamToBuffer(stream: Readable): Promise<Buffer> { // 第61天：把 MinIO 下载流转换为 Buffer。
    return new Promise((resolve, reject) => { // 第61天：把流事件包装为 Promise。
      const chunks: Buffer[] = []; // 第61天：保存分块内容。
      stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))); // 第61天：收集每个数据块。
      stream.on("end", () => resolve(Buffer.concat(chunks))); // 第61天：流结束时合并 Buffer。
      stream.on("error", reject); // 第61天：流错误时抛出异常。
    }); // 第61天：结束 Promise 包装。
  } // 第61天：结束 streamToBuffer 方法。

  private pickContentType(metaData: Record<string, string | string[] | undefined> | undefined): string { // 第61天：从 MinIO 元数据中读取 MIME 类型。
    const raw = metaData?.["content-type"] ?? metaData?.["Content-Type"]; // 第61天：兼容大小写键。
    return Array.isArray(raw) ? raw[0] ?? DEFAULT_CONTENT_TYPE : raw ?? DEFAULT_CONTENT_TYPE; // 第61天：返回单个 MIME 类型。
  } // 第61天：结束 pickContentType 方法。

  private pickObjectType(metaData: Record<string, string | string[] | undefined> | undefined): StorageObjectSummary["type"] { // 第61天：从 MinIO 元数据中读取业务对象类型。
    const raw = metaData?.["x-amz-meta-object-type"] ?? metaData?.["object-type"]; // 第61天：兼容 MinIO 自定义元数据键。
    const value = Array.isArray(raw) ? raw[0] : raw; // 第61天：规整为单个字符串。
    return value === "knowledge" || value === "workspace-export" || value === "trace-attachment" || value === "evaluation-report" || value === "prompt-snapshot" ? value : "generic"; // 第61天：返回合法类型或兜底 generic。
  } // 第61天：结束 pickObjectType 方法。

  private hashBody(body: Buffer): string { // 第61天：生成正文 SHA256 摘要。
    return crypto.createHash("sha256").update(body).digest("hex"); // 第61天：返回十六进制摘要。
  } // 第61天：结束 hashBody 方法。
} // 第61天：结束 MinIOStorageProvider 类定义。
