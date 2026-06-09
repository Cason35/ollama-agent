"use client"; // 消息列表需要接收 ref 与事件回调

import type { RefObject } from "react"; // 引入 ref 类型
import type { Bubble, TodoItem } from "@/app/types/chat-ui"; // 引入聊天气泡类型
import { findDownstreamSteps, formatZhHhMmSs, stepIdToName, workflowStepStatusGlyph } from "@/app/utils/workflow-ui"; // 引入工作流展示工具

type ChatTranscriptProps = {
  bubbles: Bubble[]; // 对话气泡列表
  loading: boolean; // 是否加载中
  listRef: RefObject<HTMLDivElement | null>; // 滚动容器 ref
  handleWorkflowConfirm: (bubbleIndex: number, workflowId: string, stepId: string, decision: "confirm" | "cancel") => void; // HITL 确认回调
}; // ChatTranscriptProps 结束

export function ChatTranscript({ bubbles, loading, listRef, handleWorkflowConfirm }: ChatTranscriptProps) {
  return (
    <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5">
      {bubbles.length === 0 && !loading ? (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
            <span className="text-xl" aria-hidden>◇</span>
          </div>
          <div>
            <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">开始对话</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">试试天气、总结、待办，或打开 Workflow 描述一个多步骤任务。</p>
          </div>
        </div>
      ) : null}

      {bubbles.map((msg, index) => {
        if (msg.role === "user") {
          return (
            <div key={`user-${index}`} className="flex justify-end">
              <div className="max-w-[min(100%,36rem)] rounded-xl rounded-br-sm bg-violet-600 px-4 py-3 text-white shadow-sm">
                <p className="mb-1 text-[10px] font-semibold uppercase text-white/70">你</p>
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{msg.content}</p>
              </div>
            </div>
          );
        }

        if (msg.variant === "chat") {
          return (
            <div key={`asst-${index}`} className="flex justify-start">
              <div className="max-w-[min(100%,36rem)] rounded-xl rounded-bl-sm border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">助手</p>
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-100">{msg.content}</p>
              </div>
            </div>
          );
        }

        if (msg.variant === "weather") {
          return (
            <div key={`weather-${index}`} className="flex justify-start">
              <div className="max-w-[min(100%,36rem)] rounded-xl rounded-bl-sm border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm dark:border-sky-800 dark:bg-sky-950/40">
                <p className="mb-1 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300">天气</p>
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-sky-950 dark:text-sky-50">
                  <span className="font-semibold">{msg.keyword}</span> · {msg.result}
                </p>
              </div>
            </div>
          );
        }

        if (msg.variant === "summary") {
          return (
            <div key={`summary-${index}`} className="flex justify-start">
              <div className="max-w-[min(100%,36rem)] rounded-xl rounded-bl-sm border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="mb-1 text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">总结</p>
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-amber-950 dark:text-amber-50">{msg.text}</p>
              </div>
            </div>
          );
        }

        if (msg.variant === "workflow") {
          const waitingStep = msg.paused && msg.waitingStepId ? msg.workflow.steps.find((step) => step.id === msg.waitingStepId) : undefined; // 找到待确认步骤
          return (
            <div key={`workflow-${index}`} className="flex justify-start">
              <div className="max-w-[min(100%,42rem)] overflow-hidden rounded-xl rounded-bl-sm border border-violet-200 bg-violet-50 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/30">
                <div className="border-b border-violet-200 px-4 py-2.5 dark:border-violet-800/50">
                  <p className="text-xs font-semibold text-violet-900 dark:text-violet-100">Workflow · {msg.workflow.goal}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-violet-700 dark:text-violet-300">status: {msg.workflow.status} · job: {msg.workflow.jobId ?? "-"} · steps: {msg.workflow.steps.length}</p>
                </div>
                <ul className="max-h-72 space-y-2 overflow-y-auto px-4 py-3 text-sm text-violet-950 dark:text-violet-50">
                  {msg.workflow.steps.map((step) => {
                    const downstream = findDownstreamSteps(msg.workflow.steps, step.id); // 获取后继步骤
                    return (
                      <li key={step.id} className="rounded-lg bg-white/70 ring-1 ring-violet-500/10 dark:bg-violet-950/35">
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <span className="font-mono text-sm">{workflowStepStatusGlyph(step.status)}</span>
                          <span className="font-medium">{step.name}</span>
                          <span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px]">{step.action}</span>
                          <span className="font-mono text-[10px] text-violet-600 dark:text-violet-300">{step.id}</span>
                        </div>
                        {step.dependsOn?.length ? (
                          <p className="border-t border-violet-200/60 px-3 py-1.5 text-[11px] dark:border-violet-800/40">
                            dependsOn: {step.dependsOn.map((id) => `${id}(${stepIdToName(msg.workflow.steps, id)})`).join(", ")}
                          </p>
                        ) : null}
                        {step.condition ? (
                          <p className="border-t border-violet-200/60 px-3 py-1.5 font-mono text-[11px] dark:border-violet-800/40">
                            condition: {step.condition.fromStepId} · {step.condition.operator} · {step.condition.value || "truthy"}
                          </p>
                        ) : null}
                        {step.error || step.skipReason || step.confirmationMessage ? (
                          <p className="border-t border-violet-200/60 px-3 py-1.5 text-[11px] dark:border-violet-800/40">
                            {step.error || step.skipReason || step.confirmationMessage}
                          </p>
                        ) : null}
                        {downstream.length ? (
                          <p className="border-t border-violet-200/60 px-3 py-1.5 text-[11px] dark:border-violet-800/40">
                            downstream: {downstream.map((step) => step.name).join(", ")}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {msg.workflow.executionBatches?.length ? (
                  <div className="border-t border-violet-200 px-4 py-2 text-[11px] dark:border-violet-800/50">
                    <p className="font-semibold text-violet-800 dark:text-violet-200">Execution Batch Timeline</p>
                    <p className="mt-1 break-words font-mono text-violet-700 dark:text-violet-300">
                      {msg.workflow.executionBatches.map((batch) => `#${batch.batchIndex} ${formatZhHhMmSs(batch.ts)} ${batch.stepIds.join("|")}`).join(" · ")}
                    </p>
                  </div>
                ) : null}
                {msg.workflow.executionTimeline?.length ? (
                  <div className="border-t border-violet-200 px-4 py-2 text-[11px] dark:border-violet-800/50">
                    <p className="font-semibold text-violet-800 dark:text-violet-200">Execution Timeline</p>
                    <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto font-mono text-violet-700 dark:text-violet-300">
                      {msg.workflow.executionTimeline.map((event, eventIndex) => (
                        <li key={`${event.ts}-${eventIndex}`} className="break-words">{formatZhHhMmSs(event.ts)} {event.stepId ? `· ${event.stepId}` : ""} {event.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {msg.paused && waitingStep && msg.waitingStepId ? (
                  <div className="border-t border-sky-300 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
                    <p className="mb-2 text-sm font-semibold text-sky-900 dark:text-sky-100">{waitingStep.confirmationMessage || `是否继续执行：${waitingStep.name}？`}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleWorkflowConfirm(index, msg.workflow.id, msg.waitingStepId!, "confirm")} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">确认执行</button>
                      <button type="button" onClick={() => handleWorkflowConfirm(index, msg.workflow.id, msg.waitingStepId!, "cancel")} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">取消</button>
                    </div>
                  </div>
                ) : null}
                <div className="border-t border-violet-200 bg-violet-500/5 px-4 py-3 dark:border-violet-800/50">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-violet-800 dark:text-violet-300">{msg.paused ? "当前状态" : "最终结果"}</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-violet-950 dark:text-violet-50">{msg.finalSummary}</p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={`todo-${index}`} className="flex justify-start">
            <div className="max-w-[min(100%,36rem)] rounded-xl rounded-bl-sm border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="mb-2 text-[10px] font-semibold uppercase text-emerald-800 dark:text-emerald-300">待办</p>
              <ul className="space-y-2 text-sm text-emerald-950 dark:text-emerald-50">
                {msg.items.map((item: TodoItem, itemIndex: number) => (
                  <li key={itemIndex} className="flex items-start gap-3">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-emerald-300 text-emerald-600" checked={item.done} readOnly />
                    <span className="break-words leading-relaxed">{item.task}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}

      {loading ? (
        <div className="flex justify-start">
          <div className="flex items-center gap-3 rounded-xl rounded-bl-sm border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex gap-1">
              <span className="size-2 animate-bounce rounded-full bg-violet-400 [animation-duration:0.6s]" />
              <span className="size-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0.12s] [animation-duration:0.6s]" />
              <span className="size-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0.24s] [animation-duration:0.6s]" />
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">正在思考...</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
