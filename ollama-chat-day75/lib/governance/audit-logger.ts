import { createHash, randomUUID } from "node:crypto"; // 第73天：引入哈希和UUID工具创建可校验的审计日志链。
import type { AuditLog } from "@/lib/governance/types"; // 第73天：引入统一审计日志类型。
export type AuditInput = Omit<AuditLog, "id" | "timestamp" | "previousHash" | "integrityHash"> & { timestamp?: number }; // 第73天：定义调用方写入审计记录时需要提供的业务字段。
export class AuditLogger { // 第73天：实现记录用户、租户、动作、资源和结果的防篡改审计记录器。
  private readonly logs: AuditLog[] = []; // 第73天：按发生顺序保存审计记录和哈希链。
  write(input: AuditInput): AuditLog { // 第73天：创建一条带前序哈希和完整性哈希的审计记录。
    const previousHash = this.logs.at(-1)?.integrityHash ?? "GENESIS"; // 第73天：读取上一条记录哈希或使用创世标记。
    const base = { ...input, id: `audit_${randomUUID()}`, timestamp: input.timestamp ?? Date.now(), previousHash, metadata: structuredClone(input.metadata) }; // 第73天：组装尚未计算完整性哈希的审计字段。
    const integrityHash = createHash("sha256").update(JSON.stringify(base)).digest("hex"); // 第73天：使用SHA256计算审计内容和前序哈希的完整性摘要。
    const log: AuditLog = { ...base, integrityHash }; // 第73天：组装包含完整性哈希的最终审计记录。
    this.logs.push(structuredClone(log)); // 第73天：按时间顺序追加审计记录防御性副本。
    return structuredClone(log); // 第73天：返回新创建的审计记录副本。
  } // 第73天：结束审计日志写入方法。
  list(tenantId?: string): AuditLog[] { return this.logs.filter((item) => !tenantId || item.tenantId === tenantId).map((item) => structuredClone(item)); } // 第73天：按需自动过滤租户并返回审计记录副本。
  verifyIntegrity(): boolean { return this.logs.every((item, index) => { const { integrityHash, ...base } = item; const expectedPrevious = index === 0 ? "GENESIS" : this.logs[index - 1]?.integrityHash; return item.previousHash === expectedPrevious && createHash("sha256").update(JSON.stringify(base)).digest("hex") === integrityHash; }); } // 第73天：重新计算整条哈希链验证审计日志未被篡改。
} // 第73天：结束防篡改审计日志记录器实现。
