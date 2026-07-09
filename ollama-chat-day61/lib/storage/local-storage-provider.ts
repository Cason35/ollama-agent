/** 第61天：实现 LocalObjectStorageProvider（本地对象存储提供者），用于没有 MinIO 时的开发与测试降级。 */
import crypto from "crypto"; // 第61天：引入 Node.js crypto，用于生成本地 ETag。
import { promises as fs } from "fs"; // 第61天：引入异步文件系统 API，用于读写本地对象文件。
import path from "path"; // 第61天：引入路径工具，用于构造对象路径。
import type { StorageDownloadResult, StorageMetrics, StorageObjectMetadata, StorageObjectSummary, StorageProvider, StorageProviderKind, StorageUploadInput } from "@/lib/storage/storage-types"; // 第61天：引入对象存储统一类型。

const DEFAULT_CONTENT_TYPE = "application/octet-stream"; // 第61天：定义未指定 MIME 类型时的兜底值。

const metricsState = { uploadCount: 0, downloadCount: 0, deleteCount: 0, uploadDurationSum: 0 }; // 第61天：保存本地 Provider 进程内累计指标。

export class LocalObjectStorageProvider implements StorageProvider { // 第61天：定义本地对象存储 Provider 类。
  readonly kind: StorageProviderKind = "local"; // 第61天：声明当前 Provider 类型为 local。

  constructor(readonly defaultBucket = process.env.OBJECT_STORAGE_BUCKET ?? "agent-platform", private readonly rootDir = path.join(process.cwd(), ".data", "object-storage")) {} // 第61天：初始化默认 Bucket 和本地根目录。

