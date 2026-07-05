import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleUserRound,
  ClipboardList,
  Pencil,
  Home,
  KeyRound,
  MessageCircle,
  Mic,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
} from 'lucide-react'
import './App.css'
import { browserStorage, createLocalRepository } from './data/localRepository'
import type { AssistantCommand } from './domain/aiInterpreter'
import { hydrateCustomers, hydrateTodos } from './domain/appState'
import {
  applyCustomerUpdateToBestMatch,
  buildNextStepSuggestion,
  createCustomerFromDraft,
  scoreCustomerHealth,
} from './domain/customerLogic'
import { createInteractionRecord, sortInteractionsForTimeline } from './domain/interactionLogic'
import {
  runAgentCommand,
  type AgentModelClient,
  type AgentRunResult,
  type AgentRuntimeEvent,
} from './domain/agentRuntime'
import type { AgentMemory } from './domain/conversationAgent'
import {
  createAgentContextSummary,
  createModelDisclosure,
  type AgentModelDisclosure,
  type AgentSource,
} from './domain/agentTools'
import {
  BUILT_IN_MODEL_API_KEY,
  BUILT_IN_MODEL_BASE_URL,
  normalizeModelConfig,
  type ModelConfig,
} from './domain/modelConfig'
import { normalizeOverlayConfig, type OverlayConfig } from './domain/overlayConfig'
import {
  DEFAULT_PROFILE_FIELD_DEFINITIONS,
  PROFILE_FIELD_TEMPLATES,
  applyProfileFieldTemplate,
  formatProfileFieldValue,
  getCustomerProfileFieldValue,
  getSummaryProfileFields,
  normalizeProfileFieldDefinitions,
  normalizeProfileFieldKey,
} from './domain/profileFields'
import {
  createOpenAICompatibleModelClient,
  listOpenAICompatibleModels,
  testOpenAICompatibleConnection,
  type ModelConnectionTestResult,
  type ModelListResult,
} from './domain/openAIClient'
import type {
  AssistantHistoryMessage,
  Customer,
  HealthScore,
  Interaction,
  ProfileFieldDefinition,
  ProfileFieldType,
  Todo,
} from './domain/types'
import { getNativeCapabilityMatrix } from './native/capabilities'
import {
  consumeFloatingAssistantCommand,
  startFloatingAssistant,
  stopFloatingAssistant,
  syncFloatingAssistantTodos,
  updateFloatingAssistantStatus,
  type OverlayBridge,
  type OverlayStatusUpdateOptions,
  type OverlayTodoSummary,
} from './native/overlay'
import { scheduleTodoReminder, type ReminderScheduleResult } from './native/reminders'
import {
  loadModelApiKeySecure,
  type SecureKeysBridge,
} from './native/secureKeys'
import {
  cancelHoldToTalk,
  startHoldToTalk,
  stopHoldToTalk,
  type SpeechBridge,
  type SpeechProvider,
} from './native/speech'

type TabId = 'workspace' | 'customers' | 'todos' | 'agent' | 'settings'

type CustomerFormDraft = {
  name: string
  city: string
  budgetWan: number | null
  areaSqm: number | null
  sourceChannel: string
  stylePreference: string
  needs: string[]
}

type TodoFormDraft = {
  title: string
  dueAt: string | null
}

type InteractionFormDraft = {
  channel: Interaction['channel']
  summary: string
  happenedAt: string
  nextAction: string
}

type AssistantHistoryItem = AssistantHistoryMessage

type AssistantRunInfo = {
  source: AgentSource
  toolTrace: string[]
  modelDisclosure?: AgentModelDisclosure
}

type AssistantProcessEvent = {
  id: string
  kind: AgentRuntimeEvent['kind'] | 'model-stream' | 'local-start' | 'local-success'
  message: string
  detail?: string
}

type VoiceCaptureState = {
  phase: 'idle' | 'starting' | 'recording' | 'canceling' | 'recognizing'
  message: string
  provider?: SpeechProvider
}

type FloatingAssistantState = 'idle' | 'enabled' | 'permission-required' | 'unsupported'

type AppProps = {
  modelClient?: AgentModelClient
  modelConnectionTester?: (config: { apiKey: string; baseUrl: string; model: string }) => Promise<ModelConnectionTestResult>
  modelListFetcher?: (config: { apiKey: string; baseUrl: string; model: string }) => Promise<ModelListResult>
  isOnline?: boolean
  speechBridge?: SpeechBridge
  speechPlatform?: string
  reminderScheduler?: typeof scheduleTodoReminder
  secureKeysBridge?: SecureKeysBridge
  secureKeysPlatform?: string
  overlayBridge?: OverlayBridge
  overlayPlatform?: string
  overlayPollIntervalMs?: number
  now?: string
}

function currentLocalIsoWithOffset(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const offsetSign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0')
  const offsetRemainderMinutes = String(absoluteOffset % 60).padStart(2, '0')
  const localTime = new Date(date.getTime() + offsetMinutes * 60_000)

  return `${localTime.toISOString().slice(0, -1)}${offsetSign}${offsetHours}:${offsetRemainderMinutes}`
}

const navItems: Array<{ id: TabId; label: string; icon: typeof Home }> = [
  { id: 'workspace', label: '工作台', icon: Home },
  { id: 'customers', label: '客户', icon: UsersRound },
  { id: 'agent', label: 'Agent', icon: MessageCircle },
  { id: 'todos', label: '待办', icon: ClipboardList },
  { id: 'settings', label: '设置', icon: Settings },
]

const seedCustomers: Customer[] = [
  {
    id: 'c-zhang',
    name: '张总',
    city: '无锡',
    budgetWan: 50,
    areaSqm: 120,
    propertyType: '高层',
    household: '3 人住，有小孩',
    stage: '方案',
    needs: ['智能家居'],
    notes: '关注整体收纳、智能灯光和儿童活动区。',
    nextFollowUpAt: '2026-05-26T20:00:00.000+08:00',
    lastInteractionAt: '2026-05-24T09:00:00.000+08:00',
    createdAt: '2026-05-20T09:00:00.000+08:00',
    updatedAt: '2026-05-24T09:00:00.000+08:00',
    syncStatus: 'local',
  },
  {
    id: 'c-li',
    name: '李女士',
    city: '苏州',
    budgetWan: 80,
    areaSqm: 180,
    propertyType: '别墅',
    household: '四口之家',
    stage: '报价',
    needs: ['全屋定制', '中央空调'],
    notes: '需要对比两版报价，偏好安静克制的材质。',
    nextFollowUpAt: '2026-05-27T10:00:00.000+08:00',
    lastInteractionAt: '2026-04-20T09:00:00.000+08:00',
    createdAt: '2026-04-01T09:00:00.000+08:00',
    updatedAt: '2026-04-20T09:00:00.000+08:00',
    syncStatus: 'local',
  },
  {
    id: 'c-wang',
    name: '王先生',
    city: '无锡',
    budgetWan: 55,
    areaSqm: 125,
    propertyType: '高层',
    household: '3 人住，有小孩',
    stage: '初聊',
    needs: ['智能家居', '全屋定制'],
    notes: '希望先看相似案例和预算拆分。',
    nextFollowUpAt: null,
    lastInteractionAt: '2026-05-22T09:00:00.000+08:00',
    createdAt: '2026-05-18T09:00:00.000+08:00',
    updatedAt: '2026-05-22T09:00:00.000+08:00',
    syncStatus: 'local',
  },
]

const seedTodos: Todo[] = [
  {
    id: 'todo-zhang-meeting',
    customerId: 'c-zhang',
    title: '准备张总方案会议',
    dueAt: '2026-05-26T20:00:00.000+08:00',
    completed: false,
  },
  {
    id: 'todo-li-quote',
    customerId: 'c-li',
    title: '给李女士发送报价对比',
    dueAt: '2026-05-25T18:00:00.000+08:00',
    completed: false,
  },
]

