"use client";

import type { ChangeEvent, FormEvent } from "react";

type ChatComposerProps = {
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  handleSend: () => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

export function ChatComposer({ input, setInput, loading, handleSend, handleSubmit }: ChatComposerProps) {
  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-zinc-200/80 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-end gap-2">
        <textarea
          className="h-[56px] min-h-[56px] flex-1 resize-none rounded-lg border-0 bg-zinc-50 px-4 py-3 text-[15px] leading-relaxed text-zinc-900 ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:bg-zinc-950/45 dark:text-zinc-100 dark:ring-zinc-700 dark:placeholder:text-zinc-500"
          rows={2}
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={loading}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-[56px] w-[76px] shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {loading ? "处理中" : "发送"}
        </button>
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{input.length}/2000</p>
    </form>
  );
}
