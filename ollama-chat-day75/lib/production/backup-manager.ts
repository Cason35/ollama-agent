import { createReadStream, createWriteStream } from "node:fs"; // 第74天：引入文件流支持数据库备份输入输出重定向。
import { mkdir, writeFile } from "node:fs/promises"; // 第74天：引入备份目录和清单文件创建能力。
import path from "node:path"; // 第74天：引入跨平台备份路径处理能力。
import { spawn } from "node:child_process"; // 第74天：引入无 Shell 命令执行能力安全调用 Docker CLI。
import type { BackupJob, BackupKind } from "@/lib/production/types"; // 第74天：引入备份任务领域类型。

export type BackupCommand = { command: string; args: string[]; inputFile?: string; outputFile?: string }; // 第74天：定义不拼接宿主机 Shell 字符串的备份命令结构。
export type BackupCommandRunner = (input: BackupCommand) => Promise<void>; // 第74天：定义可注入命令执行器类型供测试替换。

async function defaultCommandRunner(input: BackupCommand): Promise<void> { // 第74天：定义基于 spawn 的默认 Docker 命令执行器。
  await new Promise<void>((resolve, reject) => { // 第74天：把子进程生命周期包装为 Promise。
    const child = spawn(input.command, input.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }); // 第74天：隐藏 Windows 子进程窗口并避免使用高风险宿主机 Shell。
    const errors: Buffer[] = []; // 第74天：保存子进程标准错误输出。
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk)); // 第74天：收集 Docker 命令错误信息。
    if (input.inputFile) createReadStream(input.inputFile).pipe(child.stdin); else child.stdin.end(); // 第74天：按需把 SQL 备份文件输入数据库恢复命令。
    if (input.outputFile) child.stdout.pipe(createWriteStream(input.outputFile)); else child.stdout.resume(); // 第74天：按需把 mysqldump 输出保存为 SQL 文件。
    child.on("error", reject); // 第74天：子进程无法启动时直接拒绝 Promise。
    child.on("close", (code) => { if (code === 0) resolve(); else reject(new Error(`命令执行失败：${input.command} ${input.args.join(" ")}；${Buffer.concat(errors).toString("utf8")}`)); }); // 第74天：根据 Docker 命令退出码决定成功或失败。
  }); // 第74天：结束子进程 Promise 包装。
} // 第74天：结束默认 Docker 命令执行器。

