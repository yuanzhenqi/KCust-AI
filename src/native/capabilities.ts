export type CapabilityStatus = 'available' | 'requires-permission' | 'native-plugin' | 'preview-only'

export interface NativeCapability {
  id: 'overlay' | 'notifications' | 'calendar' | 'speech' | 'keystore' | 'sqlite'
  name: string
  androidStatus: CapabilityStatus
  webStatus: CapabilityStatus
  fallback: string
}

export function getNativeCapabilityMatrix(): NativeCapability[] {
  return [
    {
      id: 'overlay',
      name: '系统悬浮球',
      androidStatus: 'requires-permission',
      webStatus: 'preview-only',
      fallback: '应用内底部 AI 输入条',
    },
    {
      id: 'notifications',
      name: 'app 内通知',
      androidStatus: 'requires-permission',
      webStatus: 'preview-only',
      fallback: '待办列表持续保留',
    },
    {
      id: 'calendar',
      name: '安卓本机日历',
      androidStatus: 'native-plugin',
      webStatus: 'preview-only',
      fallback: '保留 app 内提醒',
    },
    {
      id: 'speech',
      name: '语音输入',
      androidStatus: 'requires-permission',
      webStatus: 'preview-only',
      fallback: '文字输入',
    },
    {
      id: 'keystore',
      name: '模型 API Key 安全存储',
      androidStatus: 'native-plugin',
      webStatus: 'preview-only',
      fallback: 'Web 预览不保存真实密钥',
    },
    {
      id: 'sqlite',
      name: '本地 SQLite 客户库',
      androidStatus: 'native-plugin',
      webStatus: 'preview-only',
      fallback: 'Web 预览使用 localStorage 适配器',
    },
  ]
}
