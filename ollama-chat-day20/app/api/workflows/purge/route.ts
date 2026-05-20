/**
 * 第20天：过期清理 API — POST /api/workflows/purge（任务 5 + purgeExpired）。
 * 每行带中文行尾注释。
 */

import { NextResponse } from "next/server"; // Next 响应
import { dbPurgeExpiredWorkflows } from "@/lib/workflow-db"; // 内存 Map 清理

/** POST /api/workflows/purge — 删除超过 7 天未更新的记录。 */
export async function POST() {
  const removed = dbPurgeExpiredWorkflows(); // 执行清理
  return NextResponse.json({ ok: true, removed }); // 返回删除条数
} // POST 结束
