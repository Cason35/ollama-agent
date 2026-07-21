import { randomUUID } from "node:crypto"; // 第72天：引入 UUID 生成器创建结构化日志唯一标识。
import { maskSecretObject } from "@/lib/secrets/secret-masking"; // 第72天：引入密钥脱敏工具避免敏感字段进入生产日志。
import type { LogQuery, LogRecord, ObservationLevel } from "@/lib/observability/types"; // 第72天：引入日志级别、记录和查询类型。

type LogInput = { message: string; source: string; requestId?: string; traceId?: string; metadata?: Record<string, unknown>; createdAt?: number }; // 第72天：定义四种日志级别共用的结构化输入。

export class LogManager { // 第72天：实现统一结构、链路关联和多条件查询的日志管理器。
  private readonly records: LogRecord[] = []; // 第72天：按创建顺序保存进程内结构化日志历史。

  debug(input: LogInput): LogRecord { return this.write("debug", input); } // 第72天：记录调试级别结构化日志。
  info(input: LogInput): LogRecord { return this.write("info", input); } // 第72天：记录普通信息级别结构化日志。
  warn(input: LogInput): LogRecord { return this.write("warn", input); } // 第72天：记录警告级别结构化日志。
  error(input: LogInput): LogRecord { return this.write("error", input); } // 第72天：记录错误级别结构化日志并供错误追踪消费。

  query(query: LogQuery = {}): LogRecord[] { // 第72天：实现按级别、来源、请求、链路和文本的组合查询。
    const search = query.search?.trim().toLowerCase() ?? ""; // 第72天：标准化可选全文搜索词。
    return this.records.filter((record) => !query.level || record.level === query.level).filter((record) => !query.source || record.source === query.source).filter((record) => !query.traceId || record.traceId === query.traceId).filter((record) => !query.requestId || record.requestId === query.requestId).filter((record) => !search || `${record.message} ${JSON.stringify(record.metadata)}`.toLowerCase().includes(search)).map((record) => structuredClone(record)); // 第72天：应用全部过滤条件并返回防御性副本。
  } // 第72天：结束结构化日志组合查询方法。

  list(): LogRecord[] { return this.records.map((record) => structuredClone(record)); } // 第72天：返回全部结构化日志的防御性快照。

  private write(level: ObservationLevel, input: LogInput): LogRecord { // 第72天：定义四种日志级别共享的写入实现。
    if (!input.message.trim()) throw new Error("结构化日志 message 不能为空"); // 第72天：阻止没有可读消息的日志写入。
    if (!input.source.trim()) throw new Error("结构化日志 source 不能为空"); // 第72天：阻止没有来源模块的日志写入。
    const record: LogRecord = { id: `log_${randomUUID()}`, level, message: input.message.trim(), source: input.source.trim(), requestId: input.requestId, traceId: input.traceId, metadata: maskSecretObject(input.metadata ?? {}), createdAt: input.createdAt ?? Date.now() }; // 第72天：创建已经脱敏且可按字段查询的统一日志记录。
    this.records.push(record); // 第72天：把结构化日志追加到内存历史。
    return structuredClone(record); // 第72天：返回防御性副本避免调用方修改内部记录。
  } // 第72天：结束统一结构化日志写入实现。
} // 第72天：结束日志管理器实现。
