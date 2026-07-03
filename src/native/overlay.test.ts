import { describe, expect, it, vi } from 'vitest'
import {
  checkFloatingAssistantPermission,
  isFloatingAssistantSupported,
  requestFloatingAssistantPermission,
  startFloatingAssistant,
  stopFloatingAssistant,
  consumeFloatingAssistantCommand,
  syncFloatingAssistantTodos,
  updateFloatingAssistantStatus,
  type OverlayBridge,
} from './overlay'

function createBridge(overrides: Partial<OverlayBridge> = {}): OverlayBridge {
  return {
    checkPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
    requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
    start: vi.fn().mockResolvedValue({ status: 'started' }),
    stop: vi.fn().mockResolvedValue({ status: 'stopped' }),
    consumePendingCommand: vi.fn().mockResolvedValue({ command: '' }),
    updateTodos: vi.fn().mockResolvedValue({ status: 'updated' }),
    updateStatus: vi.fn().mockResolvedValue({ status: 'updated' }),
    ...overrides,
  }
}

describe('floating assistant overlay bridge', () => {
  it('uses the app assistant fallback outside Android', async () => {
    const bridge = createBridge()

    expect(isFloatingAssistantSupported('web')).toBe(false)
    await expect(startFloatingAssistant({ bridge, platform: 'web' })).resolves.toEqual({
      status: 'unsupported',
      message: '系统悬浮球需要 Android 原生环境；Web 预览继续使用底部 AI 输入条',
    })

    expect(bridge.checkPermission).not.toHaveBeenCalled()
    expect(bridge.start).not.toHaveBeenCalled()
  })

  it('starts the native overlay when permission is already granted', async () => {
    const bridge = createBridge()

    await expect(startFloatingAssistant({
      bridge,
      platform: 'android',
      todos: [{ id: 'todo-1', title: '给张总发图纸', dueAt: '2026-05-26T20:00:00.000+08:00' }],
      config: { dockSide: 'right', size: 'large', opacity: 0.8 },
    })).resolves.toMatchObject({
      status: 'started',
    })

    expect(bridge.checkPermission).toHaveBeenCalledTimes(1)
    expect(bridge.requestPermission).not.toHaveBeenCalled()
    expect(bridge.start).toHaveBeenCalledWith({
      mode: 'hold-to-talk',
      todos: [{ id: 'todo-1', title: '给张总发图纸', dueAt: '2026-05-26T20:00:00.000+08:00' }],
      config: { dockSide: 'right', size: 'large', opacity: 0.8 },
    })
  })

  it('requests permission before starting the native overlay', async () => {
    const bridge = createBridge({
      checkPermission: vi.fn().mockResolvedValue({ status: 'denied' }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
    })

    await expect(startFloatingAssistant({ bridge, platform: 'android' })).resolves.toMatchObject({
      status: 'started',
    })

    expect(bridge.requestPermission).toHaveBeenCalledTimes(1)
    expect(bridge.start).toHaveBeenCalledTimes(1)
  })

  it('does not start when Android overlay permission is denied', async () => {
    const bridge = createBridge({
      checkPermission: vi.fn().mockResolvedValue({ status: 'denied' }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'denied' }),
    })

    await expect(startFloatingAssistant({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'permission-denied',
      message: '请在安卓系统设置里允许“显示在其他应用上层”，当前先使用 app 内 AI 输入条',
    })
    expect(bridge.start).not.toHaveBeenCalled()
  })

  it('checks and requests permission through the native bridge on Android', async () => {
    const bridge = createBridge({
      checkPermission: vi.fn().mockResolvedValue({ status: 'denied' }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
    })

    await expect(checkFloatingAssistantPermission({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'denied',
    })
    await expect(requestFloatingAssistantPermission({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'granted',
    })
  })

  it('stops the native overlay on Android', async () => {
    const bridge = createBridge()

    await expect(stopFloatingAssistant({ bridge, platform: 'android' })).resolves.toMatchObject({
      status: 'stopped',
    })
    expect(bridge.stop).toHaveBeenCalledTimes(1)
  })

  it('consumes a pending overlay voice command on Android', async () => {
    const bridge = createBridge({
      consumePendingCommand: vi.fn().mockResolvedValue({ command: '提醒我明天给张总发图纸' }),
    })

    await expect(consumeFloatingAssistantCommand({ bridge, platform: 'android' })).resolves.toEqual({
      command: '提醒我明天给张总发图纸',
      action: undefined,
    })
    expect(bridge.consumePendingCommand).toHaveBeenCalledTimes(1)
  })

  it('consumes a pending foreground voice capture request on Android', async () => {
    const bridge = createBridge({
      consumePendingCommand: vi.fn().mockResolvedValue({ command: '', action: 'foreground-voice-capture' }),
    })

    await expect(consumeFloatingAssistantCommand({ bridge, platform: 'android' })).resolves.toEqual({
      command: '',
      action: 'foreground-voice-capture',
    })
  })

  it('consumes native overlay voice and confirmation actions on Android', async () => {
    const bridge = createBridge({
      consumePendingCommand: vi.fn()
        .mockResolvedValueOnce({ command: '', action: 'overlay-voice-start' })
        .mockResolvedValueOnce({ command: '', action: 'overlay-voice-stop' })
        .mockResolvedValueOnce({ command: '', action: 'overlay-confirm' })
        .mockResolvedValueOnce({ command: '', action: 'overlay-dismiss' }),
    })

    await expect(consumeFloatingAssistantCommand({ bridge, platform: 'android' })).resolves.toEqual({
      command: '',
      action: 'overlay-voice-start',
    })
    await expect(consumeFloatingAssistantCommand({ bridge, platform: 'android' })).resolves.toEqual({
      command: '',
      action: 'overlay-voice-stop',
    })
    await expect(consumeFloatingAssistantCommand({ bridge, platform: 'android' })).resolves.toEqual({
      command: '',
      action: 'overlay-confirm',
    })
    await expect(consumeFloatingAssistantCommand({ bridge, platform: 'android' })).resolves.toEqual({
      command: '',
      action: 'overlay-dismiss',
    })
  })

  it('updates the native overlay status on Android', async () => {
    const bridge = createBridge()

    await expect(updateFloatingAssistantStatus({
      bridge,
      platform: 'android',
      message: 'Agent 正在生成',
      detail: '正在调用模型',
    })).resolves.toEqual({ status: 'updated' })

    expect(bridge.updateStatus).toHaveBeenCalledWith({
      message: 'Agent 正在生成',
      detail: '正在调用模型',
    })
  })

  it('syncs open todos to the running native overlay without restarting it', async () => {
    const bridge = createBridge()

    await expect(syncFloatingAssistantTodos({
      bridge,
      platform: 'android',
      todos: [{ id: 'todo-1', title: '给张总发图纸', dueAt: '2026-05-26T20:00:00.000+08:00' }],
    })).resolves.toEqual({ status: 'updated' })

    expect(bridge.updateTodos).toHaveBeenCalledWith({
      todos: [{ id: 'todo-1', title: '给张总发图纸', dueAt: '2026-05-26T20:00:00.000+08:00' }],
    })
    expect(bridge.start).not.toHaveBeenCalled()
  })

  it('updates the native overlay with a confirmation card state', async () => {
    const bridge = createBridge()

    await expect(updateFloatingAssistantStatus({
      bridge,
      platform: 'android',
      message: '需要确认',
      detail: '客户草稿等待保存',
      requiresConfirmation: true,
      primaryActionLabel: '确认保存',
      secondaryActionLabel: '取消',
    })).resolves.toEqual({ status: 'updated' })

    expect(bridge.updateStatus).toHaveBeenCalledWith({
      message: '需要确认',
      detail: '客户草稿等待保存',
      requiresConfirmation: true,
      primaryActionLabel: '确认保存',
      secondaryActionLabel: '取消',
    })
  })
})
