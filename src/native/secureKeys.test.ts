import { describe, expect, it, vi } from 'vitest'
import { loadModelApiKeySecure, saveModelApiKeySecure, type SecureKeysBridge } from './secureKeys'

function createBridge(overrides: Partial<SecureKeysBridge> = {}): SecureKeysBridge {
  return {
    getModelApiKey: vi.fn().mockResolvedValue({ apiKey: 'sk-secure' }),
    saveModelApiKey: vi.fn().mockResolvedValue({ saved: true }),
    deleteModelApiKey: vi.fn().mockResolvedValue({ deleted: true }),
    ...overrides,
  }
}

describe('secure model key bridge', () => {
  it('falls back outside Android without touching the native bridge', async () => {
    const bridge = createBridge()

    await expect(saveModelApiKeySecure('sk-web', { bridge, platform: 'web' })).resolves.toEqual({
      status: 'fallback',
      message: 'Web 预览使用浏览器本地存储；Android 版会写入 Keystore',
    })
    await expect(loadModelApiKeySecure({ bridge, platform: 'web' })).resolves.toEqual({
      status: 'fallback',
      apiKey: '',
    })
    expect(bridge.saveModelApiKey).not.toHaveBeenCalled()
    expect(bridge.getModelApiKey).not.toHaveBeenCalled()
  })

  it('saves, loads, and clears the model key through the Android bridge', async () => {
    const bridge = createBridge()

    await expect(saveModelApiKeySecure('sk-android', { bridge, platform: 'android' })).resolves.toEqual({
      status: 'saved',
      message: '模型 API Key 已保存到 Android Keystore',
    })
    await expect(saveModelApiKeySecure('', { bridge, platform: 'android' })).resolves.toEqual({
      status: 'cleared',
      message: '模型 API Key 已清空',
    })
    await expect(loadModelApiKeySecure({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'loaded',
      apiKey: 'sk-secure',
    })

    expect(bridge.saveModelApiKey).toHaveBeenCalledWith({ apiKey: 'sk-android' })
    expect(bridge.deleteModelApiKey).toHaveBeenCalledTimes(1)
  })

  it('falls back cleanly when the Android secure bridge fails', async () => {
    const bridge = createBridge({
      saveModelApiKey: vi.fn().mockRejectedValue(new Error('keystore unavailable')),
      getModelApiKey: vi.fn().mockRejectedValue(new Error('keystore unavailable')),
    })

    await expect(saveModelApiKeySecure('sk-fail', { bridge, platform: 'android' })).resolves.toMatchObject({
      status: 'fallback',
    })
    await expect(loadModelApiKeySecure({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'fallback',
      apiKey: '',
    })
  })
})
