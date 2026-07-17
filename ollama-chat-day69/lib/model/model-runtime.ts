/**
 * Ollama / 小米 MiMo 模型运行时与统一补全调用。
 */

import { API_REASON, apiJsonReasonError } from "@/lib/api/api-envelope";
import { configManager } from "@/lib/config/config-runtime"; // 第62天：引入配置中心，统一读取模型相关运行时配置。
import { MIMO_MODEL_IDS, type MimoModelId } from "@/lib/model/mimo-models";
import { secretsManager } from "@/lib/secrets/secrets-runtime"; // 第63天：引入密钥管理器，统一读取模型 Provider 所需敏感凭证。

export const DEFAULT_OLLAMA_API_URL = "http://localhost:11434/api/chat";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:14b";
export const DEFAULT_MIMO_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";
export const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 30000;

export type ModelProvider = "local" | "mimo";

export type ModelRuntime = {
  provider: ModelProvider;
  ollamaUrl: string;
  ollamaModel: string;
  mimoBaseUrl: string;
  mimoApiKey: string;
  mimoModel: string;
};

function getModelRequestTimeoutMs(): number {
  const raw = configManager.getNumber("model.requestTimeoutMs", DEFAULT_MODEL_REQUEST_TIMEOUT_MS); // 第62天：从配置中心读取模型请求超时时间。
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MODEL_REQUEST_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(raw), 1000), 120000);
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function describeFetchError(error: unknown, timeoutMs: number): { status: number; text: string } {
  if (error instanceof Error && error.name === "AbortError") {
    return { status: 504, text: `模型请求超过 ${Math.round(timeoutMs / 1000)} 秒未返回` };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { status: 503, text: `模型请求失败：${detail}` };
}

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
  const timeoutMs = getModelRequestTimeoutMs();
  if (rt.provider === "local") {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        rt.ollamaUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: rt.ollamaModel,
            messages,
            stream: false,
            options: { num_predict: 800 },
          }),
        },
        timeoutMs
      );
    } catch (error) {
      const failure = describeFetchError(error, timeoutMs);
      return { ok: false, status: failure.status, text: failure.text };
    }
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
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${rt.mimoApiKey}`,
        },
        body: JSON.stringify({
          model: rt.mimoModel,
          messages,
          stream: false,
          temperature: 0.7,
          max_tokens: 800,
        }),
      },
      timeoutMs
    );
  } catch (error) {
    const failure = describeFetchError(error, timeoutMs);
    return { ok: false, status: failure.status, text: failure.text };
  }
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
export async function buildModelRuntime(
  providerRaw: string | undefined,
  mimoModelRaw: string | undefined
): Promise<{ rt: ModelRuntime | null; errorResponse: Response | null }> {
  const provider: ModelProvider = providerRaw === "mimo" ? "mimo" : "local";
  const mimoModel =
    typeof mimoModelRaw === "string" && mimoModelRaw.trim()
      ? mimoModelRaw.trim()
      : MIMO_MODEL_IDS[0];

  if (provider === "mimo") {
    if (!isMimoModelId(mimoModel)) {
      return {
        rt: null,
        errorResponse: apiJsonReasonError(
          API_REASON.MIMO_MODEL_INVALID,
          `无效的 mimo 模型「${mimoModel}」。可选：${MIMO_MODEL_IDS.join("、")}`
        ),
      };
    }
    const key = (await secretsManager.get("XIAOMI_MIMO_API_KEY"))?.trim() ?? ""; // 第63天：从 SecretsManager 读取 MiMo API Key。
    if (!key) {
      return {
        rt: null,
        errorResponse: apiJsonReasonError(
          API_REASON.MIMO_KEY_MISSING,
          "未配置 XIAOMI_MIMO_API_KEY：请在 Secrets Explorer 或环境变量中填入密钥"
        ),
      };
    }
  }
  const mimoApiKey = (await secretsManager.get("XIAOMI_MIMO_API_KEY"))?.trim() ?? ""; // 第63天：统一从密钥管理器读取 MiMo API Key。

  const rt: ModelRuntime = {
    provider,
    ollamaUrl: configManager.getString("model.ollamaApiUrl", DEFAULT_OLLAMA_API_URL).trim() || DEFAULT_OLLAMA_API_URL, // 第62天：从配置中心读取 Ollama API 地址。
    ollamaModel: configManager.getString("model.default", DEFAULT_OLLAMA_MODEL).trim() || DEFAULT_OLLAMA_MODEL, // 第62天：从配置中心读取默认 Ollama 模型。
    mimoBaseUrl: configManager.getString("model.mimoBaseUrl", DEFAULT_MIMO_BASE_URL).trim() || DEFAULT_MIMO_BASE_URL, // 第62天：从配置中心读取 MiMo Base URL。
    mimoApiKey, // 第63天：使用 SecretsManager 提供的敏感凭证。
    mimoModel,
  };
  return { rt, errorResponse: null };
}

