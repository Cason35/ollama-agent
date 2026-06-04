"use client"; // 输入框组件包含受控 textarea 和键盘事件

import type { ChangeEvent, FormEvent } from "react"; // 引入表单和输入事件类型

/** 聊天输入区组件参数。 */
type ChatComposerProps = {
  input: string; // 当前输入文本
  setInput: (value: string) => void; // 输入 setter
  loading: boolean; // 是否正在发送
  handleSend: () => void; // 发送动作
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void; // 表单提交动作
};

/** 主聊天区底部输入框。 */
export function ChatComposer({ input, setInput, loading, handleSend, handleSubmit }: ChatComposerProps) {
  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-zinc-200/70 bg-zinc-50/50 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          className="min-h-[48px] flex-1 resize-y rounded-xl border-0 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 ring-1 ring-zinc-200/90 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/35 dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-zinc-700 dark:placeholder:text-zinc-500 dark:focus:ring-violet-400/30"
          rows={2}
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault(); // Enter 单独按下时阻止换行
              handleSend(); // 直接发送
            }
          }}
          disabled={loading}
          placeholder="输入消息，Enter 发送 · Shift+Enter 换行"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-45 sm:h-auto sm:min-h-[48px] sm:self-stretch"
        >
          {loading ? "处理中" : "发送"}
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500 sm:text-left">{input.length}/2000</p>
    </form>
  );
}
