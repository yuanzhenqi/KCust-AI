export type ModelProvider = 'openai-compatible'

export interface ModelConfig {
  provider: ModelProvider
  baseUrl: string
  model: string
}

const TEST_MODEL_BASE_URL = 'https://model.example.test/v1'
const TEST_MODEL_API_KEY = 'sk-test-model-gateway'

export const BUILT_IN_MODEL_BASE_URL =
  import.meta.env.VITE_MODEL_GATEWAY_BASE_URL?.trim()
  || (import.meta.env.MODE === 'test' ? TEST_MODEL_BASE_URL : '')
export const BUILT_IN_MODEL_API_KEY =
  import.meta.env.VITE_MODEL_GATEWAY_API_KEY?.trim()
  || (import.meta.env.MODE === 'test' ? TEST_MODEL_API_KEY : '')

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'openai-compatible',
  baseUrl: BUILT_IN_MODEL_BASE_URL,
  model: 'MiniMax-M3',
}

export function normalizeModelConfig(input: Partial<ModelConfig> | null | undefined): ModelConfig {
  return {
    provider: 'openai-compatible',
    baseUrl: normalizeBaseUrl(input?.baseUrl ?? DEFAULT_MODEL_CONFIG.baseUrl),
    model: normalizeModelId(input?.model ?? DEFAULT_MODEL_CONFIG.model),
  }
}

export function parseStoredModelConfig(raw: string | null): ModelConfig {
  if (!raw) return normalizeModelConfig(null)

  try {
    const parsed = JSON.parse(raw) as Partial<ModelConfig>
    return normalizeModelConfig(parsed)
  } catch {
    return normalizeModelConfig(null)
  }
}

export function serializeModelConfig(config: Partial<ModelConfig>): string {
  return JSON.stringify(normalizeModelConfig(config))
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  return (trimmed || DEFAULT_MODEL_CONFIG.baseUrl).replace(/\/+$/, '')
}

function normalizeModelId(value: string): string {
  return value.trim() || DEFAULT_MODEL_CONFIG.model
}
