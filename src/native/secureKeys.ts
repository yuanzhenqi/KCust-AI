import { Capacitor, registerPlugin } from '@capacitor/core'

export interface SecureKeysBridge {
  getModelApiKey(): Promise<{ apiKey: string }>
  saveModelApiKey(options: { apiKey: string }): Promise<{ saved: boolean }>
  deleteModelApiKey(): Promise<{ deleted: boolean }>
}

export type SecureKeySaveResult =
  | { status: 'saved'; message: string }
  | { status: 'cleared'; message: string }
  | { status: 'fallback'; message: string }

export type SecureKeyLoadResult =
  | { status: 'loaded'; apiKey: string }
  | { status: 'fallback'; apiKey: string }

type SecureKeyOptions = {
  bridge?: SecureKeysBridge
  platform?: string
}

const NativeSecureKeys = registerPlugin<SecureKeysBridge>('SecureKeys')
const WEB_FALLBACK_MESSAGE = 'Web 预览使用浏览器本地存储；Android 版会写入 Keystore'

export async function saveModelApiKeySecure(
  apiKey: string,
  { bridge = NativeSecureKeys, platform = Capacitor.getPlatform() }: SecureKeyOptions = {},
): Promise<SecureKeySaveResult> {
  if (platform !== 'android') return { status: 'fallback', message: WEB_FALLBACK_MESSAGE }

  try {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      await bridge.deleteModelApiKey()
      return { status: 'cleared', message: '模型 API Key 已清空' }
    }

    await bridge.saveModelApiKey({ apiKey: trimmed })
    return { status: 'saved', message: '模型 API Key 已保存到 Android Keystore' }
  } catch {
    return { status: 'fallback', message: WEB_FALLBACK_MESSAGE }
  }
}

export async function loadModelApiKeySecure({
  bridge = NativeSecureKeys,
  platform = Capacitor.getPlatform(),
}: SecureKeyOptions = {}): Promise<SecureKeyLoadResult> {
  if (platform !== 'android') return { status: 'fallback', apiKey: '' }

  try {
    const result = await bridge.getModelApiKey()
    return { status: 'loaded', apiKey: result.apiKey }
  } catch {
    return { status: 'fallback', apiKey: '' }
  }
}
