/** 第61天：定义 Storage Runtime（对象存储运行时），把知识库、工作区导出和 Trace 附件统一接入对象存储。 */
import { objectStorageClient } from "@/lib/storage/object-storage-client"; // 第61天：引入全局对象存储客户端。
import type { StorageObjectMetadata, StorageSnapshot } from "@/lib/storage/storage-types"; // 第61天：引入对象元数据与快照类型。
import type { Trace } from "@/lib/agents/agent-types"; // 第61天：引入 Trace 类型，用于上传追踪附件。
import type { Workspace, WorkspaceEntry } from "@/lib/agents/agent-types"; // 第61天：引入 Workspace 类型，用于导出工作区。

export type WorkspaceExportResult = { // 第61天：定义工作区导出结果。
  workspaceId: string; // 第61天：保存工作区 ID。
  markdownObject: StorageObjectMetadata; // 第61天：保存 Markdown 导出对象元数据。
  signedUrl: string; // 第61天：保存可下载签名链接。
}; // 第61天：结束 WorkspaceExportResult 类型定义。

export type TraceAttachmentResult = { // 第61天：定义 Trace 附件上传结果。
  traceId: string; // 第61天：保存 Trace ID。
  attachment: StorageObjectMetadata; // 第61天：保存附件对象元数据。
  signedUrl: string; // 第61天：保存附件可访问链接。
}; // 第61天：结束 TraceAttachmentResult 类型定义。

export async function uploadKnowledgeSource(title: string, content: string): Promise<StorageObjectMetadata> { // 第61天：上传知识库原始文档到对象存储。
  const filename = `${title.trim() || "untitled-knowledge"}.md`; // 第61天：根据标题生成源文档文件名。
  return objectStorageClient.uploadText("knowledge", filename, content, "text/markdown; charset=utf-8"); // 第61天：以 Markdown 文本上传知识库源文件。
} // 第61天：结束 uploadKnowledgeSource 函数。

export async function exportWorkspaceToStorage(workspace: Workspace): Promise<WorkspaceExportResult> { // 第61天：把工作区导出为 Markdown 并上传对象存储。
  const markdown = renderWorkspaceMarkdown(workspace.goal, workspace.entries); // 第61天：渲染工作区 Markdown 内容。
  const markdownObject = await objectStorageClient.uploadText("workspace-export", `${workspace.id}.md`, markdown, "text/markdown; charset=utf-8"); // 第61天：上传 Markdown 导出文件。
  const signedUrl = await objectStorageClient.getSignedUrl(markdownObject.bucket, markdownObject.objectKey); // 第61天：生成导出文件下载链接。
  return { workspaceId: workspace.id, markdownObject, signedUrl }; // 第61天：返回工作区导出结果。
} // 第61天：结束 exportWorkspaceToStorage 函数。

export async function uploadTraceAttachment(trace: Trace, name: string, payload: unknown): Promise<TraceAttachmentResult> { // 第61天：把 Trace 附件上传到对象存储。
  const attachment = await objectStorageClient.uploadJson("trace-attachment", `${trace.traceId}-${name}.json`, { traceId: trace.traceId, name, payload, createdAt: Date.now() }); // 第61天：序列化并上传 Trace 附件。
  const signedUrl = await objectStorageClient.getSignedUrl(attachment.bucket, attachment.objectKey); // 第61天：生成附件访问链接。
  return { traceId: trace.traceId, attachment, signedUrl }; // 第61天：返回附件上传结果。
} // 第61天：结束 uploadTraceAttachment 函数。

export async function getStorageSnapshot(): Promise<StorageSnapshot> { // 第61天：读取 Storage Explorer 快照。
  return objectStorageClient.snapshot(); // 第61天：委托对象存储客户端生成快照。
} // 第61天：结束 getStorageSnapshot 函数。

export async function deleteStorageObject(bucket: string, objectKey: string): Promise<StorageSnapshot> { // 第61天：删除对象并返回刷新后的快照。
  await objectStorageClient.delete(bucket, objectKey); // 第61天：删除指定对象。
  return getStorageSnapshot(); // 第61天：返回最新对象存储快照。
} // 第61天：结束 deleteStorageObject 函数。

export async function createSignedStorageUrl(bucket: string, objectKey: string): Promise<string> { // 第61天：创建对象可访问 URL。
  return objectStorageClient.getSignedUrl(bucket, objectKey); // 第61天：委托对象存储客户端生成 URL。
} // 第61天：结束 createSignedStorageUrl 函数。

function renderWorkspaceMarkdown(goal: string, entries: WorkspaceEntry[]): string { // 第61天：把工作区条目渲染为 Markdown。
  const lines = [`# Workspace Export（工作区导出）`, "", `- goal（目标）：${goal}`, `- exportedAt（导出时间）：${new Date().toISOString()}`, `- entries（条目数）：${entries.length}`, ""]; // 第61天：生成导出文件头部。
  for (const entry of entries) { // 第61天：遍历工作区条目。
    lines.push(`## ${entry.type} · ${entry.agentId}`); // 第61天：写入条目标题。
    lines.push(`- id：${entry.id}`); // 第61天：写入条目 ID。
    lines.push(`- createdAt：${new Date(entry.createdAt).toISOString()}`); // 第61天：写入条目时间。
    lines.push(""); // 第61天：写入空行。
    lines.push(entry.content); // 第61天：写入条目正文。
    lines.push(""); // 第61天：写入条目间隔。
  } // 第61天：结束条目遍历。
  return lines.join("\n"); // 第61天：返回 Markdown 文本。
} // 第61天：结束 renderWorkspaceMarkdown 函数。
