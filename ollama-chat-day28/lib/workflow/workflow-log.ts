/** Workflow 结构化日志：控制台 + 按日持久化到 logs/workflow/YYYY-MM-DD.log */
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "logs", "workflow");
const PROJECT_ROOT = process.cwd().replace(/\\/g, "/");

function logFilePathFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return path.join(LOG_DIR, `${y}-${m}-${d}.log`);
}

function normalizeStackFile(raw: string): string {
  let file = raw.trim();
  if (file.startsWith("file://")) {
    try {
      file = decodeURIComponent(new URL(file).pathname);
    } catch {
      /* keep raw */
    }
  }
  const webpackMatch = file.match(/webpack-internal:\/\/\/[^/]+\/\.\/(.+)/);
  if (webpackMatch) return webpackMatch[1];

  file = file.replace(/\\/g, "/");
  if (file.startsWith(`${PROJECT_ROOT}/`)) return file.slice(PROJECT_ROOT.length + 1);
  if (/^\/[A-Za-z]:\//.test(file)) return file.slice(1);
  return file;
}

/** 从调用栈解析首个非 workflow-log 的调用点，形如 runStep @ lib/workflow-executor.ts:322 */
function resolveLogCaller(): string {
  const stack = new Error().stack;
  if (!stack) return "unknown";

  const frameRe =
    /^\s*at (?:async )?(?:(?:[\w$.]+|Object\.<anonymous>) )?\(?(.*?):(\d+):(\d+)\)?\s*$/;

  for (const line of stack.split("\n").slice(1)) {
    if (line.includes("workflow-log")) continue;

    const named = line.match(/^\s*at (?:async )?([\w$.]+) \((.*?):(\d+):(\d+)\)\s*$/);
    if (named) {
      const [, fn, file, lineNo] = named;
      const rel = normalizeStackFile(file);
      const label = fn && fn !== "Object.<anonymous>" ? `${fn} @ ` : "";
      return `${label}${rel}:${lineNo}`;
    }

    const plain = line.match(frameRe);
    if (plain) {
      const [, file, lineNo] = plain;
      return `${normalizeStackFile(file)}:${lineNo}`;
    }
  }
  return "unknown";
}

function appendWorkflowLogLine(line: string): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(logFilePathFor(new Date()), line, "utf8");
}

export function logWorkflow(
  event: "start" | "step" | "done" | "error",
  payload: Record<string, unknown>
) {
  const at = resolveLogCaller();
  const entry = { ts: new Date().toISOString(), event, at, ...payload };
  console.log(`[Workflow] ${event} @ ${at}`, payload);
  try {
    appendWorkflowLogLine(`${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.error("[Workflow] persist log failed:", err);
  }
}