function App({
  modelClient,
  modelConnectionTester = testOpenAICompatibleConnection,
  modelListFetcher = listOpenAICompatibleModels,
  isOnline,
  speechBridge,
  speechPlatform,
  reminderScheduler = scheduleTodoReminder,
  secureKeysBridge,
  secureKeysPlatform,
  overlayBridge,
  overlayPlatform,
  overlayPollIntervalMs = 1200,
  now: providedNow,
}: AppProps = {}) {
  const repository = useMemo(() => createLocalRepository(browserStorage), [])
  const now = useMemo(() => providedNow ?? currentLocalIsoWithOffset(), [providedNow])
  const [activeTab, setActiveTab] = useState<TabId>('workspace')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const stored = repository.listCustomers()
    return hydrateCustomers(seedCustomers, stored).filter(isActiveCustomer)
  })
  const [recycledCustomers, setRecycledCustomers] = useState<Customer[]>(() =>
    repository.listCustomers().filter(isRecycledCustomer),
  )
  const [todos, setTodos] = useState<Todo[]>(() => {
    const stored = repository.listTodos()
    return hydrateTodos(seedTodos, stored)
  })
  const [interactions, setInteractions] = useState<Interaction[]>(() => repository.listInteractions())
  const [assistantText, setAssistantText] = useState('')
  const [assistantCommand, setAssistantCommand] = useState<AssistantCommand | null>(null)
  const [assistantRunInfo, setAssistantRunInfo] = useState<AssistantRunInfo | null>(null)
  const [assistantMemory, setAssistantMemory] = useState<AgentMemory | null>(null)
  const [isAssistantRunning, setIsAssistantRunning] = useState(false)
  const [runningModelDisclosure, setRunningModelDisclosure] = useState<AgentModelDisclosure | null>(null)
  const [assistantStreamText, setAssistantStreamText] = useState('')
  const [assistantProcessEvents, setAssistantProcessEvents] = useState<AssistantProcessEvent[]>([])
  const [assistantHistory, setAssistantHistory] = useState<AssistantHistoryItem[]>(() => repository.listAssistantHistory())
  const [notice, setNotice] = useState('本地客户库已就绪')
  const [voiceCapture, setVoiceCapture] = useState<VoiceCaptureState>({ phase: 'idle', message: '' })
  const [isModelApiKeyConfigured, setIsModelApiKeyConfigured] = useState(true)
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => repository.getModelConfig())
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(() => repository.getOverlayConfig())
  const [profileFields, setProfileFields] = useState<ProfileFieldDefinition[]>(() => repository.listProfileFieldDefinitions())
  const [floatingAssistantState, setFloatingAssistantState] = useState<FloatingAssistantState>('idle')
  const voiceStartYRef = useRef<number | null>(null)
  const voiceActiveRef = useRef(false)
  const voiceCancelingRef = useRef(false)
  const assistantEventIdRef = useRef(0)
  const overlayCommandRunnerRef = useRef<(command: string) => Promise<void>>(async () => undefined)
  const confirmAssistantCommandRef = useRef<(options?: { navigateAfterSave?: boolean }) => Promise<void>>(async () => undefined)
  const overlayVoiceActiveRef = useRef(false)

  const healthScores = useMemo(
    () => customers.map((customer) => scoreCustomerHealth(customer, todos, now)),
    [customers, now, todos],
  )
  useEffect(() => {
    let cancelled = false

    loadModelApiKeySecure({ bridge: secureKeysBridge, platform: secureKeysPlatform }).then((result) => {
      if (cancelled || result.status !== 'loaded' || !result.apiKey.trim()) return
      repository.saveModelApiKey(result.apiKey)
    })

    return () => {
      cancelled = true
    }
  }, [repository, secureKeysBridge, secureKeysPlatform])

  const appendAssistantProcessEvent = useCallback((
    event: Omit<AssistantProcessEvent, 'id'>,
  ) => {
    assistantEventIdRef.current += 1
    const nextEvent: AssistantProcessEvent = {
      ...event,
      id: `assistant-event-${assistantEventIdRef.current}`,
    }
    setAssistantProcessEvents((events) => [...events, nextEvent].slice(-8))
  }, [])

  const runAssistant = async () => {
    if (isAssistantRunning) return
    const prompt = assistantText.trim()
    if (!prompt) return

    const apiKey = activeModelApiKey(repository.getModelApiKey())
    const online = resolveOnlineStatus(isOnline)
    if (shouldUseModelAgent({ apiKey, online, modelClient })) {
      const contextSummary = createAgentContextSummary(customers, todos, now, interactions, profileFields)
      await executeAssistant(prompt, createModelDisclosure(contextSummary))
      return
    }

    await executeAssistant(prompt)
  }

  const executeAssistant = useCallback(async (
    prompt: string,
    activeModelDisclosure?: AgentModelDisclosure,
  ): Promise<AgentRunResult | null> => {
    setIsAssistantRunning(true)
    setRunningModelDisclosure(activeModelDisclosure ?? null)
    setAssistantStreamText('')
    setAssistantProcessEvents([])
    setAssistantCommand(null)
    setAssistantRunInfo(null)
    setNotice(activeModelDisclosure ? '模型 Agent 正在生成' : '本地 Agent 正在生成')
    const apiKey = activeModelApiKey(repository.getModelApiKey())
    let hasStreamEvent = false

    if (!activeModelDisclosure) {
      appendAssistantProcessEvent({ kind: 'local-start', message: '读取本地客户库' })
    }

    try {
      const modelRunEnabled = Boolean(activeModelDisclosure)
      const result = await runAgentCommand(prompt, {
        customers,
        todos,
        interactions,
        profileFields,
        now,
        apiKey: modelRunEnabled ? apiKey : '',
        isOnline: resolveOnlineStatus(isOnline),
        modelConfig: {
          baseUrl: modelConfig.baseUrl,
          model: modelConfig.model,
        },
        modelClient: modelRunEnabled ? modelClient ?? createDefaultModelClient(apiKey, modelConfig) : undefined,
        memory: assistantMemory,
        onModelChunk: activeModelDisclosure
          ? (chunk) => {
              setAssistantStreamText((current) => `${current}${chunk}`)
              if (hasStreamEvent) return
              hasStreamEvent = true
              appendAssistantProcessEvent({ kind: 'model-stream', message: '收到模型流式响应' })
            }
          : undefined,
        onStatus: (event) => appendAssistantProcessEvent(event),
      })
      if (!activeModelDisclosure) {
        appendAssistantProcessEvent({ kind: 'local-success', message: '本地 Agent 已生成结果' })
      }
      setAssistantCommand(result.command)
      setAssistantRunInfo({
        source: result.source,
        toolTrace: result.toolTrace,
        modelDisclosure: result.modelDisclosure,
      })
      setAssistantMemory(result.memory ?? null)
      setAssistantHistory((history) => {
        const startIndex = history.length + 1
        const nextHistory: AssistantHistoryItem[] = [
          ...history,
          { id: `assistant-history-${startIndex}`, role: 'user', text: prompt, createdAt: now },
          {
            id: `assistant-history-${startIndex + 1}`,
            role: 'assistant',
            text: assistantHistoryText(result.command),
            createdAt: now,
          },
        ]
        const storedHistory = nextHistory.slice(-40)
        repository.saveAssistantHistory(storedHistory)

        return storedHistory
      })
      setAssistantText('')
      setNotice(assistantNotice(result))
      return result
    } finally {
      setIsAssistantRunning(false)
      setRunningModelDisclosure(null)
      setAssistantStreamText('')
    }
  }, [
    appendAssistantProcessEvent,
    assistantMemory,
    customers,
    interactions,
    isOnline,
    modelClient,
    modelConfig,
    now,
    profileFields,
    repository,
    todos,
  ])

  const pushFloatingAssistantStatus = useCallback(async (options: OverlayStatusUpdateOptions) => {
    await updateFloatingAssistantStatus({
      bridge: overlayBridge,
      platform: overlayPlatform,
      ...options,
    })
  }, [overlayBridge, overlayPlatform])

  const openOverlayTodos = useMemo<OverlayTodoSummary[]>(
    () => todos
      .filter((todo) => !todo.completed)
      .slice(0, 3)
      .map((todo) => ({ id: todo.id, title: todo.title, dueAt: todo.dueAt })),
    [todos],
  )

  useEffect(() => {
    if (floatingAssistantState !== 'enabled') return

    void syncFloatingAssistantTodos({
      bridge: overlayBridge,
      platform: overlayPlatform,
      todos: openOverlayTodos,
    })
  }, [floatingAssistantState, openOverlayTodos, overlayBridge, overlayPlatform])

  useEffect(() => {
    overlayCommandRunnerRef.current = async (command: string) => {
      if (isAssistantRunning) return

      const prompt = command.trim()
      if (!prompt) return

      await pushFloatingAssistantStatus({
        message: '已识别语音',
        detail: prompt,
      })

      try {
        await pushFloatingAssistantStatus({
          message: 'Agent 正在生成',
          detail: '正在读取客户库并生成结果',
        })
        const apiKey = activeModelApiKey(repository.getModelApiKey())
        const online = resolveOnlineStatus(isOnline)
        const result = shouldUseModelAgent({ apiKey, online, modelClient })
          ? await executeAssistant(prompt, createModelDisclosure(createAgentContextSummary(customers, todos, now, interactions, profileFields)))
          : await executeAssistant(prompt)

        if (!result) return
        await pushFloatingAssistantStatus({
          message: result.command.requiresConfirmation ? '需要确认' : 'Agent 已回复',
          detail: assistantHistoryText(result.command),
          requiresConfirmation: result.command.requiresConfirmation,
          primaryActionLabel: result.command.requiresConfirmation ? '确认保存' : undefined,
          secondaryActionLabel: result.command.requiresConfirmation ? '取消' : undefined,
        })
      } catch (error) {
        await pushFloatingAssistantStatus({
          message: 'Agent 处理失败',
          detail: error instanceof Error ? error.message : '请稍后重试',
        })
      }
    }
  }, [customers, executeAssistant, interactions, isAssistantRunning, isOnline, modelClient, now, profileFields, pushFloatingAssistantStatus, repository, todos])

  useEffect(() => {
    let cancelled = false

    const consumeCommand = async () => {
      const result = await consumeFloatingAssistantCommand({ bridge: overlayBridge, platform: overlayPlatform })
      if (cancelled) return

      if (result.action === 'overlay-voice-start' || result.action === 'foreground-voice-capture') {
        if (overlayVoiceActiveRef.current) return
        overlayVoiceActiveRef.current = true
        await pushFloatingAssistantStatus({
          message: '正在录音',
          detail: '松开发送，上滑取消',
        })
        const speechResult = await startHoldToTalk({ bridge: speechBridge, platform: speechPlatform })
        if (cancelled) return
        setNotice(speechResult.message)
        if (speechResult.status === 'recording') {
          if (speechResult.provider === 'system') {
            overlayVoiceActiveRef.current = false
            await pushFloatingAssistantStatus({
              message: '悬浮窗语音不可用',
              detail: '请确认讯飞语音配置可用，系统语音会弹出识别界面',
            })
            return
          }
          await pushFloatingAssistantStatus({
            message: '正在录音',
            detail: speechResult.message,
          })
          return
        }
        overlayVoiceActiveRef.current = false
        if (speechResult.status === 'recognized') {
          await overlayCommandRunnerRef.current(speechResult.text)
          return
        }
        await pushFloatingAssistantStatus({
          message: '录音未开始',
          detail: speechResult.message,
        })
        return
      }

      if (result.action === 'overlay-voice-stop') {
        if (!overlayVoiceActiveRef.current) return
        overlayVoiceActiveRef.current = false
        await pushFloatingAssistantStatus({
          message: '正在识别',
          detail: '正在整理语音文字',
        })
        const speechResult = await stopHoldToTalk({ bridge: speechBridge, platform: speechPlatform })
        if (cancelled) return
        setNotice(speechResult.message)
        if (speechResult.status === 'recognized') {
          await overlayCommandRunnerRef.current(speechResult.text)
          return
        }
        await pushFloatingAssistantStatus({
          message: '没有识别到语音',
          detail: speechResult.message,
        })
        return
      }

      if (result.action === 'overlay-voice-cancel') {
        overlayVoiceActiveRef.current = false
        const speechResult = await cancelHoldToTalk({ bridge: speechBridge, platform: speechPlatform })
        if (cancelled) return
        setNotice(speechResult.message)
        await pushFloatingAssistantStatus({
          message: '已取消录音',
          detail: speechResult.message,
        })
        return
      }

      if (result.action === 'overlay-confirm') {
        if (!assistantCommand?.requiresConfirmation) {
          await pushFloatingAssistantStatus({
            message: '没有待确认内容',
            detail: '请先说一句客户指令',
          })
          return
        }
        await confirmAssistantCommandRef.current({ navigateAfterSave: false })
        if (cancelled) return
        await pushFloatingAssistantStatus({
          message: '已保存',
          detail: assistantHistoryText(assistantCommand),
        })
        return
      }

      if (result.action === 'overlay-dismiss') {
        setAssistantCommand(null)
        setAssistantRunInfo(null)
        setAssistantMemory(null)
        await pushFloatingAssistantStatus({
          message: '已清除',
          detail: '等待下一句客户指令',
        })
        return
      }

      if (!result.command.trim()) return
      await overlayCommandRunnerRef.current(result.command)
    }

    const intervalId = window.setInterval(() => {
      void consumeCommand()
    }, overlayPollIntervalMs)

    void consumeCommand()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [
    assistantCommand,
    overlayBridge,
    overlayPlatform,
    overlayPollIntervalMs,
    pushFloatingAssistantStatus,
    speechBridge,
    speechPlatform,
  ])

  const startVoiceCapture = async (clientY: number) => {
    if (isAssistantRunning || voiceActiveRef.current) return

    voiceStartYRef.current = clientY
    voiceCancelingRef.current = false
    voiceActiveRef.current = true
    setVoiceCapture({ phase: 'starting', message: '准备录音' })

    const result = await startHoldToTalk({ bridge: speechBridge, platform: speechPlatform })
    setNotice(result.message)

    if (result.status === 'recording') {
      setVoiceCapture({ phase: 'recording', message: result.message, provider: result.provider })
      return
    }

    voiceActiveRef.current = false
    voiceStartYRef.current = null
    setVoiceCapture({ phase: 'idle', message: '' })
    if (result.status === 'recognized') setAssistantText(result.text)
  }

  const moveVoiceCapture = (clientY: number) => {
    if (!voiceActiveRef.current || voiceStartYRef.current === null) return

    const shouldCancel = voiceStartYRef.current - clientY > 56
    voiceCancelingRef.current = shouldCancel
    setVoiceCapture((current) => {
      if (current.phase !== 'recording' && current.phase !== 'canceling') return current
      return shouldCancel
        ? { ...current, phase: 'canceling', message: '松手取消' }
        : { ...current, phase: 'recording', message: current.provider === 'iflytek' ? '讯飞识别中，松开发送，上滑取消' : '系统语音识别中' }
    })
  }

  const endVoiceCapture = async () => {
    if (!voiceActiveRef.current) return

    const shouldCancel = voiceCancelingRef.current
    voiceActiveRef.current = false
    voiceStartYRef.current = null
    voiceCancelingRef.current = false

    if (shouldCancel) {
      const result = await cancelHoldToTalk({ bridge: speechBridge, platform: speechPlatform })
      setVoiceCapture({ phase: 'idle', message: '' })
      setNotice(result.message)
      return
    }

    setVoiceCapture((current) => ({ ...current, phase: 'recognizing', message: '正在整理语音文字' }))
    const result = await stopHoldToTalk({ bridge: speechBridge, platform: speechPlatform })
    setVoiceCapture({ phase: 'idle', message: '' })
    if (result.status === 'recognized') setAssistantText(result.text)
    setNotice(result.message)
  }

  const cancelVoiceCapture = async () => {
    if (!voiceActiveRef.current) return

    voiceActiveRef.current = false
    voiceStartYRef.current = null
    voiceCancelingRef.current = false
    const result = await cancelHoldToTalk({ bridge: speechBridge, platform: speechPlatform })
    setVoiceCapture({ phase: 'idle', message: '' })
    setNotice(result.message)
  }

  const enableFloatingAssistant = async () => {
    setNotice('正在检查系统悬浮球授权')
    const result = await startFloatingAssistant({
      bridge: overlayBridge,
      platform: overlayPlatform,
      config: overlayConfig,
      todos: openOverlayTodos,
    })
    setFloatingAssistantState(overlayStateFromResult(result.status))
    setNotice(result.message)
  }

  const updateOverlayConfig = (config: Partial<OverlayConfig>) => {
    const nextConfig = normalizeOverlayConfig({ ...overlayConfig, ...config })
    repository.saveOverlayConfig(nextConfig)
    setOverlayConfig(nextConfig)
    setNotice('悬浮窗设置已保存')
  }

  const saveProfileFields = (fields: ProfileFieldDefinition[]) => {
    const normalized = normalizeProfileFieldDefinitions(fields)
    repository.saveProfileFieldDefinitions(normalized)
    setProfileFields(normalized)
    setNotice('客户画像字段已保存')
  }

  const disableFloatingAssistant = async () => {
    const result = await stopFloatingAssistant({ bridge: overlayBridge, platform: overlayPlatform })
    setFloatingAssistantState(overlayStateFromResult(result.status))
    setNotice(result.message)
  }

  const saveCustomerList = (nextCustomers: Customer[]) => {
    setCustomers(nextCustomers)
    nextCustomers.forEach((customer) => repository.saveCustomer(customer))
  }

  const createManualCustomer = (draft: CustomerFormDraft) => {
    const customer = createCustomerFromDraft(
      {
        name: draft.name,
        city: draft.city,
        budgetWan: draft.budgetWan ?? undefined,
        areaSqm: draft.areaSqm ?? undefined,
        sourceChannel: draft.sourceChannel,
        stylePreference: draft.stylePreference,
        needs: draft.needs,
      },
      now,
    )
    const nextCustomers = [customer, ...customers]
    saveCustomerList(nextCustomers)
    setIsCustomerFormOpen(false)
    setSelectedCustomerId(null)
    setNotice('客户已手动保存到本地库')
  }

  const updateCustomer = (updatedCustomer: Customer) => {
    const nextCustomers = customers.map((customer) => (customer.id === updatedCustomer.id ? updatedCustomer : customer))
    saveCustomerList(nextCustomers)
    setSelectedCustomerId(updatedCustomer.id)
    setNotice('客户档案已更新')
  }

  const saveReminderSchedule = useCallback((todo: Todo, result: ReminderScheduleResult) => {
    if (!todo.dueAt) return

    const reminderId = `reminder-${todo.id}`
    repository.saveReminder({
      id: reminderId,
      todoId: todo.id,
      customerId: todo.customerId ?? '',
      title: todo.title,
      scheduledAt: todo.dueAt,
      channel:
        result.status === 'scheduled' && result.calendarEvent?.status === 'linked'
          ? 'app-and-calendar'
          : 'app',
      status: result.status === 'scheduled' ? 'scheduled' : 'app-only',
      createdAt: now,
    })

    if (result.status !== 'scheduled' || !result.calendarEvent) return

    repository.saveCalendarEventLink({
      id: `calendar-link-${todo.id}`,
      reminderId,
      todoId: todo.id,
      providerEventId: result.calendarEvent.status === 'linked' ? result.calendarEvent.providerEventId : '',
      calendarId: result.calendarEvent.status === 'linked' ? result.calendarEvent.calendarId : '',
      status: result.calendarEvent.status,
      failureReason: result.calendarEvent.status === 'failed' ? result.calendarEvent.failureReason : null,
      createdAt: now,
    })
  }, [now, repository])

  const createTodoForCustomer = async (customerId: string, draft: TodoFormDraft) => {
    const nextTodoNumber = todos.length + 1
    const todo: Todo = {
      id: `todo-${customerId}-${nextTodoNumber}`,
      customerId,
      title: draft.title.trim() || '跟进客户',
      dueAt: draft.dueAt,
      completed: false,
    }
    const nextTodos = [...todos, todo]
    setTodos(nextTodos)
    repository.saveTodo(todo)
    setNotice('客户待办已添加，正在调度系统通知')
    const result = await reminderScheduler({
      todo,
      customerName: customers.find((customer) => customer.id === customerId)?.name,
      now,
    })
    saveReminderSchedule(todo, result)
    setNotice(reminderNotice('客户待办已添加', result))
  }

  const createInteractionForCustomer = (customerId: string, draft: InteractionFormDraft) => {
    const customer = customers.find((entry) => entry.id === customerId)
    if (!customer) return

    const result = createInteractionRecord(customer, {
      channel: draft.channel,
      summary: draft.summary,
      happenedAt: draft.happenedAt || now,
      nextAction: draft.nextAction,
      now,
    })
    const nextCustomers = customers.map((entry) => (entry.id === customerId ? result.customer : entry))
    const nextInteractions = [result.interaction, ...interactions]

    setCustomers(nextCustomers)
    setInteractions(nextInteractions)
    repository.saveCustomer(result.customer)
    repository.saveInteraction(result.interaction)
    setNotice('客户沟通记录已保存')
  }

  const deleteCustomer = (customerId: string) => {
    const target = customers.find((customer) => customer.id === customerId)
    if (!target) return

    const recycledCustomer: Customer = {
      ...target,
      deletedAt: now,
      updatedAt: now,
    }
    const nextCustomers = customers.filter((customer) => customer.id !== customerId)
    setCustomers(nextCustomers)
    setRecycledCustomers((current) => [recycledCustomer, ...current.filter((customer) => customer.id !== customerId)])
    repository.saveCustomer(recycledCustomer)
    setSelectedCustomerId(null)
    setNotice('客户已移入回收站')
  }

  const restoreCustomer = (customerId: string) => {
    const target = recycledCustomers.find((customer) => customer.id === customerId)
    if (!target) return

    const restoredCustomer: Customer = {
      ...target,
      deletedAt: null,
      updatedAt: now,
    }
    setRecycledCustomers((current) => current.filter((customer) => customer.id !== customerId))
    setCustomers((current) => [restoredCustomer, ...current.filter((customer) => customer.id !== customerId)])
    repository.saveCustomer(restoredCustomer)
    setNotice('客户已从回收站恢复')
  }

  const confirmAssistantCommand = useCallback(async (options?: { navigateAfterSave?: boolean }) => {
    if (!assistantCommand || !assistantCommand.requiresConfirmation) return
    const navigateAfterSave = options?.navigateAfterSave ?? true

    if (assistantCommand.kind === 'batch-actions') {
      let nextCustomers = customers
      let nextTodos = todos
      let savedActionCount = 0

      for (const action of assistantCommand.payload.actions) {
        if (action.kind === 'update-customer') {
          const result = applyCustomerUpdateToBestMatch(nextCustomers, {
            ...action.payload,
            now,
          })
          nextCustomers = result.customers
          if (result.updatedCustomer) savedActionCount += 1
          continue
        }

        if (action.kind === 'create-reminder') {
          const nextTodoNumber = nextTodos.length + 1
          const todo: Todo = {
            id: `todo-reminder-${nextTodoNumber}`,
            customerId: action.payload.customerId,
            title: action.payload.title,
            dueAt: action.payload.scheduledAt,
            completed: false,
          }
          nextTodos = [...nextTodos, todo]
          repository.saveTodo(todo)
          const customerName = nextCustomers.find((customer) => customer.id === todo.customerId)?.name
          const result = await reminderScheduler({ todo, customerName, now })
          saveReminderSchedule(todo, result)
          savedActionCount += 1
          continue
        }

        if (action.kind === 'create-interaction') {
          const target = nextCustomers.find((customer) => customer.id === action.payload.customerId)
          if (!target) continue
          const result = createInteractionRecord(target, {
            channel: action.payload.channel,
            summary: action.payload.summary,
            happenedAt: action.payload.happenedAt,
            nextAction: action.payload.nextAction,
            now,
          })
          nextCustomers = nextCustomers.map((customer) => (customer.id === target.id ? result.customer : customer))
          const nextInteractions = [result.interaction, ...interactions]
          setInteractions(nextInteractions)
          repository.saveInteraction(result.interaction)
          savedActionCount += 1
        }
      }

      setCustomers(nextCustomers)
      setTodos(nextTodos)
      nextCustomers.forEach((customer) => repository.saveCustomer(customer))
      setNotice(`已保存 ${savedActionCount} 个 Agent 动作`)
      if (navigateAfterSave) setActiveTab('customers')
      setAssistantMemory(null)
    }

    if (assistantCommand.kind === 'create-customer') {
      const customer = createCustomerFromDraft(assistantCommand.payload, now)
      const initialSummary = assistantCommand.payload.firstInteractionSummary?.trim()
      const interactionResult = initialSummary
        ? createInteractionRecord(customer, {
            channel: 'wechat',
            summary: initialSummary,
            happenedAt: assistantCommand.payload.firstInteractionAt ?? now,
            nextAction: assistantCommand.payload.nextAction ?? '',
            now,
          })
        : null
      const savedCustomer = interactionResult?.customer ?? customer
      const nextCustomers = [...customers, savedCustomer]
      setCustomers(nextCustomers)
      repository.saveCustomer(savedCustomer)
      if (interactionResult) {
        const nextInteractions = [interactionResult.interaction, ...interactions]
        setInteractions(nextInteractions)
        repository.saveInteraction(interactionResult.interaction)
      }
      setNotice('客户已保存到本地库')
      if (navigateAfterSave) setActiveTab('customers')
      setAssistantMemory(null)
    }

    if (assistantCommand.kind === 'update-customer') {
      const result = applyCustomerUpdateToBestMatch(customers, {
        ...assistantCommand.payload,
        now,
      })
      setCustomers(result.customers)
      result.customers.forEach((customer) => repository.saveCustomer(customer))
      setNotice(result.updatedCustomer ? '客户需求已更新' : '没有找到可更新的客户')
      if (navigateAfterSave) setActiveTab('customers')
      setAssistantMemory(null)
    }

    if (assistantCommand.kind === 'create-interaction') {
      const target = customers.find((customer) => customer.id === assistantCommand.payload.customerId)
      if (target) {
        const result = createInteractionRecord(target, {
          channel: assistantCommand.payload.channel,
          summary: assistantCommand.payload.summary,
          happenedAt: assistantCommand.payload.happenedAt,
          nextAction: assistantCommand.payload.nextAction,
          now,
        })
        const nextCustomers = customers.map((customer) => (customer.id === target.id ? result.customer : customer))
        const nextInteractions = [result.interaction, ...interactions]

        setCustomers(nextCustomers)
        setInteractions(nextInteractions)
        repository.saveCustomer(result.customer)
        repository.saveInteraction(result.interaction)
        setNotice('客户沟通记录已保存')
        if (navigateAfterSave) {
          setActiveTab('customers')
          setSelectedCustomerId(target.id)
        }
      } else {
        setNotice('没有找到可保存沟通的客户')
      }
      setAssistantMemory(null)
    }

    if (assistantCommand.kind === 'create-reminder') {
      const nextTodoNumber = todos.length + 1
      const todo: Todo = {
        id: `todo-reminder-${nextTodoNumber}`,
        customerId: assistantCommand.payload.customerId,
        title: assistantCommand.payload.title,
        dueAt: assistantCommand.payload.scheduledAt,
        completed: false,
      }
      const nextTodos = [...todos, todo]
      setTodos(nextTodos)
      repository.saveTodo(todo)
      const customerName = customers.find((customer) => customer.id === todo.customerId)?.name
      const result = await reminderScheduler({ todo, customerName, now })
      saveReminderSchedule(todo, result)
      setNotice(reminderNotice('已创建 app 内提醒', result))
      if (navigateAfterSave) setActiveTab('todos')
      setAssistantMemory(null)
    }

    setAssistantCommand(null)
    setAssistantRunInfo(null)
    setAssistantText('')
  }, [
    assistantCommand,
    customers,
    interactions,
    now,
    reminderScheduler,
    repository,
    saveReminderSchedule,
    todos,
  ])
  useEffect(() => {
    confirmAssistantCommandRef.current = confirmAssistantCommand
  }, [confirmAssistantCommand])

  const completeTodo = (todoId: string) => {
    const nextTodos = todos.map((todo) => (todo.id === todoId ? { ...todo, completed: true } : todo))
    setTodos(nextTodos)
    repository.completeTodo(todoId)
    setNotice('待办已完成')
  }

  const saveModelSettings = async (nextSettings: { model: string }) => {
    const normalized = normalizeModelConfig({
      provider: 'openai-compatible',
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: nextSettings.model,
    })
    repository.saveModelConfig(normalized)
    setModelConfig(normalized)
    setIsModelApiKeyConfigured(true)
    setNotice('模型配置已保存')
  }

  const testModelConnection = async (nextSettings: { model: string }) => {
    const normalized = normalizeModelConfig({
      provider: 'openai-compatible',
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: nextSettings.model,
    })
    const result = await modelConnectionTester({
      apiKey: activeModelApiKey(repository.getModelApiKey()),
      baseUrl: normalized.baseUrl,
      model: normalized.model,
    })
    setNotice(result.ok ? '模型连接测试通过' : `模型连接测试失败：${result.message ?? '请检查配置'}`)
  }

  const loadModelOptions = async (nextSettings: { model: string }) => {
    const normalized = normalizeModelConfig({
      provider: 'openai-compatible',
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: nextSettings.model,
    })
    setNotice('正在获取模型列表')
    const result = await modelListFetcher({
      apiKey: activeModelApiKey(repository.getModelApiKey()),
      baseUrl: normalized.baseUrl,
      model: normalized.model,
    })

    if (!result.ok) {
      setNotice(`模型列表获取失败：${result.message ?? '请检查配置'}`)
      return
    }

    const models = result.models ?? []
    setModelOptions(models)
    setNotice(models.length > 0 ? `已获取 ${models.length} 个模型` : '模型列表为空，请手动填写模型 ID')
  }

  const renderActiveView = () => {
    if (activeTab === 'customers') {
      const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId)
      if (selectedCustomer) {
        const selectedHealthScore = healthScores.find((score) => score.customerId === selectedCustomer.id) ?? {
          customerId: selectedCustomer.id,
          score: 80,
          reasons: ['状态健康'],
        }
        return (
          <CustomerDetailView
            customer={selectedCustomer}
            healthScore={selectedHealthScore}
            profileFields={profileFields}
            now={now}
            todos={todos.filter((todo) => todo.customerId === selectedCustomer.id)}
            interactions={interactions.filter((interaction) => interaction.customerId === selectedCustomer.id)}
            onBack={() => setSelectedCustomerId(null)}
            onUpdate={updateCustomer}
            onAddTodo={(draft) => createTodoForCustomer(selectedCustomer.id, draft)}
            onAddInteraction={(draft) => createInteractionForCustomer(selectedCustomer.id, draft)}
            onDelete={() => deleteCustomer(selectedCustomer.id)}
          />
        )
      }
      return (
        <CustomersView
          customers={customers}
          healthScores={healthScores}
          isFormOpen={isCustomerFormOpen}
          onCreateClick={() => setIsCustomerFormOpen(true)}
          onCancelCreate={() => setIsCustomerFormOpen(false)}
          onCreateCustomer={createManualCustomer}
          onSelectCustomer={setSelectedCustomerId}
        />
      )
    }
    if (activeTab === 'todos') {
      return <TodosView customers={customers} todos={todos} onComplete={completeTodo} />
    }
    if (activeTab === 'agent') {
      return (
        <AgentChatView
          command={assistantCommand}
          runInfo={assistantRunInfo}
          isAssistantRunning={isAssistantRunning}
          runningModelDisclosure={runningModelDisclosure}
          streamText={assistantStreamText}
          processEvents={assistantProcessEvents}
          history={assistantHistory}
          text={assistantText}
          voiceCapture={voiceCapture}
          onChangeText={setAssistantText}
          onRun={runAssistant}
          onVoicePressStart={startVoiceCapture}
          onVoicePressMove={moveVoiceCapture}
          onVoicePressEnd={endVoiceCapture}
          onVoicePressCancel={cancelVoiceCapture}
          onConfirm={confirmAssistantCommand}
          onDismiss={() => {
            setAssistantCommand(null)
            setAssistantRunInfo(null)
            setAssistantMemory(null)
          }}
        />
      )
    }
    if (activeTab === 'settings') {
      return (
        <SettingsView
          isModelApiKeyConfigured={isModelApiKeyConfigured}
          modelConfig={modelConfig}
          modelOptions={modelOptions}
          floatingAssistantState={floatingAssistantState}
          overlayConfig={overlayConfig}
          profileFields={profileFields}
          onEnableFloatingAssistant={enableFloatingAssistant}
          onDisableFloatingAssistant={disableFloatingAssistant}
          onUpdateOverlayConfig={updateOverlayConfig}
          onSaveProfileFields={saveProfileFields}
          onSaveModelSettings={saveModelSettings}
          onTestModelConnection={testModelConnection}
          onLoadModelOptions={loadModelOptions}
          recycledCustomers={recycledCustomers}
          onRestoreCustomer={restoreCustomer}
        />
      )
    }
    return <WorkspaceView customers={customers} todos={todos} healthScores={healthScores} />
  }

  return (
    <div className="app-shell">
      <main className="phone-frame" aria-label="家装客户管理个人助理">
        <header className="topbar">
          <div>
            <p className="eyebrow">KCUST AI</p>
            <h1>{activeTab === 'workspace' ? '客户工作台' : navItems.find((item) => item.id === activeTab)?.label}</h1>
          </div>
          <HoldVoiceButton
            className="icon-button voice-icon-button"
            disabled={isAssistantRunning}
            onPressStart={startVoiceCapture}
            onPressMove={moveVoiceCapture}
            onPressEnd={endVoiceCapture}
            onPressCancel={cancelVoiceCapture}
          >
            <Mic size={18} />
          </HoldVoiceButton>
        </header>

        <section className="notice-bar" aria-live="polite">
          <Sparkles size={16} />
          <span>{notice}</span>
        </section>

        <section
          className={`screen-content ${activeTab === 'agent' ? 'agent-screen-content' : ''}`}
          key={`${activeTab}-${selectedCustomerId ?? 'root'}`}
        >
          {renderActiveView()}
        </section>

        <nav className="bottom-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon
            const selected = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                className={selected ? 'selected' : ''}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </main>
    </div>
  )
}

