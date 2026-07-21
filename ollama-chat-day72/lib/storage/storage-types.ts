/** 第61天：定义 Object Storage（对象存储）统一类型，业务层只依赖这些抽象。 */

export type StorageProviderKind = "local" | "minio" | "s3" | "oss"; // 第61天：声明可切换的对象存储提供方类型。

export type StorageObjectType = "knowledge" | "workspace-export" | "trace-attachment" | "evaluation-report" | "prompt-snapshot" | "generic"; // 第61天：声明平台内常见大文件对象类型。

export type StorageUploadBody = string | Buffer | Uint8Array; // 第61天：声明上传正文可以是文本、Buffer 或 Uint8Array。

export type StorageObjectMetadata = { // 第61天：定义数据库或运行时保存的对象元数据结构。
  bucket: string; // 第61天：保存 Bucket（存储桶）名称。
  objectKey: string; // 第61天：保存 Object Key（对象键 / 文件路径）。
  size: number; // 第61天：保存对象大小，单位字节。
  etag: string; // 第61天：保存对象内容标识，MinIO/S3 下通常来自 ETag。
  contentType: string; // 第61天：保存对象 MIME 类型。
  type: StorageObjectType; // 第61天：保存业务对象类型。
  lastModified: number; // 第61天：保存最后修改时间戳。
}; // 第61天：结束 StorageObjectMetadata 类型定义。

export type StorageObjectSummary = StorageObjectMetadata & { // 第61天：定义 Storage Explorer（对象存储浏览器）展示用摘要。
  signedUrl?: string; // 第61天：保存可选签名下载链接。
}; // 第61天：结束 StorageObjectSummary 类型定义。

export type StorageUploadInput = { // 第61天：定义上传对象的输入结构。
  bucket?: string; // 第61天：允许调用方覆盖默认 Bucket（存储桶）。
  objectKey: string; // 第61天：要求调用方传入稳定对象键。
  body: StorageUploadBody; // 第61天：保存待上传文件内容。
  contentType?: string; // 第61天：保存可选 MIME 类型。
  type?: StorageObjectType; // 第61天：保存可选业务对象类型。
  metadata?: Record<string, string>; // 第61天：保存可选对象自定义元数据。
}; // 第61天：结束 StorageUploadInput 类型定义。

export type StorageDownloadResult = { // 第61天：定义下载对象的返回结构。
  body: Buffer; // 第61天：保存下载到的原始字节内容。
  metadata: StorageObjectMetadata; // 第61天：保存对象元数据。
}; // 第61天：结束 StorageDownloadResult 类型定义。

export type StorageMetrics = { // 第61天：定义 Object Storage（对象存储）运行指标。
  totalObjects: number; // 第61天：保存当前对象总数。
  totalSize: number; // 第61天：保存当前对象总大小。
  uploadCount: number; // 第61天：保存上传次数。
  downloadCount: number; // 第61天：保存下载次数。
  deleteCount: number; // 第61天：保存删除次数。
  avgUploadTime: number; // 第61天：保存平均上传耗时，单位毫秒。
}; // 第61天：结束 StorageMetrics 类型定义。

export type StorageSnapshot = { // 第61天：定义前端 Storage Explorer 使用的快照结构。
  provider: StorageProviderKind; // 第61天：保存当前对象存储提供方。
  bucket: string; // 第61天：保存默认 Bucket（存储桶）。
  objects: StorageObjectSummary[]; // 第61天：保存对象列表。
  metrics: StorageMetrics; // 第61天：保存对象存储指标。
}; // 第61天：结束 StorageSnapshot 类型定义。

export interface StorageProvider { // 第61天：定义统一 StorageProvider（对象存储接口）。
  readonly kind: StorageProviderKind; // 第61天：暴露当前 Provider 类型。
  readonly defaultBucket: string; // 第61天：暴露默认 Bucket（存储桶）。
  upload(input: StorageUploadInput): Promise<StorageObjectMetadata>; // 第61天：上传文件并返回元数据。
  download(bucket: string, objectKey: string): Promise<StorageDownloadResult>; // 第61天：下载文件内容与元数据。
  delete(bucket: string, objectKey: string): Promise<boolean>; // 第61天：删除文件并返回是否执行成功。
  exists(bucket: string, objectKey: string): Promise<boolean>; // 第61天：检查对象是否存在。
  getSignedUrl(bucket: string, objectKey: string, expiresSeconds?: number): Promise<string>; // 第61天：生成可访问 URL 或签名 URL。
  list(bucket?: string, prefix?: string): Promise<StorageObjectSummary[]>; // 第61天：列出对象摘要。
  metrics(): Promise<StorageMetrics>; // 第61天：读取对象存储运行指标。
} // 第61天：结束 StorageProvider 接口定义。
