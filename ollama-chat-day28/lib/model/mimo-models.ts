/**
 * 小米 MiMo OpenAI 兼容接口：`model` 必须为网关识别的 **API id**（全小写、连字符），
 * 例如 `mimo-v2.5`。若写成控制台展示名 `MiMo-V2.5`，会返回 400「Not supported model」。
 * @see https://www.mimo-v2.com/models 各模型页 URL slug
 */
export const MIMO_MODEL_IDS = [
  "mimo-v2.5-pro",
  "mimo-v2.5",
  "mimo-v2.5-tts-voiceclone",
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts",
  "mimo-v2-pro",
  "mimo-v2-omni",
  "mimo-v2-flash",
  "mimo-v2-tts",
] as const;

export type MimoModelId = (typeof MIMO_MODEL_IDS)[number];

/** 下拉展示用：人类可读名 → 实际请求的 apiId */
export const MIMO_MODEL_OPTIONS: ReadonlyArray<{ apiId: MimoModelId; label: string }> = [
  { apiId: "mimo-v2.5-pro", label: "MiMo-V2.5-Pro" },
  { apiId: "mimo-v2.5", label: "MiMo-V2.5" },
  { apiId: "mimo-v2.5-tts-voiceclone", label: "MiMo-V2.5-TTS-VoiceClone" },
  { apiId: "mimo-v2.5-tts-voicedesign", label: "MiMo-V2.5-TTS-VoiceDesign" },
  { apiId: "mimo-v2.5-tts", label: "MiMo-V2.5-TTS" },
  { apiId: "mimo-v2-pro", label: "MiMo-V2-Pro" },
  { apiId: "mimo-v2-omni", label: "MiMo-V2-Omni" },
  { apiId: "mimo-v2-flash", label: "MiMo-V2-Flash" },
  { apiId: "mimo-v2-tts", label: "MiMo-V2-TTS" },
];