function WorkspaceView({
  customers,
  todos,
  healthScores,
}: {
  customers: Customer[]
  todos: Todo[]
  healthScores: ReturnType<typeof scoreCustomerHealth>[]
}) {
  const openTodos = todos.filter((todo) => !todo.completed)
  const priorityCustomers = customers
    .map((customer) => ({
      customer,
      health: healthScores.find((score) => score.customerId === customer.id),
    }))
    .sort((left, right) => (left.health?.score ?? 100) - (right.health?.score ?? 100))
    .slice(0, 3)

  return (
    <div className="stack">
      <section className="hero-panel">
        <div>
          <p>今日待跟进</p>
          <strong>{openTodos.length}</strong>
        </div>
        <div>
          <p>重点客户</p>
          <strong>{customers.length}</strong>
        </div>
        <div>
          <p>低健康度</p>
          <strong>{healthScores.filter((score) => score.score < 75).length}</strong>
        </div>
      </section>

      <section className="section-block">
        <SectionTitle icon={CalendarClock} title="下一步动作" />
        <div className="todo-list">
          {openTodos.slice(0, 3).map((todo) => (
            <div className="todo-row" key={todo.id}>
              <div>
                <strong>{todo.title}</strong>
                <span>{formatDateTime(todo.dueAt)}</span>
              </div>
              <Bell size={18} />
            </div>
          ))}
        </div>
      </section>

      <section className="section-block">
        <SectionTitle icon={CircleUserRound} title="重点客户" />
        <div className="customer-list">
          {priorityCustomers.map(({ customer, health }) => (
            <CustomerCard customer={customer} healthScore={health?.score ?? 80} key={customer.id} />
          ))}
        </div>
      </section>
    </div>
  )
}