function createJob(kind: BackupKind, target: string): BackupJob { // 第74天：定义备份任务创建函数。
  return { id: `backup-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, status: "planned", target, createdAt: Date.now() }; // 第74天：返回带唯一标识和目标路径的计划任务。
} // 第74天：结束备份任务创建函数。

export class BackupManager { // 第74天：定义 MySQL、Redis 和 MinIO 统一备份恢复管理器。
  private readonly jobs: BackupJob[] = []; // 第74天：保存当前进程最近备份任务。
  constructor(private readonly runner: BackupCommandRunner = defaultCommandRunner, private readonly rootDirectory = process.cwd()) {} // 第74天：允许测试注入命令执行器和项目根目录。
  listJobs(): BackupJob[] { // 第74天：定义读取最近备份任务的方法。
    return this.jobs.map((job) => ({ ...job })).sort((left, right) => right.createdAt - left.createdAt); // 第74天：按时间倒序返回任务副本。
  } // 第74天：结束备份任务列表方法。
  async backupAll(): Promise<{ directory: string; jobs: BackupJob[] }> { // 第74天：依次备份 MySQL、Redis 和 MinIO 并生成清单。
    const directory = path.join(this.rootDirectory, "backups", new Date().toISOString().replace(/[:.]/gu, "-")); // 第74天：为本次备份创建不可冲突的时间目录。
    await mkdir(directory, { recursive: true }); // 第74天：创建备份集合目录。
    await this.runJob("mysql", path.join(directory, "mysql.sql"), async (target) => await this.runner({ command: "docker", args: ["compose", "exec", "-T", "mysql", "sh", "-c", "mysqldump -u\"$MYSQL_USER\" -p\"$MYSQL_PASSWORD\" \"$MYSQL_DATABASE\""], outputFile: target })); // 第74天：从 MySQL 容器导出逻辑 SQL 备份。
    await this.runJob("redis", path.join(directory, "redis-dump.rdb"), async (target) => { await this.runner({ command: "docker", args: ["compose", "exec", "-T", "redis", "redis-cli", "SAVE"] }); await this.runner({ command: "docker", args: ["compose", "cp", "redis:/data/dump.rdb", target] }); }); // 第74天：触发 Redis 同步快照并复制 RDB 文件。
    const minioTarget = path.join(directory, "minio-data"); // 第74天：计算 MinIO 对象备份目录。
    await mkdir(minioTarget, { recursive: true }); // 第74天：创建 MinIO 对象备份目录。
    await this.runJob("minio", minioTarget, async (target) => await this.runner({ command: "docker", args: ["compose", "cp", "minio:/data/.", target] })); // 第74天：复制 MinIO 容器对象数据目录。
    const manifest = { version: 1, createdAt: Date.now(), directory, jobs: this.listJobs().filter((job) => job.target.startsWith(directory)) }; // 第74天：生成本次备份集合清单。
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8"); // 第74天：保存备份时间、目标和任务状态清单。
    return { directory, jobs: manifest.jobs }; // 第74天：返回备份集合目录和任务结果。
  } // 第74天：结束全量备份方法。
  async restoreAll(directory: string): Promise<void> { // 第74天：从指定备份集合恢复 MySQL、Redis 和 MinIO。
    const source = path.resolve(this.rootDirectory, directory); // 第74天：把用户输入转换为绝对备份目录。
    await this.runner({ command: "docker", args: ["compose", "exec", "-T", "mysql", "sh", "-c", "mysql -u\"$MYSQL_USER\" -p\"$MYSQL_PASSWORD\" \"$MYSQL_DATABASE\""], inputFile: path.join(source, "mysql.sql") }); // 第74天：把 SQL 备份导入 MySQL 容器。
    await this.runner({ command: "docker", args: ["compose", "stop", "redis"] }); // 第74天：停止 Redis 避免恢复期间写入快照文件。
    await this.runner({ command: "docker", args: ["compose", "cp", path.join(source, "redis-dump.rdb"), "redis:/data/dump.rdb"] }); // 第74天：把 RDB 快照复制回 Redis 数据目录。
    await this.runner({ command: "docker", args: ["compose", "start", "redis"] }); // 第74天：重新启动 Redis 读取恢复后的快照。
    await this.runner({ command: "docker", args: ["compose", "stop", "minio"] }); // 第74天：停止 MinIO 避免恢复期间对象继续变化。
    await this.runner({ command: "docker", args: ["compose", "cp", `${path.join(source, "minio-data")}${path.sep}.`, "minio:/data"] }); // 第74天：把对象备份复制回 MinIO 数据目录。
    await this.runner({ command: "docker", args: ["compose", "start", "minio"] }); // 第74天：重新启动 MinIO 并加载恢复后的对象。
  } // 第74天：结束全量恢复方法。
  private async runJob(kind: BackupKind, target: string, action: (target: string) => Promise<void>): Promise<void> { // 第74天：定义统一备份任务生命周期包装器。
    const job = createJob(kind, target); // 第74天：创建计划中的备份任务。
    this.jobs.push(job); // 第74天：保存任务供仪表盘追踪。
    job.status = "running"; // 第74天：标记任务开始执行。
    try { // 第74天：捕获真实 Docker 备份失败。
      await action(target); // 第74天：执行对应基础设施备份动作。
      job.status = "completed"; // 第74天：标记备份任务成功。
      job.completedAt = Date.now(); // 第74天：记录备份完成时间。
    } catch (error) { // 第74天：处理备份命令失败。
      job.status = "failed"; // 第74天：标记备份任务失败。
      job.completedAt = Date.now(); // 第74天：记录失败完成时间。
      job.error = error instanceof Error ? error.message : String(error); // 第74天：保存可追踪失败原因。
      throw error; // 第74天：继续抛错阻止生成不完整备份成功结论。
    } // 第74天：结束备份任务异常处理。
  } // 第74天：结束统一备份任务生命周期包装器。
} // 第74天：结束备份恢复管理器类。

const globalForBackup = globalThis as typeof globalThis & { __day74BackupManager?: BackupManager }; // 第74天：扩展全局对象保存进程级备份任务历史。
export function getBackupManager(): BackupManager { // 第74天：定义读取共享备份管理器的方法。
  globalForBackup.__day74BackupManager ??= new BackupManager(); // 第74天：首次访问时创建备份管理器。
  return globalForBackup.__day74BackupManager; // 第74天：返回共享备份管理器。
} // 第74天：结束共享备份管理器读取函数。
