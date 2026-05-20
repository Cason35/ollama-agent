/**
 * Ollama / 小米 MiMo 模型运行时与统一补全调用。
 */

import { MIMO_MODEL_IDS, type MimoModelId } from "@/lib/mimo-models";

export const DEFAULT_OLLAMA_API_URL = "http://localhost:11434/api/chat";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:14b";
export const DEFAULT_MIMO_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";

export type ModelProvider = "local" | "mimo";

export type ModelRuntime = {
  provider: ModelProvider;
  ollamaUrl: string;
  ollamaModel: string;
  mimoBaseUrl: string;
  mimoApiKey: string;
  mimoModel: string;
};

export function isMimoModelId(id: string): id is MimoModelId {
  return (MIMO_MODEL_IDS as readonly string[]).includes(id);
}

function normalizeApiBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function invokeChatModel(
  rt: ModelRuntime,
  messages: Array<{ role: string; content: string }>
): Promise<{ ok: boolean; status: number; text: string }> {
  if (rt.provider === "local") {
    const res = await fetch(rt.ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: rt.ollamaModel,
        messages,
        stream: false,
      }),
    });
    const rawText = await res.text();
    let text = "";
    if (res.ok) {
      try {
        const data = JSON.parse(rawText) as { message?: { content?: string } };
        text = data.message?.content?.trim() || "";
      } catch {
        text = "";
      }
    } else {
      try {
        const data = JSON.parse(rawText) as { error?: string };
        text = (typeof data.error === "string" ? data.error : "") || rawText.slice(0, 800);
      } catch {
        text = rawText.slice(0, 800);
      }
    }
    return { ok: res.ok, status: res.status, text };
  }

  const base = normalizeApiBase(rt.mimoBaseUrl);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rt.mimoApiKey}`,
    },
    body: JSON.stringify({
      model: rt.mimoModel,
      messages,
      stream: false,
    }),
  });
  const rawText = await res.text();
  let text = "";
  if (res.ok) {
    try {
      const data = JSON.parse(rawText) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      text = data.choices?.[0]?.message?.content?.trim() || "";
    } catch {
      text = "";
    }
  } else {
    try {
      const data = JSON.parse(rawText) as {
        error?: { message?: string } | string;
      };
      if (typeof data.error === "object" && data.error?.message) {
        text = data.error.message;
      } else if (typeof data.error === "string") {
        text = data.error;
      } else {
        text = rawText.slice(0, 800);
      }
    } catch {
      text = rawText.slice(0, 800);
    }
  }
  return { ok: res.ok, status: res.status, text };
}

/** 从请求体字段组装 ModelRuntime；校验失败时返回 errorResponse。 */
export function buildModelRuntime(
  providerRaw: string | undefined,
  mimoModelRaw: string | undefined
): { rt: ModelRuntime | null; errorResponse: Response | null } {
  const provider: ModelProvider = providerRaw === "mimo" ? "mimo" : "local";
  const mimoModel =
    typeof mimoModelRaw === "string" && mimoModelRaw.trim()
      ? mimoModelRaw.trim()
      : MIMO_MODEL_IDS[0];

  if (provider === "mimo") {
    if (!isMimoModelId(mimoModel)) {
      return {
        rt: null,
        errorResponse: Response.json(
          {
            error: `无效的 mimo 模型「${mimoModel}」。可选：${MIMO_MODEL_IDS.join("、")}`,
          },
          { status: 400 }
        ),
      };
    }
    const key = process.env.XIAOMI_MIMO_API_KEY?.trim();
    if (!key) {
      return {
        rt: null,
        errorResponse: Response.json(
          {
            error:
              "未配置环境变量 XIAOMI_MIMO_API_KEY：请在项目根目录复制 .env.example 为 .env.local 并填入密钥",
          },
          { status: 503 }
        ),
      };
    }
  }

  const rt: ModelRuntime = {
    provider,
    ollamaUrl: process.env.OLLAMA_API_URL?.trim() || DEFAULT_OLLAMA_API_URL,
    ollamaModel: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    mimoBaseUrl: process.env.XIAOMI_MIMO_BASE_URL?.trim() || DEFAULT_MIMO_BASE_URL,
    mimoApiKey: process.env.XIAOMI_MIMO_API_KEY?.trim() || "",
    mimoModel,
  };
  return { rt, errorResponse: null };
}
