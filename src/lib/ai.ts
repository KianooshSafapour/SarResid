import { db } from '@/lib/db'

/**
 * R14 — انتگراسیون هوش مصنوعی z.ai (GLM) داخل سر رسید.
 * کلید و پیکربندی در Setting نگه‌داری می‌شود (ai.apiKey / ai.baseUrl / ai.model)؛
 * همهٔ فراخوانی‌ها سمت سرور انجام می‌شود تا کلید هرگز به مرورگر نرود.
 */

export const AI_SETTING_KEYS = {
  apiKey: 'ai.apiKey',
  baseUrl: 'ai.baseUrl',
  model: 'ai.model',
} as const

export const AI_DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4'
export const AI_DEFAULT_MODEL = 'glm-4.6'

export interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
  configured: boolean
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function getAiConfig(): Promise<AiConfig> {
  const [apiKey, baseUrl, model] = await Promise.all([
    readSetting(AI_SETTING_KEYS.apiKey),
    readSetting(AI_SETTING_KEYS.baseUrl),
    readSetting(AI_SETTING_KEYS.model),
  ])
  const key = (apiKey ?? '').trim()
  return {
    apiKey: key,
    baseUrl: (baseUrl ?? '').trim() || AI_DEFAULT_BASE_URL,
    model: (model ?? '').trim() || AI_DEFAULT_MODEL,
    configured: key.length > 10,
  }
}

export async function setAiSettings(patch: { apiKey?: string; baseUrl?: string; model?: string }) {
  const upsert = async (key: string, value: string | null) => {
    if (value === null) {
      await db.setting.deleteMany({ where: { key } })
      return
    }
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  if (patch.apiKey !== undefined) await upsert(AI_SETTING_KEYS.apiKey, patch.apiKey.trim() || null)
  if (patch.baseUrl !== undefined) await upsert(AI_SETTING_KEYS.baseUrl, patch.baseUrl.trim() || null)
  if (patch.model !== undefined) await upsert(AI_SETTING_KEYS.model, patch.model.trim() || null)
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface AiToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

/** یک فراخوانی خام chat/completions — OpenAI-compatible */
export async function aiChatRaw(
  cfg: AiConfig,
  messages: AiMessage[],
  tools?: AiToolDef[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ message: AiMessage; finishReason: string; usage?: Record<string, number> }> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      ...(tools && tools.length ? { tools, tool_choice: 'auto' } : {}),
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const j = (await res.json().catch(() => null)) as {
    choices?: { message?: AiMessage; finish_reason?: string }[]
    error?: { message?: string } | string
    usage?: Record<string, number>
  } | null
  if (!res.ok || !j?.choices?.[0]?.message) {
    const err = typeof j?.error === 'string' ? j.error : j?.error?.message
    throw new Error(err || `خطای سرویس هوش مصنوعی (HTTP ${res.status})`)
  }
  return { message: j.choices[0].message, finishReason: j.choices[0].finish_reason ?? 'stop', usage: j.usage }
}
