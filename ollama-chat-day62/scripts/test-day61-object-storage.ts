/** 第61天：Object Storage（对象存储）测试脚本，覆盖上传、下载、删除、导出、附件和指标。 */
import assert from "node:assert/strict"; // 第61天：引入 Node.js 严格断言工具。
import path from "node:path"; // 第61天：引入路径工具，用于隔离本地测试目录。
import { LocalObjectStorageProvider } from "@/lib/storage/local-storage-provider"; // 第61天：引入本地对象存储 Provider。
import { ObjectStorageClient, objectStorageClient } from "@/lib/storage/object-storage-client"; // 第61天：引入对象存储客户端和全局单例。
import { exportWorkspaceToStorage, getStorageSnapshot, uploadTraceAttachment } from "@/lib/storage/storage-runtime"; // 第61天：引入对象存储业务运行时。
import type { Trace, Workspace } from "@/lib/agents/agent-types"; // 第61天：引入 Trace 与 Workspace 类型。

async function main() { // 第61天：把测试逻辑包进 async main，兼容当前 tsx 的 CommonJS 输出。
  const testBucket = `day61-test-${Date.now()}`; // 第61天：为本次测试生成独立 Bucket 名称。
  const testRoot = path.join(process.cwd(), ".data", "day61-object-storage-test"); // 第61天：为本次测试生成独立本地对象目录。
  const client = new ObjectStorageClient(new LocalObjectStorageProvider(testBucket, testRoot)); // 第61天：创建本地对象存储客户端，避免依赖 Docker/MinIO。
  const pdfBody = Buffer.from("%PDF-1.4\n% Day61 Knowledge PDF upload chain demo\n"); // 第61天：构造一段模拟 PDF 文件内容。
  const uploaded = await client.upload({ objectKey: "knowledge/day61-test.pdf", body: pdfBody, contentType: "application/pdf", type: "knowledge" }); // 第61天：上传知识库 PDF 测试对象。
  assert.equal(uploaded.bucket, testBucket); // 第61天：验证上传对象使用测试 Bucket。
  assert.equal(uploaded.objectKey, "knowledge/day61-test.pdf"); // 第61天：验证对象键保持稳定。
  assert.equal(uploaded.size, pdfBody.length); // 第61天：验证对象大小正确。
  assert.equal(uploaded.type, "knowledge"); // 第61天：验证对象业务类型为 knowledge。
  const existsAfterUpload = await client.exists(uploaded.bucket, uploaded.objectKey); // 第61天：检查上传后对象是否存在。
  assert.equal(existsAfterUpload, true); // 第61天：验证上传后对象可见。
  const downloaded = await client.download(uploaded.bucket, uploaded.objectKey); // 第61天：下载刚上传的对象。
  assert.equal(downloaded.body.toString("utf8"), pdfBody.toString("utf8")); // 第61天：验证下载内容与上传内容一致。
  assert.equal(downloaded.metadata.etag, uploaded.etag); // 第61天：验证元数据 ETag 可回读。
  const signedUrl = await client.getSignedUrl(uploaded.bucket, uploaded.objectKey); // 第61天：生成可访问 URL。
  assert.ok(signedUrl.includes("/api/storage/object")); // 第61天：验证本地 Provider 返回统一下载 API。
  const listed = await client.list(testBucket, "knowledge/"); // 第61天：按前缀列出对象。
  assert.equal(listed.length, 1); // 第61天：验证列表能看到上传对象。
  assert.equal(listed[0]?.contentType, "application/pdf"); // 第61天：验证列表保留内容类型。
  const metricsAfterUpload = await client.snapshot(); // 第61天：读取对象存储快照。
  assert.equal(metricsAfterUpload.metrics.totalObjects, 1); // 第61天：验证对象总数指标。
  assert.equal(metricsAfterUpload.metrics.uploadCount, 1); // 第61天：验证上传次数指标。
  assert.equal(metricsAfterUpload.metrics.downloadCount, 1); // 第61天：验证下载次数指标。
  const deleted = await client.delete(uploaded.bucket, uploaded.objectKey); // 第61天：删除测试对象。
  assert.equal(deleted, true); // 第61天：验证删除动作成功。
  assert.equal(await client.exists(uploaded.bucket, uploaded.objectKey), false); // 第61天：验证删除后对象不存在。
  const now = Date.now(); // 第61天：记录测试时间戳。
  const workspace: Workspace = { id: `workspace-day61-test-${now}`, goal: "测试 Workspace Export 上传对象存储", createdAt: now, updatedAt: now, entries: [{ id: `entry-${now}`, type: "final", agentId: "writer", content: "Day61 workspace export markdown body", tags: ["day61", "storage"], createdAt: now }] }; // 第61天：构造测试工作区快照。
  const workspaceExport = await exportWorkspaceToStorage(workspace); // 第61天：执行工作区 Markdown 导出并上传对象存储。
  assert.equal(workspaceExport.workspaceId, workspace.id); // 第61天：验证工作区 ID 保持一致。
  assert.equal(workspaceExport.markdownObject.type, "workspace-export"); // 第61天：验证对象类型为 workspace-export。
  assert.equal(await objectStorageClient.exists(workspaceExport.markdownObject.bucket, workspaceExport.markdownObject.objectKey), true); // 第61天：验证导出文件已写入全局对象存储。
  const trace: Trace = { traceId: `trace-day61-test-${now}`, rootOperation: "测试 Trace Attachment", startedAt: now, endedAt: now + 1, spans: [{ spanId: `span-${now}`, name: "prompt-snapshot", type: "tool", startedAt: now, endedAt: now + 1, status: "success" }] }; // 第61天：构造测试 Trace 快照。
  const attachment = await uploadTraceAttachment(trace, "prompt-snapshot", { prompt: "hello day61", output: "stored" }); // 第61天：上传 Trace Prompt Snapshot 附件。
  assert.equal(attachment.traceId, trace.traceId); // 第61天：验证 Trace ID 保持一致。
  assert.equal(attachment.attachment.type, "trace-attachment"); // 第61天：验证附件对象类型为 trace-attachment。
  assert.equal(await objectStorageClient.exists(attachment.attachment.bucket, attachment.attachment.objectKey), true); // 第61天：验证附件已写入全局对象存储。
  const globalSnapshot = await getStorageSnapshot(); // 第61天：读取全局对象存储快照。
  assert.ok(globalSnapshot.metrics.totalObjects >= 2); // 第61天：验证全局快照至少包含工作区导出和 Trace 附件。
  assert.ok(globalSnapshot.metrics.totalSize > 0); // 第61天：验证对象总大小大于零。
  await objectStorageClient.delete(workspaceExport.markdownObject.bucket, workspaceExport.markdownObject.objectKey); // 第61天：清理工作区导出测试对象。
  await objectStorageClient.delete(attachment.attachment.bucket, attachment.attachment.objectKey); // 第61天：清理 Trace 附件测试对象。
  console.log("Day61 Object Storage tests passed."); // 第61天：输出测试通过信息。
} // 第61天：结束 main 函数。

main().catch((err) => { // 第61天：捕获测试主函数异常。
  console.error(err); // 第61天：输出失败原因。
  process.exit(1); // 第61天：以失败码退出进程。
}); // 第61天：结束 main 异常处理。
