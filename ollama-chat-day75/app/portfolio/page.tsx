import type { Metadata } from "next"; // 第75天：引入页面元数据类型以配置作品集标签页。
import Link from "next/link"; // 第75天：引入客户端无刷新导航组件以连接平台入口。

export const metadata: Metadata = { title: "Day 75 - Agent Platform v1.0 Portfolio | 最终作品集", description: "Day 75 Agent Platform v1.0.0 架构、演示、基准测试、安全审计与面试材料总览。" }; // 第75天：定义最终作品集标签页标题与描述。

const deliverables = [ // 第75天：声明十二项最终验收交付物。
  ["项目目录", "app / lib / scripts / tests / docs / benchmark / migrations", "/"], // 第75天：展示可理解的最终项目目录。
  ["README", "目标、能力、架构、快速启动、测试与常见问题", "/README.md"], // 第75天：展示项目入口文档交付物。
  ["Architecture", "五张 Mermaid 架构图与模块边界", "/docs/architecture.md"], // 第75天：展示架构说明交付物。
  ["ADR × 10", "关键决策、备选方案、权衡与结果", "/docs/adr/README.md"], // 第75天：展示架构决策记录交付物。
  ["Demo Story", "研究智能体端到端演示脚本", "/docs/demo-story.md"], // 第75天：展示演示故事交付物。
  ["Benchmark", "环境、数据、参数、次数与可复现结果", "/benchmark/README.md"], // 第75天：展示基准测试交付物。
  ["Interview Q&A", "30 组结合实际实现的面试问答", "/docs/interview-qa.md"], // 第75天：展示面试材料交付物。
  ["Highlights", "README、简历与面试可复用技术亮点", "/docs/highlights.md"], // 第75天：展示技术亮点交付物。
  ["Security", "密钥、迁移、日志、租户与依赖审计", "/docs/security-checklist.md"], // 第75天：展示最终安全检查交付物。
  ["Release v1.0.0", "正式版本变更记录与发布清单", "/CHANGELOG.md"], // 第75天：展示正式版本交付物。
  ["Portfolio Package", "源码、文档、演示、基准与安全记录", "/docs/portfolio-package.md"], // 第75天：展示最终作品集包交付物。
  ["Test Cases", "Day75 自动验收与人工验证用例", "/day75_test_cases.md"], // 第75天：展示测试用例交付物。
] as const; // 第75天：结束不可变交付物清单。

const capabilities = ["Agent Runtime", "Multi-Agent", "DAG Workflow", "Durable Execution", "Production RAG", "Long-Term Memory", "Prompt Management", "Evaluation", "Observability", "Multi-Tenant Security"]; // 第75天：声明平台十项核心能力标签。

export default function PortfolioPage() { // 第75天：定义智能体平台最终作品集页面组件。
  return ( // 第75天：返回作品集总览页面。
    <main className="min-h-screen bg-[#070b14] px-4 py-8 text-slate-100 sm:px-8"> {/* 第75天：定义深色全屏作品集页面。 */}
      <div className="mx-auto max-w-7xl"> {/* 第75天：限制内容宽度并水平居中。 */}
        <header className="rounded-3xl border border-violet-300/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.28),transparent_42%),linear-gradient(135deg,#111827,#070b14)] p-6 sm:p-9"> {/* 第75天：定义最终发布主题标题区。 */}
          <div className="flex flex-wrap items-center justify-between gap-5"> {/* 第75天：排列版本信息与导航动作。 */}
            <div><p className="text-xs font-black uppercase tracking-[.28em] text-violet-200">Day 75 · Final Capstone V2</p><h1 className="mt-3 text-3xl font-black sm:text-5xl">Agent Platform v1.0 Portfolio</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">智能体平台作品集与工程成熟度：让系统可以被理解、运行、验证、面试讲解和持续维护。</p></div> {/* 第75天：展示作品集标题、版本和核心价值。 */}
            <Link href="/" className="rounded-xl border border-violet-200/30 px-4 py-2 text-sm font-bold text-violet-100 transition hover:bg-violet-300/10">返回 Day75 工作台</Link> {/* 第75天：提供返回聊天工作台的导航。 */}
          </div> {/* 第75天：结束标题区水平布局。 */}
          <div className="mt-6 flex flex-wrap gap-2">{capabilities.map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">{item}</span>)}</div> {/* 第75天：展示完整平台能力标签。 */}
        </header> {/* 第75天：结束最终发布主题标题区。 */}
        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"> {/* 第75天：以响应式网格展示所有验收交付物。 */}
          {deliverables.map(([name, detail, path], index) => <article key={name} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"><div className="flex items-center justify-between"><span className="font-mono text-xs font-black text-violet-300">TASK {String(index + 1).padStart(2, "0")}</span><span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[10px] font-black text-emerald-200">COMPLETED</span></div><h2 className="mt-4 text-xl font-black">{name}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{detail}</p><p className="mt-4 break-all font-mono text-xs text-violet-200">{path}</p></article>)} {/* 第75天：渲染十二项完成状态卡片。 */}
        </section> {/* 第75天：结束验收交付物网格。 */}
        <footer className="mt-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-5 text-sm leading-7 text-emerald-100">Release v1.0.0 · Source Code + Architecture + Documentation + Demo + Benchmark + Interview Material + Portfolio Package</footer> {/* 第75天：汇总正式发布包内容。 */}
      </div> {/* 第75天：结束居中内容容器。 */}
    </main> // 第75天：结束作品集页面根节点。
  ); // 第75天：结束作品集页面返回。
} // 第75天：结束作品集页面组件。