  async upload(input: StorageUploadInput): Promise<StorageObjectMetadata> { // 第61天：实现上传对象方法。
    const startedAt = Date.now(); // 第61天：记录上传开始时间。
    const bucket = input.bucket ?? this.defaultBucket; // 第61天：选择请求 Bucket 或默认 Bucket。
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body); // 第61天：把上传正文统一转换为 Buffer。
    const objectPath = this.resolveObjectPath(bucket, input.objectKey); // 第61天：解析本地对象文件路径。
    await fs.mkdir(path.dirname(objectPath), { recursive: true }); // 第61天：确保对象所在目录存在。
    await fs.writeFile(objectPath, body); // 第61天：把对象内容写入本地文件。
    const now = Date.now(); // 第61天：记录写入完成时间。
    const metadata = this.buildMetadata(bucket, input.objectKey, body, input.contentType, input.type, now); // 第61天：生成对象元数据。
    await fs.writeFile(this.metadataPath(objectPath), JSON.stringify(metadata, null, 2), "utf8"); // 第61天：把对象元数据写入旁路 JSON 文件。
    metricsState.uploadCount += 1; // 第61天：累计上传次数。
    metricsState.uploadDurationSum += Math.max(1, Date.now() - startedAt); // 第61天：累计上传耗时。
    return metadata; // 第61天：返回上传后的对象元数据。
  } // 第61天：结束 upload 方法。

  async download(bucket: string, objectKey: string): Promise<StorageDownloadResult> { // 第61天：实现下载对象方法。
    const objectPath = this.resolveObjectPath(bucket, objectKey); // 第61天：解析本地对象文件路径。
    const body = await fs.readFile(objectPath); // 第61天：读取对象内容。
    const metadata = await this.readMetadata(bucket, objectKey, body); // 第61天：读取或补齐对象元数据。
    metricsState.downloadCount += 1; // 第61天：累计下载次数。
    return { body, metadata }; // 第61天：返回下载内容与元数据。
  } // 第61天：结束 download 方法。

  async delete(bucket: string, objectKey: string): Promise<boolean> { // 第61天：实现删除对象方法。
    const objectPath = this.resolveObjectPath(bucket, objectKey); // 第61天：解析本地对象文件路径。
    try { // 第61天：捕获对象不存在的情况。
      await fs.rm(objectPath, { force: true }); // 第61天：删除对象文件。
      await fs.rm(this.metadataPath(objectPath), { force: true }); // 第61天：删除对象元数据文件。
      metricsState.deleteCount += 1; // 第61天：累计删除次数。
      return true; // 第61天：返回删除成功。
    } catch { // 第61天：处理删除失败。
      return false; // 第61天：返回删除失败。
    } // 第61天：结束异常处理。
  } // 第61天：结束 delete 方法。

  async exists(bucket: string, objectKey: string): Promise<boolean> { // 第61天：实现对象存在性检查。
    try { // 第61天：捕获文件不存在错误。
      await fs.access(this.resolveObjectPath(bucket, objectKey)); // 第61天：检查对象文件是否可访问。
      return true; // 第61天：文件存在时返回 true。
    } catch { // 第61天：处理文件不存在。
      return false; // 第61天：文件不存在时返回 false。
    } // 第61天：结束异常处理。
  } // 第61天：结束 exists 方法。

  async getSignedUrl(bucket: string, objectKey: string): Promise<string> { // 第61天：实现本地开发环境下的可访问 URL。
    const params = new URLSearchParams({ bucket, objectKey }); // 第61天：构造下载 API 查询参数。
    return `/api/storage/object?${params.toString()}`; // 第61天：返回同源下载 API 地址。
  } // 第61天：结束 getSignedUrl 方法。

  async list(bucket = this.defaultBucket, prefix = ""): Promise<StorageObjectSummary[]> { // 第61天：实现对象列表查询。
    const bucketDir = this.resolveBucketPath(bucket); // 第61天：解析 Bucket 本地目录。
    const files = await this.walkObjectFiles(bucketDir); // 第61天：递归读取 Bucket 下所有对象文件。
    const summaries = await Promise.all(files.map(async (file) => this.fileToSummary(bucket, bucketDir, file))); // 第61天：把文件转换成对象摘要。
    return summaries.filter((item) => item.objectKey.startsWith(prefix)).sort((a, b) => b.lastModified - a.lastModified); // 第61天：按前缀过滤并按更新时间倒序。
  } // 第61天：结束 list 方法。

  async metrics(): Promise<StorageMetrics> { // 第61天：实现对象存储指标读取。
    const objects = await this.list(this.defaultBucket); // 第61天：读取默认 Bucket 对象列表。
    const totalSize = objects.reduce((sum, item) => sum + item.size, 0); // 第61天：累计对象总大小。
    return { totalObjects: objects.length, totalSize, uploadCount: metricsState.uploadCount, downloadCount: metricsState.downloadCount, deleteCount: metricsState.deleteCount, avgUploadTime: metricsState.uploadCount > 0 ? Math.round(metricsState.uploadDurationSum / metricsState.uploadCount) : 0 }; // 第61天：返回指标快照。
  } // 第61天：结束 metrics 方法。

  private buildMetadata(bucket: string, objectKey: string, body: Buffer, contentType = DEFAULT_CONTENT_TYPE, type: StorageUploadInput["type"] = "generic", lastModified = Date.now()): StorageObjectMetadata { // 第61天：构建对象元数据。
    return { bucket, objectKey, size: body.length, etag: crypto.createHash("sha256").update(body).digest("hex"), contentType, type: type ?? "generic", lastModified }; // 第61天：返回可持久化的元数据。
  } // 第61天：结束 buildMetadata 方法。

  private async readMetadata(bucket: string, objectKey: string, body?: Buffer): Promise<StorageObjectMetadata> { // 第61天：读取对象元数据，缺失时用文件内容兜底生成。
    const objectPath = this.resolveObjectPath(bucket, objectKey); // 第61天：解析对象文件路径。
    try { // 第61天：尝试读取旁路元数据文件。
      return JSON.parse(await fs.readFile(this.metadataPath(objectPath), "utf8")) as StorageObjectMetadata; // 第61天：返回解析后的元数据。
    } catch { // 第61天：元数据缺失时进入兜底。
      const payload = body ?? await fs.readFile(objectPath); // 第61天：读取对象内容用于计算元数据。
      const stat = await fs.stat(objectPath); // 第61天：读取文件状态用于 lastModified。
      return this.buildMetadata(bucket, objectKey, payload, DEFAULT_CONTENT_TYPE, "generic", stat.mtimeMs); // 第61天：返回兜底元数据。
    } // 第61天：结束异常处理。
  } // 第61天：结束 readMetadata 方法。

  private async fileToSummary(bucket: string, bucketDir: string, file: string): Promise<StorageObjectSummary> { // 第61天：把本地对象文件转换为 Explorer 摘要。
    const objectKey = path.relative(bucketDir, file).split(path.sep).join("/"); // 第61天：把文件路径转换为对象键。
    const body = await fs.readFile(file); // 第61天：读取文件内容用于补齐元数据。
    const metadata = await this.readMetadata(bucket, objectKey, body); // 第61天：读取对象元数据。
    const signedUrl = await this.getSignedUrl(bucket, objectKey); // 第61天：生成本地下载 URL。
    return { ...metadata, signedUrl }; // 第61天：返回带 URL 的摘要。
  } // 第61天：结束 fileToSummary 方法。

  private async walkObjectFiles(dir: string): Promise<string[]> { // 第61天：递归列出对象文件，跳过元数据文件。
    try { // 第61天：捕获目录不存在。
      const entries = await fs.readdir(dir, { withFileTypes: true }); // 第61天：读取目录项。
      const nested = await Promise.all(entries.map(async (entry) => { // 第61天：遍历每个目录项。
        const fullPath = path.join(dir, entry.name); // 第61天：拼出完整路径。
        if (entry.isDirectory()) return this.walkObjectFiles(fullPath); // 第61天：目录继续递归。
        if (entry.name.endsWith(".meta.json")) return []; // 第61天：跳过元数据旁路文件。
        return [fullPath]; // 第61天：普通文件作为对象返回。
      })); // 第61天：结束目录项遍历。
      return nested.flat(); // 第61天：展平递归结果。
    } catch { // 第61天：目录不存在或不可读时返回空列表。
      return []; // 第61天：返回空对象列表。
    } // 第61天：结束异常处理。
  } // 第61天：结束 walkObjectFiles 方法。

  private resolveBucketPath(bucket: string): string { // 第61天：解析 Bucket 本地路径。
    return path.join(this.rootDir, this.safeSegment(bucket)); // 第61天：用安全 Bucket 名拼出目录。
  } // 第61天：结束 resolveBucketPath 方法。

  private resolveObjectPath(bucket: string, objectKey: string): string { // 第61天：解析对象本地路径并阻止路径穿越。
    const bucketDir = this.resolveBucketPath(bucket); // 第61天：解析 Bucket 根目录。
    const target = path.resolve(bucketDir, objectKey.replaceAll("\\", "/")); // 第61天：把对象键转换为绝对路径。
    if (!target.startsWith(path.resolve(bucketDir))) throw new Error("objectKey 不允许跳出 Bucket 目录"); // 第61天：阻止路径穿越写出 Bucket。
    return target; // 第61天：返回安全对象路径。
  } // 第61天：结束 resolveObjectPath 方法。

  private metadataPath(objectPath: string): string { // 第61天：生成对象元数据旁路文件路径。
    return `${objectPath}.meta.json`; // 第61天：使用 .meta.json 后缀保存元数据。
  } // 第61天：结束 metadataPath 方法。

  private safeSegment(value: string): string { // 第61天：清洗 Bucket 名称。
    return value.replace(/[^a-zA-Z0-9._-]/g, "-"); // 第61天：只保留常见安全字符。
  } // 第61天：结束 safeSegment 方法。
} // 第61天：结束 LocalObjectStorageProvider 类定义。
