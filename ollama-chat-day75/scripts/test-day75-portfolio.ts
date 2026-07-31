import assert from "node:assert/strict"; // 第75天：引入严格断言验证最终作品集交付物。
import { readFile, access } from "node:fs/promises"; // 第75天：引入异步文件读取与存在性检查能力。
import path from "node:path"; // 第75天：引入跨平台路径拼接能力。

const root = process.cwd(); // 第75天：把当前项目目录作为自动验收根目录。
const requiredFiles = ["README.md", "CHANGELOG.md", "docs/architecture.md", "docs/demo-story.md", "docs/interview-qa.md", "docs/highlights.md", "docs/security-checklist.md", "docs/portfolio-package.md", "benchmark/README.md", "benchmark/results.json", "day75_test_cases.md", "app/portfolio/page.tsx"]; // 第75天：声明最终作品集必须存在的核心文件。

async function main(): Promise<void> { // 第75天：定义 Day75 自动验收主流程。
  for (const file of requiredFiles) await access(path.join(root, file)); // 第75天：逐项验证所有核心交付文件存在。
  for (let index = 1; index <= 10; index += 1) await access(path.join(root, "docs", "adr", `${String(index).padStart(3, "0")}-${["workflow-dag", "mysql-vector-store", "redis-queue", "runtime-context", "durable-execution", "rag-rerank", "tenant-isolation", "feature-flags", "observability", "object-storage"][index - 1]}.md`)); // 第75天：验证十份架构决策记录完整存在。
  const architecture = await readFile(path.join(root, "docs", "architecture.md"), "utf8"); // 第75天：读取系统架构文档以检查图表数量。
  assert.equal((architecture.match(/```mermaid/g) ?? []).length, 5, "架构文档必须恰好包含五张 Mermaid 图"); // 第75天：断言五张要求的架构图全部存在。
  const interview = await readFile(path.join(root, "docs", "interview-qa.md"), "utf8"); // 第75天：读取面试问答文档以检查题目数量。
  assert.ok((interview.match(/^### \d+\./gm) ?? []).length >= 30, "面试问答不得少于三十组"); // 第75天：断言面试问题覆盖数量达标。
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { name: string; version: string }; // 第75天：读取包元数据验证正式版本。
  assert.deepEqual(packageJson, { ...packageJson, name: "ollama-chat-day75", version: "1.0.0" }); // 第75天：断言项目名称和正式发布版本正确。
  const layout = await readFile(path.join(root, "app", "layout.tsx"), "utf8"); // 第75天：读取根布局验证标签页标题。
  assert.match(layout, /Day 75 - Agent Platform Portfolio/); // 第75天：断言浏览器标签页已更新为 Day75。
  console.log("Day75 Portfolio 自动验收通过：12 项核心交付物、10 份 ADR、5 张架构图、30+ 面试问答与 v1.0.0 版本均完整。"); // 第75天：输出清晰的自动验收成功摘要。
} // 第75天：结束自动验收主流程。

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }); // 第75天：捕获验收失败并设置非零退出码。