function CustomersView({
  customers,
  healthScores,
  isFormOpen,
  onCreateClick,
  onCancelCreate,
  onCreateCustomer,
  onSelectCustomer,
}: {
  customers: Customer[]
  healthScores: ReturnType<typeof scoreCustomerHealth>[]
  isFormOpen: boolean
  onCreateClick: () => void
  onCancelCreate: () => void
  onCreateCustomer: (draft: {
    name: string
    city: string
    budgetWan: number | null
    areaSqm: number | null
    sourceChannel: string
    stylePreference: string
    needs: string[]
  }) => void
  onSelectCustomer: (customerId: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = customers.filter((customer) => {
    const text = `${customer.name}${customer.city}${customer.stage}${customer.sourceChannel ?? ''}${customer.stylePreference ?? ''}${customer.needs.join('')}`
    return text.includes(query.trim())
  })

  return (
    <div className="stack">
      <div className="toolbar-row">
        <button type="button" className="primary-action" onClick={onCreateClick}>
          <Plus size={16} />
          手动新增
        </button>
      </div>
      {isFormOpen && <CustomerCreateForm onCancel={onCancelCreate} onSubmit={onCreateCustomer} />}
      <label className="search-box">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索客户、城市、阶段、需求" />
      </label>
      <div className="customer-list">
        {filtered.map((customer) => (
          <CustomerCard
            customer={customer}
            healthScore={healthScores.find((score) => score.customerId === customer.id)?.score ?? 80}
            onOpen={() => onSelectCustomer(customer.id)}
            key={customer.id}
          />
        ))}
      </div>
    </div>
  )
}

function CustomerCreateForm({
  onCancel,
  onSubmit,
  initialCustomer,
  submitLabel = '保存客户',
  ariaLabel = '手动新增客户',
}: {
  onCancel: () => void
  onSubmit: (draft: CustomerFormDraft) => void
  initialCustomer?: Customer
  submitLabel?: string
  ariaLabel?: string
}) {
  const [name, setName] = useState(initialCustomer?.name ?? '')
  const [city, setCity] = useState(initialCustomer?.city ?? '')
  const [budgetWan, setBudgetWan] = useState(initialCustomer?.budgetWan ? String(initialCustomer.budgetWan) : '')
  const [areaSqm, setAreaSqm] = useState(initialCustomer?.areaSqm ? String(initialCustomer.areaSqm) : '')
  const [sourceChannel, setSourceChannel] = useState(initialCustomer?.sourceChannel ?? '')
  const [stylePreference, setStylePreference] = useState(initialCustomer?.stylePreference ?? '')
  const [needs, setNeeds] = useState(initialCustomer?.needs.join('、') ?? '')

  const submit = () => {
    onSubmit({
      name,
      city,
      budgetWan: budgetWan ? Number(budgetWan) : null,
      areaSqm: areaSqm ? Number(areaSqm) : null,
      sourceChannel,
      stylePreference,
      needs: splitNeeds(needs),
    })
  }

  return (
    <section className="manual-form" aria-label={ariaLabel}>
      <label>
        <span>客户姓名</span>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="客户姓名" />
      </label>
      <label>
        <span>城市</span>
        <input value={city} onChange={(event) => setCity(event.target.value)} aria-label="城市" />
      </label>
      <label>
        <span>预算</span>
        <input value={budgetWan} onChange={(event) => setBudgetWan(event.target.value)} inputMode="numeric" aria-label="预算" />
      </label>
      <label>
        <span>面积</span>
        <input value={areaSqm} onChange={(event) => setAreaSqm(event.target.value)} inputMode="numeric" aria-label="面积" />
      </label>
      <label>
        <span>来源渠道</span>
        <input value={sourceChannel} onChange={(event) => setSourceChannel(event.target.value)} aria-label="来源渠道" />
      </label>
      <label>
        <span>风格偏好</span>
        <input value={stylePreference} onChange={(event) => setStylePreference(event.target.value)} aria-label="风格偏好" />
      </label>
      <label className="wide">
        <span>需求标签</span>
        <input value={needs} onChange={(event) => setNeeds(event.target.value)} aria-label="需求标签" />
      </label>
      <div className="form-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary" onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </section>
  )
}

function CustomerDetailView({
  customer,
  healthScore,
  profileFields,
  now,
  todos,
  interactions,
  onBack,
  onUpdate,
  onAddTodo,
  onAddInteraction,
  onDelete,
}: {
  customer: Customer
  healthScore: HealthScore
  profileFields: ProfileFieldDefinition[]
  now: string
  todos: Todo[]
  interactions: Interaction[]
  onBack: () => void
  onUpdate: (customer: Customer) => void
  onAddTodo: (draft: TodoFormDraft) => void
  onAddInteraction: (draft: InteractionFormDraft) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isAddingTodo, setIsAddingTodo] = useState(false)
  const [isAddingInteraction, setIsAddingInteraction] = useState(false)
  const nextStepSuggestion = buildNextStepSuggestion(customer, todos, now)
  const timelineInteractions = sortInteractionsForTimeline(interactions)
  const summaryProfileFields = getSummaryProfileFields(profileFields)

  const saveEdits = (draft: CustomerFormDraft) => {
    onUpdate({
      ...customer,
      name: draft.name.trim() || customer.name,
      city: draft.city.trim() || customer.city,
      budgetWan: draft.budgetWan,
      areaSqm: draft.areaSqm,
      sourceChannel: draft.sourceChannel.trim(),
      stylePreference: draft.stylePreference.trim(),
      needs: draft.needs,
      updatedAt: now,
    })
    setIsEditing(false)
  }

  const saveTodo = (draft: TodoFormDraft) => {
    onAddTodo(draft)
    setIsAddingTodo(false)
  }

  const saveInteraction = (draft: InteractionFormDraft) => {
    onAddInteraction(draft)
    setIsAddingInteraction(false)
  }

  return (
    <div className="stack">
      <div className="detail-actions">
        <button type="button" className="ghost-action" onClick={onBack}>
          返回客户列表
        </button>
        <div className="detail-action-group">
          <button type="button" className="ghost-action" onClick={() => setIsAddingInteraction(true)}>
            <Plus size={16} />
            添加沟通
          </button>
          <button type="button" className="ghost-action" onClick={() => setIsAddingTodo(true)}>
            <CalendarClock size={16} />
            添加待办
          </button>
          <button type="button" className="primary-action" onClick={() => setIsEditing(true)}>
            <Pencil size={16} />
            编辑客户
          </button>
        </div>
      </div>
      {isAddingTodo && (
        <CustomerTodoForm
          onCancel={() => setIsAddingTodo(false)}
          onSubmit={saveTodo}
        />
      )}
      {isAddingInteraction && (
        <InteractionForm
          onCancel={() => setIsAddingInteraction(false)}
          onSubmit={saveInteraction}
        />
      )}
      {isEditing && (
        <CustomerCreateForm
          ariaLabel="编辑客户档案"
          initialCustomer={customer}
          onCancel={() => setIsEditing(false)}
          onSubmit={saveEdits}
          submitLabel="保存修改"
        />
      )}
      <section className="detail-hero">
        <div>
          <h2>{customer.name}客户档案</h2>
          <p>
            {customer.city} · {customer.propertyType || '房型待补充'} · {customer.areaSqm ?? '-'}平
          </p>
        </div>
        <span className="stage-pill">{customer.stage}</span>
      </section>
      <section className="section-block" aria-label="画像摘要">
        <SectionTitle icon={CircleUserRound} title="画像摘要" />
        <div className="detail-grid">
          {summaryProfileFields.map((field) => (
            <div key={field.id}>
              <span>{field.label}</span>
              <strong>{formatProfileFieldValue(getCustomerProfileFieldValue(customer, field), field)}</strong>
            </div>
          ))}
          <div>
            <span>健康度</span>
            <strong>{healthScore.score}</strong>
          </div>
        </div>
        <div className="tags detail-tags">
          {customer.needs.map((need) => (
            <span key={need}>{need}</span>
          ))}
        </div>
      </section>
      <section className="section-block">
        <SectionTitle icon={Sparkles} title="AI 建议" />
        <div className="insight-panel">
          <div>
            <strong>健康度原因</strong>
            <div className="reason-list">
              {healthScore.reasons.map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
          </div>
          <div>
            <strong>下一步建议</strong>
            <p>{nextStepSuggestion}</p>
          </div>
        </div>
      </section>
      <section className="section-block">
        <SectionTitle icon={CalendarClock} title="沟通时间线" />
        <div className="timeline">
          {timelineInteractions.length === 0 && (
            <div>
              <strong>最近沟通</strong>
              <span>{customer.notes || '暂无备注，建议补齐沟通重点。'}</span>
            </div>
          )}
          {timelineInteractions.map((interaction) => (
            <div key={interaction.id}>
              <strong>{channelLabel(interaction.channel)} · {formatDateTime(interaction.happenedAt)}</strong>
              <span>{interaction.summary}</span>
              {interaction.nextAction && <span>下一步：{interaction.nextAction}</span>}
            </div>
          ))}
          {todos.map((todo) => (
            <div key={todo.id}>
              <strong>{todo.title}</strong>
              <span>{formatDateTime(todo.dueAt)}</span>
            </div>
          ))}
        </div>
      </section>
      <button type="button" className="danger-action" onClick={onDelete}>
        删除客户
      </button>
    </div>
  )
}

function InteractionForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (draft: InteractionFormDraft) => void
}) {
  const [channel, setChannel] = useState<Interaction['channel']>('wechat')
  const [happenedAt, setHappenedAt] = useState('2026-05-27T10:30')
  const [summary, setSummary] = useState('')
  const [nextAction, setNextAction] = useState('')

  const submit = () => {
    onSubmit({ channel, happenedAt, summary, nextAction })
  }

  return (
    <section className="manual-form todo-form" aria-label="添加沟通记录">
      <label className="wide">
        <span>沟通渠道</span>
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value as Interaction['channel'])}
          aria-label="沟通渠道"
        >
          <option value="wechat">微信</option>
          <option value="phone">电话</option>
          <option value="site-visit">量房/现场</option>
          <option value="meeting">会议</option>
          <option value="note">备注</option>
        </select>
      </label>
      <label className="wide">
        <span>沟通时间</span>
        <input
          value={happenedAt}
          onChange={(event) => setHappenedAt(event.target.value)}
          type="datetime-local"
          aria-label="沟通时间"
        />
      </label>
      <label className="wide">
        <span>沟通摘要</span>
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} aria-label="沟通摘要" />
      </label>
      <label className="wide">
        <span>下一步动作</span>
        <input value={nextAction} onChange={(event) => setNextAction(event.target.value)} aria-label="下一步动作" />
      </label>
      <div className="form-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary" onClick={submit}>
          保存沟通
        </button>
      </div>
    </section>
  )
}

function CustomerTodoForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (draft: TodoFormDraft) => void
}) {
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')

  const submit = () => {
    onSubmit({
      title,
      dueAt: dueAt || null,
    })
  }

  return (
    <section className="manual-form todo-form" aria-label="添加客户待办">
      <label className="wide">
        <span>待办标题</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="待办标题" />
      </label>
      <label className="wide">
        <span>提醒时间</span>
        <input
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          type="datetime-local"
          aria-label="提醒时间"
        />
      </label>
      <div className="form-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary" onClick={submit}>
          保存待办
        </button>
      </div>
    </section>
  )
}

function TodosView({
  customers,
  todos,
  onComplete,
}: {
  customers: Customer[]
  todos: Todo[]
  onComplete: (todoId: string) => void
}) {
  return (
    <div className="stack">
      {todos.map((todo) => {
        const customer = customers.find((entry) => entry.id === todo.customerId)
        return (
          <div className={`todo-detail ${todo.completed ? 'done' : ''}`} key={todo.id}>
            <div>
              <strong>{todo.title}</strong>
              <span>{customer?.name ?? '未关联客户'} · {formatDateTime(todo.dueAt)}</span>
            </div>
            <button type="button" onClick={() => onComplete(todo.id)} disabled={todo.completed}>
              <CheckCircle2 size={18} />
              {todo.completed ? '已完成' : '完成'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function SettingsView({
  isModelApiKeyConfigured,
  modelConfig,
  modelOptions,
  floatingAssistantState,
  overlayConfig,
  profileFields,
  onEnableFloatingAssistant,
  onDisableFloatingAssistant,
  onUpdateOverlayConfig,
  onSaveProfileFields,
  onSaveModelSettings,
  onTestModelConnection,
  onLoadModelOptions,
  recycledCustomers,
  onRestoreCustomer,
}: {
  isModelApiKeyConfigured: boolean
  modelConfig: ModelConfig
  modelOptions: string[]
  floatingAssistantState: FloatingAssistantState
  overlayConfig: OverlayConfig
  profileFields: ProfileFieldDefinition[]
  onEnableFloatingAssistant: () => void | Promise<void>
  onDisableFloatingAssistant: () => void | Promise<void>
  onUpdateOverlayConfig: (config: Partial<OverlayConfig>) => void
  onSaveProfileFields: (fields: ProfileFieldDefinition[]) => void
  onSaveModelSettings: (settings: { model: string }) => void | Promise<void>
  onTestModelConnection: (settings: { model: string }) => void | Promise<void>
  onLoadModelOptions: (settings: { model: string }) => void | Promise<void>
  recycledCustomers: Customer[]
  onRestoreCustomer: (customerId: string) => void
}) {
  const capabilities = getNativeCapabilityMatrix()
  const [modelDraft, setModelDraft] = useState(modelConfig.model)
  const settingsDraft = { model: modelDraft }
  const dockOptions: Array<{ value: OverlayConfig['dockSide']; label: string }> = [
    { value: 'auto', label: '自动' },
    { value: 'left', label: '左侧' },
    { value: 'right', label: '右侧' },
  ]
  const sizeOptions: Array<{ value: OverlayConfig['size']; label: string }> = [
    { value: 'small', label: '小' },
    { value: 'medium', label: '中' },
    { value: 'large', label: '大' },
  ]
  const opacityOptions: Array<{ value: OverlayConfig['opacity']; label: string }> = [
    { value: 0.6, label: '60%' },
    { value: 0.8, label: '80%' },
    { value: 1, label: '100%' },
  ]

  return (
    <div className="stack">
      <section className="setting-key-card">
        <div className="setting-title-row">
          <KeyRound size={20} />
          <strong>{isModelApiKeyConfigured ? '模型网关已内置' : '模型网关未启用'}</strong>
        </div>
        <p>Base URL 和 Key 已封装在本机应用内，只需要选择模型。</p>
        <label>
          <span>模型 ID</span>
          <input
            value={modelDraft}
            onChange={(event) => setModelDraft(event.target.value)}
            aria-label="模型 ID"
            placeholder="MiniMax-M3"
            list="model-id-options"
          />
          <datalist id="model-id-options">
            {modelOptions.map((model) => (
              <option value={model} key={model} />
            ))}
          </datalist>
        </label>
        {modelOptions.length > 0 && (
          <div className="model-option-list" aria-label="模型列表">
            {modelOptions.map((model) => (
              <button
                type="button"
                className={model === modelDraft ? 'selected' : ''}
                aria-label={`选择模型 ${model}`}
                onClick={() => setModelDraft(model)}
                key={model}
              >
                {model}
              </button>
            ))}
          </div>
        )}
        <div className="setting-actions">
          <button type="button" className="ghost-action" onClick={() => onLoadModelOptions(settingsDraft)}>
            获取模型列表
          </button>
          <button type="button" className="ghost-action" onClick={() => onTestModelConnection(settingsDraft)}>
            测试模型连接
          </button>
          <button type="button" className="primary-action" onClick={() => onSaveModelSettings(settingsDraft)}>
            保存模型配置
          </button>
        </div>
      </section>
      <ProfileFieldSettings fields={profileFields} onSave={onSaveProfileFields} />
      <section className="setting-key-card">
        <div className="setting-title-row">
          <CircleUserRound size={20} />
          <strong>回收站</strong>
        </div>
        {recycledCustomers.length === 0 && <p>暂无已删除客户。</p>}
        {recycledCustomers.map((customer) => (
          <div className="recycle-row" key={customer.id}>
            <span>{customer.name} · {customer.city}</span>
            <button type="button" className="ghost-action" onClick={() => onRestoreCustomer(customer.id)}>
              恢复{customer.name}
            </button>
          </div>
        ))}
      </section>
      {capabilities.map((capability) => (
        <div className="setting-card" key={capability.id}>
          {capabilityIcon(capability.id)}
          <div>
            <strong>{capability.name}</strong>
            <span>
              Android：{statusText(capability.androidStatus)} · Web：{statusText(capability.webStatus)} · 兜底：
              {capability.fallback}
            </span>
            {capability.id === 'overlay' && (
              <>
                <div className="setting-actions">
                  <span className="setting-state">状态：{floatingAssistantStateText(floatingAssistantState)}</span>
                  <button type="button" className="ghost-action" onClick={onEnableFloatingAssistant}>
                    开启悬浮球
                  </button>
                  <button type="button" className="ghost-action" onClick={onDisableFloatingAssistant}>
                    关闭悬浮球
                  </button>
                </div>
                <div className="overlay-setting-panel" aria-label="悬浮窗偏好">
                  <div>
                    <span>停靠侧</span>
                    <div className="setting-segment">
                      {dockOptions.map((option) => (
                        <button
                          type="button"
                          className={overlayConfig.dockSide === option.value ? 'selected' : ''}
                          onClick={() => onUpdateOverlayConfig({ dockSide: option.value })}
                          aria-label={`悬浮窗停靠${option.label}`}
                          key={option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span>大小</span>
                    <div className="setting-segment">
                      {sizeOptions.map((option) => (
                        <button
                          type="button"
                          className={overlayConfig.size === option.value ? 'selected' : ''}
                          onClick={() => onUpdateOverlayConfig({ size: option.value })}
                          aria-label={`悬浮窗大小${option.label}`}
                          key={option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span>透明度</span>
                    <div className="setting-segment">
                      {opacityOptions.map((option) => (
                        <button
                          type="button"
                          className={overlayConfig.opacity === option.value ? 'selected' : ''}
                          onClick={() => onUpdateOverlayConfig({ opacity: option.value })}
                          aria-label={`悬浮窗透明度${option.label}`}
                          key={option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProfileFieldSettings({
  fields,
  onSave,
}: {
  fields: ProfileFieldDefinition[]
  onSave: (fields: ProfileFieldDefinition[]) => void
}) {
  const [draftFields, setDraftFields] = useState<ProfileFieldDefinition[]>(fields)
  const fieldTypes: Array<{ value: ProfileFieldType; label: string }> = [
    { value: 'text', label: '文本' },
    { value: 'number', label: '数字' },
    { value: 'singleSelect', label: '单选' },
    { value: 'multiSelect', label: '多选' },
    { value: 'date', label: '日期' },
    { value: 'boolean', label: '是/否' },
  ]

  const updateField = (id: string, patch: Partial<ProfileFieldDefinition>) => {
    setDraftFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)))
  }
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null)
  const normalizedDraftFields = normalizeProfileFieldDefinitions(draftFields)
  const summaryFields = normalizedDraftFields.filter((field) => field.enabled && field.showInSummary)

  const applyTemplate = (templateFields: ProfileFieldDefinition[]) => {
    const nextFields = applyProfileFieldTemplate(draftFields, templateFields)
    setDraftFields(nextFields)
    setExpandedFieldId(null)
    onSave(nextFields)
  }

  const deleteField = (id: string) => {
    const nextFields = draftFields.filter((field) => field.id !== id)
    setDraftFields(nextFields)
    setExpandedFieldId((current) => (current === id ? null : current))
    onSave(nextFields)
  }

  const restoreDefaultFields = () => {
    const nextFields = applyProfileFieldTemplate(draftFields, DEFAULT_PROFILE_FIELD_DEFINITIONS)
    setDraftFields(nextFields)
    setExpandedFieldId(null)
    onSave(nextFields)
  }

  const addField = () => {
    const order = draftFields.length + 1
    const key = `customField${order}`
    const nextField: ProfileFieldDefinition = {
      id: `profile-field-${key}`,
      key,
      label: `自定义字段 ${order}`,
      description: '',
      type: 'text',
      enabled: true,
      showInSummary: true,
      extractionHint: '',
      order,
    }
    setDraftFields((current) => [...current, nextField])
    setExpandedFieldId(nextField.id)
  }

  return (
    <section className="setting-key-card profile-field-manager">
      <div className="setting-title-row">
        <CircleUserRound size={20} />
        <strong>客户画像字段</strong>
      </div>
      <p>这里配置客户详情“画像摘要”的字段，Agent 会按这些字段理解并写入客户资料。</p>
      <p className="profile-field-note">切换模板只调整摘要展示和 Agent 提取字段，不会删除已有客户资料；隐藏字段会保留在字段库里，可随时重新启用。</p>
      <div className="profile-template-panel" aria-label="画像字段模板">
        <span>选择模板</span>
        <div>
          {PROFILE_FIELD_TEMPLATES.map((template) => (
            <button
              type="button"
              aria-label={`套用模板 ${template.name}`}
              onClick={() => applyTemplate(template.fields)}
              key={template.id}
            >
              <strong>{template.name}</strong>
              <small>{template.description}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="profile-field-preview" aria-label="画像摘要预览">
        <span>摘要预览</span>
        <div>
          {summaryFields.map((field) => (
            <strong key={field.id}>{field.label}</strong>
          ))}
        </div>
      </div>
      <div className="profile-field-list">
        {draftFields.map((field, index) => {
          const displayIndex = index + 1
          const isExpanded = expandedFieldId === field.id
          return (
            <div className="profile-field-row" key={field.id}>
              <button
                type="button"
                className="profile-field-summary"
                aria-expanded={isExpanded}
                onClick={() => setExpandedFieldId(isExpanded ? null : field.id)}
              >
                <span className="profile-field-index">{displayIndex}</span>
                <span className="profile-field-main">
                  <strong>{field.label || '未命名字段'}</strong>
                  <small>{field.key || '未设置键名'} · {profileFieldTypeLabel(field.type)}</small>
                </span>
                <span className="profile-field-badges">
                  {field.enabled && <em>启用</em>}
                  {field.enabled && field.showInSummary && <em>摘要</em>}
                  {(!field.enabled || !field.showInSummary) && <em>隐藏</em>}
                </span>
              </button>
              {isExpanded && (
                <div className="profile-field-editor">
                  <div className="profile-field-grid">
                    <label>
                      <span>名称</span>
                      <input
                        aria-label={`画像字段 ${displayIndex} 名称`}
                        value={field.label}
                        onChange={(event) => updateField(field.id, { label: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>键名</span>
                      <input
                        aria-label={`画像字段 ${displayIndex} 键名`}
                        value={field.key}
                        onChange={(event) => updateField(field.id, { key: normalizeProfileFieldKey(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>类型</span>
                      <select
                        aria-label={`画像字段 ${displayIndex} 类型`}
                        value={field.type}
                        onChange={(event) => updateField(field.id, { type: event.target.value as ProfileFieldType })}
                      >
                        {fieldTypes.map((type) => (
                          <option value={type.value} key={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="profile-field-hint">
                      <span>提取说明</span>
                      <textarea
                        aria-label={`画像字段 ${displayIndex} 提取说明`}
                        value={field.extractionHint}
                        onChange={(event) => updateField(field.id, { extractionHint: event.target.value })}
                        rows={3}
                      />
                    </label>
                  </div>
                  <div className="profile-field-switches">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`画像字段 ${displayIndex} 启用`}
                        checked={field.enabled}
                        onChange={(event) => updateField(field.id, { enabled: event.target.checked })}
                      />
                      <span>启用</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`画像字段 ${displayIndex} 摘要展示`}
                        checked={field.showInSummary}
                        onChange={(event) => updateField(field.id, { showInSummary: event.target.checked })}
                      />
                      <span>摘要展示</span>
                    </label>
                  </div>
                  <div className="profile-field-editor-actions">
                    <span>删除后可通过模板或默认字段恢复。</span>
                    <button
                      type="button"
                      className="danger-action"
                      aria-label={`删除画像字段 ${displayIndex}`}
                      onClick={() => deleteField(field.id)}
                    >
                      <Trash2 size={15} />
                      删除字段
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="setting-actions">
        <button type="button" className="ghost-action" onClick={addField}>
          新增画像字段
        </button>
        <button type="button" className="ghost-action" onClick={restoreDefaultFields}>
          恢复默认字段
        </button>
        <button type="button" className="primary-action" onClick={() => onSave(draftFields)}>
          保存画像字段
        </button>
      </div>
    </section>
  )
}

function profileFieldTypeLabel(type: ProfileFieldType): string {
  if (type === 'number') return '数字'
  if (type === 'singleSelect') return '单选'
  if (type === 'multiSelect') return '多选'
  if (type === 'date') return '日期'
  if (type === 'boolean') return '是/否'
  return '文本'
}

function AgentChatView({
  command,
  runInfo,
  isAssistantRunning,
  runningModelDisclosure,
  streamText,
  processEvents,
  history,
  text,
  voiceCapture,
  onChangeText,
  onRun,
  onVoicePressStart,
  onVoicePressMove,
  onVoicePressEnd,
  onVoicePressCancel,
  onConfirm,
  onDismiss,
}: {
  command: AssistantCommand | null
  runInfo: AssistantRunInfo | null
  isAssistantRunning: boolean
  runningModelDisclosure: AgentModelDisclosure | null
  streamText: string
  processEvents: AssistantProcessEvent[]
  history: AssistantHistoryItem[]
  text: string
  voiceCapture: VoiceCaptureState
  onChangeText: (value: string) => void
  onRun: () => void | Promise<void>
  onVoicePressStart: (clientY: number) => void | Promise<void>
  onVoicePressMove: (clientY: number) => void
  onVoicePressEnd: () => void | Promise<void>
  onVoicePressCancel: () => void | Promise<void>
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="agent-chat-screen" aria-label="Agent 对话">
      <AssistantActionPanel
        command={command}
        runInfo={runInfo}
        isAssistantRunning={isAssistantRunning}
        runningModelDisclosure={runningModelDisclosure}
        streamText={streamText}
        processEvents={processEvents}
        history={history}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
      <AssistantComposer
        text={text}
        isRunning={isAssistantRunning}
        voiceCapture={voiceCapture}
        onChangeText={onChangeText}
        onRun={onRun}
        onVoicePressStart={onVoicePressStart}
        onVoicePressMove={onVoicePressMove}
        onVoicePressEnd={onVoicePressEnd}
        onVoicePressCancel={onVoicePressCancel}
      />
    </div>
  )
}

function AssistantActionPanel({
  command,
  runInfo,
  isAssistantRunning,
  runningModelDisclosure,
  streamText,
  processEvents,
  history,
  onConfirm,
  onDismiss,
}: {
  command: AssistantCommand | null
  runInfo: AssistantRunInfo | null
  isAssistantRunning: boolean
  runningModelDisclosure: AgentModelDisclosure | null
  streamText: string
  processEvents: AssistantProcessEvent[]
  history: AssistantHistoryItem[]
  onConfirm: () => void
  onDismiss: () => void
}) {
  const flowRef = useRef<HTMLDivElement>(null)
  const hasLiveResult = isAssistantRunning || processEvents.length > 0 || Boolean(command)

  useEffect(() => {
    const flow = flowRef.current
    if (!flow) return
    flow.scrollTop = flow.scrollHeight
  }, [command, history.length, isAssistantRunning, processEvents.length, streamText])

  return (
    <div className="agent-flow" aria-label="Agent 动作面板" ref={flowRef}>
      <AssistantConversationPreview history={history} />

      {hasLiveResult && (
        <section className="assistant-panel-section assistant-live-result" aria-label="当前 Agent 回复">
        <div className="assistant-section-heading">
          <Sparkles size={16} />
          <strong>当前回复</strong>
        </div>
        {isAssistantRunning && <AssistantRunningCard disclosure={runningModelDisclosure} streamText={streamText} />}
        {processEvents.length > 0 && <AgentProcessTimeline events={processEvents} />}
        {command && <ConfirmationCard command={command} runInfo={runInfo} onConfirm={onConfirm} onDismiss={onDismiss} />}
        </section>
      )}

      {!hasLiveResult && history.length === 0 && (
        <div className="assistant-empty-action">
          <strong>开始和 Agent 对话</strong>
          <span>你可以输入客户记录、查询、修改或提醒。</span>
        </div>
      )}
    </div>
  )
}

function AgentProcessTimeline({ events }: { events: AssistantProcessEvent[] }) {
  return (
    <div className="agent-process-timeline" aria-label="Agent 处理过程">
      {events.map((event) => (
        <div className={`agent-process-step ${event.kind}`} key={event.id}>
          <span className="agent-process-dot" />
          <div>
            <strong>{event.message}</strong>
            {event.detail && <span>{event.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function AssistantConversationPreview({ history }: { history: AssistantHistoryItem[] }) {
  if (history.length === 0) return null

  return (
    <section className="assistant-panel-section assistant-history" aria-label="最近对话">
      <div className="assistant-section-heading">
        <MessageCircle size={16} />
        <strong>最近对话</strong>
      </div>
      {history.slice(-20).map((item) => (
        <p className={item.role} key={item.id}>
          {item.text}
        </p>
      ))}
    </section>
  )
}

function AssistantComposer({
  text,
  isRunning,
  voiceCapture,
  onChangeText,
  onRun,
  onVoicePressStart,
  onVoicePressMove,
  onVoicePressEnd,
  onVoicePressCancel,
}: {
  text: string
  isRunning: boolean
  voiceCapture: VoiceCaptureState
  onChangeText: (value: string) => void
  onRun: () => void | Promise<void>
  onVoicePressStart: (clientY: number) => void | Promise<void>
  onVoicePressMove: (clientY: number) => void
  onVoicePressEnd: () => void | Promise<void>
  onVoicePressCancel: () => void | Promise<void>
}) {
  return (
    <div className={`assistant-input ${voiceCapture.phase !== 'idle' ? 'is-recording' : ''}`}>
      <VoiceCaptureOverlay voiceCapture={voiceCapture} />
      <textarea
        aria-label="AI 助手输入"
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
        placeholder="告诉我：新增客户、查询客户、修改需求、创建提醒..."
        rows={3}
      />
      <div className="assistant-input-actions" aria-label="Agent 输入动作">
        <HoldVoiceButton
          className="hold-voice-button"
          disabled={isRunning}
          onPressStart={onVoicePressStart}
          onPressMove={onVoicePressMove}
          onPressEnd={onVoicePressEnd}
          onPressCancel={onVoicePressCancel}
        >
          <Mic size={18} />
          <span>按住说话</span>
        </HoldVoiceButton>
        <button className="send-button" type="button" onClick={onRun} disabled={isRunning}>
          <Send size={16} />
          {isRunning ? '生成中' : '生成草稿'}
        </button>
      </div>
    </div>
  )
}

function HoldVoiceButton({
  className,
  disabled,
  children,
  onPressStart,
  onPressMove,
  onPressEnd,
  onPressCancel,
}: {
  className: string
  disabled: boolean
  children: ReactNode
  onPressStart: (clientY: number) => void | Promise<void>
  onPressMove: (clientY: number) => void
  onPressEnd: () => void | Promise<void>
  onPressCancel: () => void | Promise<void>
}) {
  return (
    <button
      className={className}
      type="button"
      aria-label="按住说话"
      disabled={disabled}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (disabled) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        void onPressStart(event.clientY)
      }}
      onPointerMove={(event) => {
        if (disabled) return
        onPressMove(event.clientY)
      }}
      onPointerUp={(event) => {
        if (disabled) return
        event.preventDefault()
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        void onPressEnd()
      }}
      onPointerCancel={() => {
        if (disabled) return
        void onPressCancel()
      }}
      onPointerLeave={(event) => {
        if (disabled || event.buttons !== 1) return
        onPressMove(event.clientY)
      }}
    >
      {children}
    </button>
  )
}

function VoiceCaptureOverlay({ voiceCapture }: { voiceCapture: VoiceCaptureState }) {
  if (voiceCapture.phase === 'idle') return null

  const isCanceling = voiceCapture.phase === 'canceling'
  const providerText = voiceCapture.provider === 'iflytek' ? '科大讯飞' : '语音输入'

  return (
    <div className={`voice-capture-overlay ${isCanceling ? 'canceling' : ''}`} role="status" aria-live="polite">
      <div className="voice-pulse">
        <Mic size={22} />
      </div>
      <strong>{voiceCapture.message}</strong>
      <span>{isCanceling ? '松手后不会写入内容' : `${providerText} · 上滑取消`}</span>
    </div>
  )
}

function AssistantRunningCard({ disclosure, streamText }: { disclosure: AgentModelDisclosure | null; streamText: string }) {
  return (
    <div className="confirm-card running-card" role="status" aria-live="polite">
      <div className="confirm-title">
        <Sparkles size={18} />
        <strong>{disclosure ? '模型 Agent 正在生成' : '本地 Agent 正在生成'}</strong>
      </div>
      <p>{disclosure ? '正在调用模型，失败会自动重试 3 次。' : '正在读取本地客户库并生成草稿。'}</p>
      {streamText.length > 0 && (
        <div className="stream-progress">
          <strong>正在接收模型响应</strong>
          <span>{`已接收 ${streamText.length} 字结构化结果`}</span>
        </div>
      )}
      {disclosure && <ModelDisclosureSummary disclosure={disclosure} />}
    </div>
  )
}

function ModelDisclosureSummary({ disclosure }: { disclosure: AgentModelDisclosure }) {
  return (
    <div className="model-disclosure-summary" aria-label="模型数据摘要">
      <span>{`客户 ${disclosure.customerCount} 位`}</span>
      <span>{`待办 ${disclosure.todoCount} 条`}</span>
      <span>{`沟通 ${disclosure.interactionCount} 条`}</span>
    </div>
  )
}

function assistantHistoryText(command: AssistantCommand): string {
  if (command.kind === 'query-customers') return command.payload.resultSummary
  if (command.kind === 'agent-answer') return command.payload.message
  if (command.kind === 'unknown') return command.payload.message
  if (command.kind === 'batch-actions') return `批量动作草稿，共 ${command.payload.actions.length} 个动作，等待确认`
  return `${command.title}，等待确认`
}

function assistantNotice(result: AgentRunResult): string {
  const label = assistantSourceLabel(result.source)
  if (result.command.requiresConfirmation) return `${label} 已生成结构化草稿，等待确认`
  if (result.command.kind === 'query-customers') return `${label} 已基于客户库回答`
  if (result.command.kind === 'unknown') return `${label} 需要补充信息`
  return `${label} 已回复`
}

function assistantSourceLabel(source: AgentSource): string {
  return source === 'model' ? '模型 Agent' : '本地 Agent'
}

function actionStatusText(command: AssistantCommand): string {
  if (command.kind === 'query-customers') return '已基于本地客户库生成回答'
  if (command.kind === 'agent-answer') return '已生成回复'
  if (command.kind === 'unknown') return '需要补充信息'
  if (command.kind === 'batch-actions') return '等待确认'
  return '等待确认'
}

function actionPrimaryTitle(command: AssistantCommand): string {
  if (command.kind === 'batch-actions') return '批量动作草稿'
  if (command.kind === 'create-reminder') return '提醒草稿'
  if (command.kind === 'create-customer') return command.title
  if (command.kind === 'create-interaction') return '沟通记录草稿'
  if (command.kind === 'update-customer') return '客户更新草稿'
  return command.title
}

function formatReminderRecognition(value: unknown): string {
  if (typeof value !== 'string') return '识别为：未填写'
  return `识别为：${formatDateTime(value)}`
}

function resolveOnlineStatus(isOnline: boolean | undefined): boolean {
  if (typeof isOnline === 'boolean') return isOnline
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
  return navigator.onLine
}

function ConfirmationCard({
  command,
  runInfo,
  onConfirm,
  onDismiss,
}: {
  command: AssistantCommand
  runInfo: AssistantRunInfo | null
  onConfirm: () => void
  onDismiss: () => void
}) {
  if (command.kind === 'batch-actions') {
    return (
      <div className="confirm-card">
        <div className="confirm-title">
          <Sparkles size={18} />
          <div>
            <strong>{actionPrimaryTitle(command)}</strong>
            <span>{`共 ${command.payload.actions.length} 个动作，确认后逐条保存`}</span>
          </div>
        </div>
        {runInfo && <span className="tool-trace">来源：{assistantSourceLabel(runInfo.source)} · 工具：{runInfo.toolTrace.join(' / ')}</span>}
        <div className="batch-action-list">
          {command.payload.actions.map((action, index) => (
            <div className="batch-action-card" key={`${action.kind}-${index}`}>
              <strong>{actionPrimaryTitle(action)}</strong>
              <div className="field-grid">
                {Object.entries(action.payload).map(([key, value]) => (
                  <div key={key}>
                    <span>{fieldLabel(key)}</span>
                    <strong>{key === 'scheduledAt' ? formatReminderRecognition(value) : formatFieldValue(key, value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="confirm-actions">
          <button type="button" onClick={onDismiss}>取消</button>
          <button type="button" className="primary" onClick={onConfirm}>
            <Plus size={16} />
            确认保存
          </button>
        </div>
      </div>
    )
  }

  if (command.kind === 'query-customers' || command.kind === 'unknown' || command.kind === 'agent-answer') {
    const text =
      command.kind === 'query-customers'
        ? command.payload.resultSummary
        : command.kind === 'agent-answer'
          ? command.payload.message
          : command.payload.message
    return (
      <div className="confirm-card">
        <div className="confirm-title">
          <Sparkles size={18} />
          <div>
            <strong>{actionPrimaryTitle(command)}</strong>
            <span>{actionStatusText(command)}</span>
          </div>
        </div>
        <p>{text}</p>
        <button type="button" onClick={onDismiss}>清除当前结果</button>
      </div>
    )
  }

  return (
    <div className="confirm-card">
      <div className="confirm-title">
        <Sparkles size={18} />
        <div>
          <strong>{actionPrimaryTitle(command)}</strong>
          <span>{actionStatusText(command)}</span>
        </div>
      </div>
      {runInfo && <span className="tool-trace">来源：{assistantSourceLabel(runInfo.source)} · 工具：{runInfo.toolTrace.join(' / ')}</span>}
      <ModelDisclosureText disclosure={runInfo?.modelDisclosure} />
      <div className="field-grid">
        {Object.entries(command.payload).map(([key, value]) => (
          <div key={key}>
            <span>{fieldLabel(key)}</span>
            <strong>{key === 'scheduledAt' ? formatReminderRecognition(value) : formatFieldValue(key, value)}</strong>
          </div>
        ))}
      </div>
      <div className="confirm-actions">
        <button type="button" onClick={onDismiss}>取消</button>
        <button type="button" className="primary" onClick={onConfirm}>
          <Plus size={16} />
          确认保存
        </button>
      </div>
    </div>
  )
}

function ModelDisclosureText({ disclosure }: { disclosure: AgentModelDisclosure | undefined }) {
  if (!disclosure) return null

  return (
    <div className="tool-trace" aria-label="模型数据披露">
      <span>{`Disclosure：${disclosure.provider} · 客户 ${disclosure.customerCount} 位 · 待办 ${disclosure.todoCount} 条`}</span>
      <span>{`沟通记录 ${disclosure.interactionCount} 条`}</span>
      <span>{`客户字段：${disclosure.customerFields.join(', ')}`}</span>
      <span>{`画像字段：${disclosure.profileFieldKeys.join(', ')}`}</span>
      <span>{`待办字段：${disclosure.todoFields.join(', ')}`}</span>
      <span>{`沟通字段：${disclosure.interactionFields.join(', ')}`}</span>
    </div>
  )
}

function CustomerCard({
  customer,
  healthScore,
  onOpen,
}: {
  customer: Customer
  healthScore: number
  onOpen?: () => void
}) {
  return (
    <article className="customer-card">
      <div className="customer-card-top">
        <div>
          <h2>{customer.name}</h2>
          <p>{customer.city} · {customer.propertyType || '户型待补充'} · {customer.areaSqm ?? '-'}平</p>
        </div>
        <span className="stage-pill">{customer.stage}</span>
      </div>
      <div className="customer-meta">
        <span>{customer.budgetWan ? `${customer.budgetWan}w` : '预算待补'}</span>
        <span>{customer.household || '家庭结构待补'}</span>
        <span>{customer.sourceChannel || '来源待补'}</span>
        <span>{customer.stylePreference || '风格待补'}</span>
        <span>健康度 {healthScore}</span>
      </div>
      <div className="tags">
        {customer.needs.map((need) => (
          <span key={need}>{need}</span>
        ))}
      </div>
      <footer>
        <span>下次跟进：{formatDateTime(customer.nextFollowUpAt)}</span>
        <strong>建议：补齐关键需求后推进到报价</strong>
      </footer>
      {onOpen && (
        <button type="button" className="card-open" aria-label={`查看${customer.name}详情`} onClick={onOpen}>
          查看档案
        </button>
      )}
    </article>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Bell; title: string }) {
  return (
    <div className="section-title">
      <Icon size={18} />
      <h2>{title}</h2>
    </div>
  )
}

function formatDateTime(value: string | null): string {
  if (!value) return '未设置'
  const parsedDate = new Date(value)
  if (!Number.isNaN(parsedDate.getTime())) {
    const year = parsedDate.getFullYear()
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
    const day = String(parsedDate.getDate()).padStart(2, '0')
    const hours = String(parsedDate.getHours()).padStart(2, '0')
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  return value.replace('T', ' ').slice(0, 16)
}

function splitNeeds(value: string): string[] {
  return value
    .split(/[、,，\s]+/)
    .map((need) => need.trim())
    .filter(Boolean)
}

function isActiveCustomer(customer: Customer): boolean {
  return !customer.deletedAt
}

function isRecycledCustomer(customer: Customer): boolean {
  return Boolean(customer.deletedAt)
}

function channelLabel(channel: Interaction['channel']): string {
  if (channel === 'wechat') return '微信'
  if (channel === 'phone') return '电话'
  if (channel === 'site-visit') return '量房/现场'
  if (channel === 'meeting') return '会议'
  return '备注'
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    city: '城市',
    name: '客户姓名',
    wechatName: '微信名',
    budgetWan: '预算',
    areaSqm: '面积',
    propertyType: '房型',
    household: '家庭结构',
    sourceChannel: '来源渠道',
    stylePreference: '风格偏好',
    needs: '需求',
    customerId: '客户 ID',
    customerName: '客户',
    need: '新增需求',
    summary: '沟通摘要',
    happenedAt: '沟通时间',
    nextAction: '下一步动作',
    demandDate: '需求日期',
    urgent: '是否加急',
    serviceValue: '服务价值',
    firstInteractionAt: '首次沟通时间',
    firstInteractionSummary: '首次沟通',
    profileValues: '画像字段',
    title: '标题',
    scheduledAt: '提醒时间',
    channel: '提醒渠道',
    status: '状态',
  }
  return labels[key] ?? key
}

function formatFieldValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.join('、')
  if (key === 'profileValues' && value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([profileKey, profileValue]) => `${profileKey}: ${formatProfilePrimitiveForCard(profileValue)}`)
      .join('；')
  }
  if (key === 'budgetWan' && typeof value === 'number') return `${value}w`
  if (key === 'areaSqm' && typeof value === 'number') return `${value}平`
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (key === 'scheduledAt') return formatReminderRecognition(value)
  if ((key === 'happenedAt' || key === 'firstInteractionAt') && typeof value === 'string') return formatDateTime(value)
  if (key === 'channel' && value === 'wechat') return '微信'
  if (key === 'channel' && value === 'phone') return '电话'
  if (key === 'channel' && value === 'site-visit') return '量房/现场'
  if (key === 'channel' && value === 'meeting') return '会议'
  if (key === 'channel' && value === 'note') return '备注'
  if (key === 'channel' && value === 'app-and-calendar') return 'app 内提醒 + 安卓本机日历'
  if (key === 'status' && value === 'draft') return '待确认'
  return String(value || '未填写')
}

function formatProfilePrimitiveForCard(value: unknown): string {
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value === null || value === undefined || value === '') return '未填写'
  return String(value)
}

function capabilityIcon(id: ReturnType<typeof getNativeCapabilityMatrix>[number]['id']) {
  const iconProps = { size: 20 }
  if (id === 'overlay') return <ShieldCheck {...iconProps} />
  if (id === 'calendar') return <CalendarClock {...iconProps} />
  if (id === 'keystore') return <KeyRound {...iconProps} />
  if (id === 'speech') return <Mic {...iconProps} />
  if (id === 'sqlite') return <ClipboardList {...iconProps} />
  return <Bell {...iconProps} />
}

function statusText(status: ReturnType<typeof getNativeCapabilityMatrix>[number]['androidStatus']): string {
  if (status === 'available') return '可用'
  if (status === 'requires-permission') return '需要授权'
  if (status === 'native-plugin') return '原生插件'
  return '预览模式'
}

function reminderNotice(prefix: string, result: ReminderScheduleResult): string {
  if (result.status !== 'scheduled') {
    return prefix === '客户待办已添加' ? '客户待办已添加，已保留 app 内提醒' : '已创建 app 内提醒，系统通知暂不可用'
  }

  if (result.calendarEvent?.status === 'linked') return `${prefix}，系统通知已调度，已写入安卓日历`
  if (result.calendarEvent?.status === 'failed') return `${prefix}，系统通知已调度，日历暂不可用`
  return `${prefix}，系统通知已调度`
}

function createDefaultModelClient(apiKey: string, modelConfig: ModelConfig): AgentModelClient | undefined {
  const trimmedApiKey = apiKey.trim()
  return trimmedApiKey
    ? createOpenAICompatibleModelClient({
        apiKey: trimmedApiKey,
        baseUrl: modelConfig.baseUrl,
        model: modelConfig.model,
      })
    : undefined
}

function activeModelApiKey(savedApiKey: string): string {
  return savedApiKey.trim() || BUILT_IN_MODEL_API_KEY
}

function shouldUseModelAgent({
  apiKey,
  online,
  modelClient,
}: {
  apiKey: string
  online: boolean
  modelClient: AgentModelClient | undefined
}): boolean {
  if (!apiKey.trim() || !online) return false
  if (import.meta.env.MODE === 'test') return Boolean(modelClient)
  return true
}

function overlayStateFromResult(status: 'started' | 'stopped' | 'permission-denied' | 'unsupported'): FloatingAssistantState {
  if (status === 'started') return 'enabled'
  if (status === 'permission-denied') return 'permission-required'
  if (status === 'unsupported') return 'unsupported'
  return 'idle'
}

function floatingAssistantStateText(state: FloatingAssistantState): string {
  if (state === 'enabled') return '已开启'
  if (state === 'permission-required') return '等待安卓授权'
  if (state === 'unsupported') return '当前环境不可用'
  return '未开启'
}

export default App
