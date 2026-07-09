/** 第61天：定义 ObjectStorageClient（对象存储客户端），统一封装底层 Provider 访问。 */
import { LocalObjectStorageProvider } from "@/lib/storage/local-storage-provider"; // 第61天：引入本地开发与测试用对象存储 Provider。
import { MinIOStorageProvider } from "@/lib/storage/minio-storage-provider"; // 第61天：引入真实 MinIO 对象存储 Provider。
import type { StorageDownloadResult, StorageObjectMetadata, StorageObjectSummary, StorageObjectType, StorageProvider, StorageProviderKind, StorageSnapshot, StorageUploadBody, StorageUploadInput } from "@/lib/storage/storage-types"; // 第61天：引入对象存储统一类型。

export class ObjectStorageClient { // 第61天：定义对象存储客户端类。
  constructor(private readonly provider: StorageProvider) {} // 第61天：通过依赖注入接收具体 Provider。

  get kind(): StorageProviderKind { // 第61天：暴露当前 Provider 类型。
    return this.provider.kind; // 第61天：返回底层 Provider 类型。
  } // 第61天：结束 kind getter。

  get defaultBucket(): string { // 第61天：暴露默认 Bucket。
    return this.provider.defaultBucket; // 第61天：返回底层 Provider 默认 Bucket。
  } // 第61天：结束 defaultBucket getter。

  async upload(input: StorageUploadInput): Promise<StorageObjectMetadata> { // 第61天：上传对象。
    return this.provider.upload(input); // 第61天：委托给底层 Provider。
  } // 第61天：结束 upload 方法。

  async uploadText(type: StorageObjectType, filename: string, content: string, contentType = "text/plain; charset=utf-8"): Promise<StorageObjectMetadata> { // 第61天：上传文本对象的便捷方法。
    return this.upload({ objectKey: this.createObjectKey(type, filename), body: content, contentType, type }); // 第61天：生成对象键后上传文本。
  } // 第61天：结束 uploadText 方法。

  async uploadJson(type: StorageObjectType, filename: string, value: unknown): Promise<StorageObjectMetadata> { // 第61天：上传 JSON 对象的便捷方法。
    return this.uploadText(type, filename, JSON.stringify(value, null, 2), "application/json; charset=utf-8"); // 第61天：序列化 JSON 并上传。
  } // 第61天：结束 uploadJson 方法。

  async uploadBinary(type: StorageObjectType, filename: string, body: StorageUploadBody, contentType = "application/octet-stream"): Promise<StorageObjectMetadata> { // 第61天：上传二进制对象的便捷方法。
    return this.upload({ objectKey: this.createObjectKey(type, filename), body, contentType, type }); // 第61天：生成对象键后上传二进制内容。
  } // 第61天：结束 uploadBinary 方法。

  async download(bucket: string, objectKey: string): Promise<StorageDownloadResult> { // 第61天：下载对象。
    return this.provider.download(bucket, objectKey); // 第61天：委托给底层 Provider。
  } // 第61天：结束 download 方法。

  async downloadText(bucket: string, objectKey: string): Promise<string> { // 第61天：下载对象并按 UTF-8 文本返回。
    const result = await this.download(bucket, objectKey); // 第61天：读取对象原始字节。
    return result.body.toString("utf8"); // 第61天：转换为 UTF-8 文本。
  } // 第61天：结束 downloadText 方法。

  async delete(bucket: string, objectKey: string): Promise<boolean> { // 第61天：删除对象。
    return this.provider.delete(bucket, objectKey); // 第61天：委托给底层 Provider。
  } // 第61天：结束 delete 方法。

  async exists(bucket: string, objectKey: string): Promise<boolean> { // 第61天：检查对象是否存在。
    return this.provider.exists(bucket, objectKey); // 第61天：委托给底层 Provider。
  } // 第61天：结束 exists 方法。

  async getSignedUrl(bucket: string, objectKey: string, expiresSeconds?: number): Promise<string> { // 第61天：生成可访问 URL 或签名 URL。
    return this.provider.getSignedUrl(bucket, objectKey, expiresSeconds); // 第61天：委托给底层 Provider。
  } // 第61天：结束 getSignedUrl 方法。

  async list(bucket = this.defaultBucket, prefix = ""): Promise<StorageObjectSummary[]> { // 第61天：列出对象摘要。
    return this.provider.list(bucket, prefix); // 第61天：委托给底层 Provider。
  } // 第61天：结束 list 方法。

  async snapshot(): Promise<StorageSnapshot> { // 第61天：读取 Storage Explorer 使用的完整快照。
    const objects = await this.list(this.defaultBucket); // 第61天：读取默认 Bucket 下的对象。
    const metrics = await this.provider.metrics(); // 第61天：读取对象存储指标。
    return { provider: this.kind, bucket: this.defaultBucket, objects, metrics }; // 第61天：返回统一快照。
  } // 第61天：结束 snapshot 方法。

  createObjectKey(type: StorageObjectType, filename: string): string { // 第61天：生成平台统一对象键。
    const day = new Date().toISOString().slice(0, 10); // 第61天：按日期分区，方便 Storage Explorer 浏览。
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-"); // 第61天：清理文件名中的不安全字符。
    return `${type}/${day}/${Date.now()}-${safeName || "object.bin"}`; // 第61天：返回包含类型、日期和时间戳的对象键。
  } // 第61天：结束 createObjectKey 方法。
} // 第61天：结束 ObjectStorageClient 类定义。

export function createObjectStorageClient(providerKind: StorageProviderKind = (process.env.OBJECT_STORAGE_PROVIDER as StorageProviderKind | undefined) ?? "local"): ObjectStorageClient { // 第61天：按环境变量创建对象存储客户端。
  const provider = providerKind === "minio" ? new MinIOStorageProvider() : new LocalObjectStorageProvider(); // 第61天：选择 MinIO 或本地降级 Provider。
  return new ObjectStorageClient(provider); // 第61天：返回统一客户端。
} // 第61天：结束 createObjectStorageClient 工厂函数。

export const objectStorageClient = createObjectStorageClient(); // 第61天：导出全局对象存储客户端单例。
