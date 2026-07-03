import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AgentModelClient } from './domain/agentRuntime'
import { BUILT_IN_MODEL_API_KEY, BUILT_IN_MODEL_BASE_URL } from './domain/modelConfig'
import type { OverlayBridge } from './native/overlay'
import type { SpeechBridge } from './native/speech'
import type { scheduleTodoReminder } from './native/reminders'
import type { SecureKeysBridge } from './native/secureKeys'

describe('KCUST AI app shell', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function openAgentTab(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Agent' }))
  }

  it('renders the customer workspace with a dedicated agent tab', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: '客户工作台' })).toBeInTheDocument()
    expect(screen.getByText('今日待跟进')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '工作台' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '客户' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '图谱' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '待办' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: '主导航' })).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '工作台',
      '客户',
      'Agent',
      '待办',
      '设置',
    ])

    await openAgentTab(user)

    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
    expect(screen.getByLabelText('Agent 对话')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...')).toBeInTheDocument()
  })

  it('uses a multiline assistant composer so long speech transcripts remain reviewable', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAgentTab(user)
    const input = screen.getByRole('textbox', { name: 'AI 助手输入' })
    await user.type(input, '张总预算调整为60万，家里有4口人，养了一只猫，并且明天晚上八点提醒我发图纸')

    expect(input.tagName).toBe('TEXTAREA')
    expect(input).toHaveAttribute('rows', '3')
    expect(input).toHaveValue('张总预算调整为60万，家里有4口人，养了一只猫，并且明天晚上八点提醒我发图纸')
  })

  it('starts the dedicated agent conversation with an empty state and composer', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAgentTab(user)

    expect(screen.getByLabelText('Agent 动作面板')).not.toHaveClass('assistant-panel')
    expect(screen.getByText('开始和 Agent 对话')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起助手' })).not.toBeInTheDocument()
  })

  it('uses the built-in model gateway and only exposes model selection', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent',
        payload: { message: '模型网关已启用。', toolTrace: [] },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getByText('模型网关已内置')).toBeInTheDocument()
    expect(screen.queryByLabelText('模型 Base URL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('模型 API Key')).not.toBeInTheDocument()
    expect(screen.getByLabelText('模型 ID')).toHaveValue('MiniMax-M3')

    await openAgentTab(user)
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '你好')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(modelClient).toHaveBeenCalledTimes(1)
    expect(modelClient.mock.calls[0]?.[0].modelConfig).toMatchObject({
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: 'MiniMax-M3',
    })
  })

  it('turns an assistant create command into a confirmation card and saves after confirmation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAgentTab(user)
    await user.type(
      screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'),
      '帮我添加一个无锡的客户，预算 50w，是一套 120 平的高层，需求是 3 个人住，有小孩，考虑智能家居',
    )
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(screen.getByText('新增客户草稿')).toBeInTheDocument()
    expect(screen.getByText('无锡')).toBeInTheDocument()
    expect(screen.getAllByText('50w').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '确认保存' }))
    await user.click(screen.getByRole('button', { name: '客户' }))

    expect(screen.getByText('未命名客户')).toBeInTheDocument()
    expect(screen.getAllByText('智能家居').length).toBeGreaterThan(0)
  })

  it('collects a customer over multiple assistant turns before saving', async () => {
    const user = userEvent.setup()
    render(<App now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '帮我新增一个客户')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('继续补充客户资料')).toBeInTheDocument()
    expect(screen.getAllByText(/还需要补充/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '确认保存' })).not.toBeInTheDocument()

    await user.type(
      screen.getByRole('textbox', { name: 'AI 助手输入' }),
      '无锡，预算 50w，120 平高层，3 个人住，有小孩，考虑智能家居',
    )
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('新增客户草稿')).toBeInTheDocument()
    expect(screen.getByText('无锡')).toBeInTheDocument()
    expect(screen.getAllByText('50w').length).toBeGreaterThan(0)
    expect(screen.getAllByText('智能家居').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '确认保存' }))
    await user.click(screen.getByRole('button', { name: '客户' }))

    expect(screen.getByText('未命名客户')).toBeInTheDocument()
    expect(screen.getAllByText('无锡 · 高层 · 120平').length).toBeGreaterThan(0)
  })

  it('collects an ambiguous customer update over multiple assistant turns before saving', async () => {
    const user = userEvent.setup()
    render(<App now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '给无锡客户加一个整体浴室的需求')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('继续补充客户修改')).toBeInTheDocument()
    expect(screen.getAllByText(/客户姓名/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/张总/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/王先生/).length).toBeGreaterThan(0)

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '张总')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('客户更新草稿')).toBeInTheDocument()
    expect(screen.getAllByText('整体浴室').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '确认保存' }))
    await user.click(screen.getByRole('button', { name: '查看张总详情' }))

    expect(screen.getAllByText('整体浴室').length).toBeGreaterThan(0)
  })

  it('collects a reminder time over multiple assistant turns before saving', async () => {
    const user = userEvent.setup()
    const reminderScheduler = vi.fn<typeof scheduleTodoReminder>().mockResolvedValue({
      status: 'scheduled',
      notificationId: 42,
    })
    render(<App now="2026-05-25T21:00:00.000+08:00" reminderScheduler={reminderScheduler} />)

    await openAgentTab(user)
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '提醒我和无锡的张总开会')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('继续补充提醒')).toBeInTheDocument()
    expect(screen.getAllByText(/提醒时间/).length).toBeGreaterThan(0)

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '明天晚上八点')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('提醒草稿')).toBeInTheDocument()
    expect(screen.getByText('识别为：2026-05-26 20:00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认保存' }))
    await user.click(screen.getByRole('button', { name: '待办' }))

    expect(screen.getByText('和张总开会')).toBeInTheDocument()
    expect(reminderScheduler).toHaveBeenCalledTimes(1)
  })

  it('captures source channel and style preference from an agent-created customer draft', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAgentTab(user)
    await user.type(
      screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'),
      '新增一个苏州客户，来源小红书，预算 80w，160 平高层，三口之家，喜欢现代简约风格，考虑全屋定制',
    )
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(screen.getByText('来源渠道')).toBeInTheDocument()
    expect(screen.getByText('小红书')).toBeInTheDocument()
    expect(screen.getByText('风格偏好')).toBeInTheDocument()
    expect(screen.getByText('现代简约')).toBeInTheDocument()
    expect(screen.getByText('家庭结构')).toBeInTheDocument()
    expect(screen.getByText('三口之家')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认保存' }))
    await user.click(screen.getByRole('button', { name: '查看未命名客户详情' }))

    expect(screen.getByRole('heading', { name: '未命名客户客户档案' })).toBeInTheDocument()
    expect(screen.getAllByText('小红书').length).toBeGreaterThan(0)
    expect(screen.getAllByText('现代简约').length).toBeGreaterThan(0)
    expect(screen.getByText('80w')).toBeInTheDocument()
  })

  it('saves a real service workflow customer record with the first communication timeline', async () => {
    const user = userEvent.setup()
    render(<App now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)
    await user.type(
      screen.getByRole('textbox', { name: 'AI 助手输入' }),
      '记录客户信息 客户微信名 张三 需求内容为 全屋定制 工地位于 武汉 城市 需求日期 6月30号 今天第一次沟通 沟通内容 客户拜托我们先出平面图 是否希望加急 是 是否有服务价值 有',
    )
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('新增客户草稿')).toBeInTheDocument()
    expect(screen.getByText('微信名')).toBeInTheDocument()
    expect(screen.getAllByText('张三').length).toBeGreaterThan(0)
    expect(screen.getByText('首次沟通')).toBeInTheDocument()
    expect(screen.getAllByText('客户拜托我们先出平面图').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '确认保存' }))

    expect(screen.getByText('张三')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '查看张三详情' }))
    expect(screen.getByRole('heading', { name: '张三客户档案' })).toBeInTheDocument()
    expect(screen.getAllByText(/客户拜托我们先出平面图/).length).toBeGreaterThan(0)
    expect(screen.getByText('下一步：客户拜托我们先出平面图')).toBeInTheDocument()
  })

  it('saves a later customer communication from the assistant confirmation card', async () => {
    const user = userEvent.setup()
    render(<App now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)
    await user.type(
      screen.getByRole('textbox', { name: 'AI 助手输入' }),
      '张总客户 今天沟通一次 沟通内容 客户要求我们给个图纸',
    )
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('沟通记录草稿')).toBeInTheDocument()
    expect(screen.getByText('沟通摘要')).toBeInTheDocument()
    expect(screen.getAllByText('客户要求我们给个图纸').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '确认保存' }))

    expect(screen.getByRole('heading', { name: '张总客户档案' })).toBeInTheDocument()
    expect(screen.getAllByText(/客户要求我们给个图纸/).length).toBeGreaterThan(0)
    expect(screen.getByText('下一步：客户要求我们给个图纸')).toBeInTheDocument()
  })

  it('uses the current device date when drafting natural-language reminders', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-05-28T12:30:00.000Z'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    fireEvent.change(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'), {
      target: { value: '和无锡的王先生明天晚上八点有个会，提醒我' },
    })
    fireEvent.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('识别为：2026-05-29 20:00')).toBeInTheDocument()
    expect(screen.queryByText('2026-05-29T20:00:00.000+08:00')).not.toBeInTheDocument()
  })

  it('formats model reminder timestamps from other offsets as readable local time', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'create-reminder',
        title: '模型提醒草稿',
        payload: {
          customerId: 'c-wang',
          title: '和王先生开会',
          scheduledAt: '2026-05-29T21:30:00.123+09:00',
          channel: 'app-and-calendar',
          status: 'draft',
        },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await openAgentTab(user)

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '请用模型安排王先生明晚会议')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('识别为：2026-05-29 20:30')).toBeInTheDocument()
    expect(screen.queryByText('2026-05-29T21:30:00.123+09:00')).not.toBeInTheDocument()
  })

  it('answers a local agent follow-up priority question from customer and todo data', async () => {
    const user = userEvent.setup()
    render(<App now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)
    await user.type(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'), '今天我该优先跟进谁')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(screen.getByText('本地 Agent 建议')).toBeInTheDocument()
    expect(screen.getAllByText(/优先跟进李女士/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/给李女士发送报价对比/).length).toBeGreaterThan(0)
    expect(screen.queryByText('来源：本地 Agent')).not.toBeInTheDocument()
    expect(screen.queryByText('工具：本地待办扫描 / 客户健康度评分 / 下一步建议生成')).not.toBeInTheDocument()
  })

  it('places the current agent result after the latest conversation message', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAgentTab(user)
    await user.type(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'), '我在无锡有哪些客户')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    const panel = screen.getByLabelText('Agent 动作面板')
    const latestMessage = within(panel).getByText('我在无锡有哪些客户')
    const currentResult = within(panel).getByText('当前回复')

    expect(Boolean(latestMessage.compareDocumentPosition(currentResult) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(within(panel).queryByText('当前动作')).not.toBeInTheDocument()
    expect(screen.getByText('最近对话')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起助手' })).not.toBeInTheDocument()
  })

  it('keeps agent conversation history after the app remounts', async () => {
    const user = userEvent.setup()
    const firstRender = render(<App now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '我在无锡有哪些客户')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('最近对话')).toBeInTheDocument()
    expect(screen.getByText('我在无锡有哪些客户')).toBeInTheDocument()
    firstRender.unmount()

    render(<App now="2026-05-25T21:00:00.000+08:00" />)
    await user.click(screen.getByRole('button', { name: 'Agent' }))

    expect(screen.getByText('最近对话')).toBeInTheDocument()
    expect(screen.getByText('我在无锡有哪些客户')).toBeInTheDocument()
    expect(screen.getAllByText(/张总/).length).toBeGreaterThan(0)
  })

  it('uses the injected model client when a key is configured and shows model source', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'create-customer',
        title: '模型客户草稿',
        payload: {
          name: '赵女士',
          city: '杭州',
          budgetWan: 90,
          areaSqm: 160,
          propertyType: '高层',
          household: '三口之家',
          needs: ['智能家居'],
        },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await openAgentTab(user)

    await user.type(
      screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'),
      '帮我添加一个无锡客户，预算 50w，120 平高层，3 个人住，有小孩，考虑智能家居',
    )
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('模型客户草稿')).toBeInTheDocument()
    expect(screen.getByText('来源：模型 Agent · 工具：model:create-customer')).toBeInTheDocument()
    expect(screen.getByText('Disclosure：openai-compatible · 客户 3 位 · 待办 2 条')).toBeInTheDocument()
    expect(screen.getByText(/客户字段：id, name, city, budgetWan/)).toBeInTheDocument()
    expect(screen.getByText(/待办字段：id, customerId, title, dueAt, completed/)).toBeInTheDocument()
    expect(screen.getByText('模型 Agent 已生成结构化草稿，等待确认')).toBeInTheDocument()
    expect(modelClient).toHaveBeenCalledTimes(1)
  })

  it('saves structured model customer updates into customer profile fields', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'update-customer',
        title: '模型客户更新草稿',
        payload: {
          customerId: 'c-zhang',
          customerName: '张总',
          city: '无锡',
          need: '预算调整为60万；家里有4口人；养了一只猫（宠物）',
        },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '张总预算调整为60万，家里有4口人，养了一只猫')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('客户更新草稿')).toBeInTheDocument()
    expect(screen.getAllByText('60w').length).toBeGreaterThan(0)
    expect(screen.getAllByText('4 人住').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '确认保存' }))

    expect(await screen.findByRole('heading', { name: '张总' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '查看张总详情' }))

    expect(screen.getAllByText('60w').length).toBeGreaterThan(0)
    expect(screen.getAllByText('4 人住').length).toBeGreaterThan(0)
    expect(screen.getAllByText('家里有宠物').length).toBeGreaterThan(0)
  })

  it('confirms a multi-customer agent instruction as separate actions', async () => {
    const user = userEvent.setup()
    const reminderScheduler = vi.fn<typeof scheduleTodoReminder>().mockResolvedValue({
      status: 'scheduled',
      notificationId: 201,
      calendarEvent: { status: 'linked', providerEventId: 'event-201', calendarId: 'primary' },
    })
    render(<App reminderScheduler={reminderScheduler} now="2026-05-25T21:00:00.000+08:00" />)

    await openAgentTab(user)
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '张总预算调整为60万，王先生明天晚上八点提醒我发图纸')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('批量动作草稿')).toBeInTheDocument()
    expect(screen.getByText('客户更新草稿')).toBeInTheDocument()
    expect(screen.getByText('提醒草稿')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认保存' }))

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '查看张总详情' }))
    expect(screen.getAllByText('60w').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '待办' }))
    expect(screen.getByText('给王先生发图纸')).toBeInTheDocument()
    expect(reminderScheduler).toHaveBeenCalledTimes(1)
  })

  it('routes a greeting through the model without a send-data confirmation when a key is configured', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent',
        payload: { message: '你好，我可以帮你记录客户、查询客户和安排提醒。', toolTrace: ['model:chat'] },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await openAgentTab(user)

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '你好')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('模型 Agent')).toBeInTheDocument()
    expect(screen.queryByText('模型数据确认')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '允许发送并生成' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/你好/).length).toBeGreaterThan(0)
    expect(screen.queryByText('来源：模型 Agent')).not.toBeInTheDocument()
    expect(screen.queryByText('工具：model:chat')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('模型数据披露')).not.toBeInTheDocument()
    expect(screen.getByText('模型 Agent 已回复')).toBeInTheDocument()
    expect(modelClient).toHaveBeenCalledTimes(1)
  })

  it('shows an in-progress state immediately after sending a model request', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockReturnValue(new Promise(() => {}))
    render(<App modelClient={modelClient} isOnline={true} />)

    await openAgentTab(user)

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '请用模型分析今天安排')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(modelClient).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('模型数据确认')).not.toBeInTheDocument()
    expect(screen.getAllByText('模型 Agent 正在生成').length).toBeGreaterThan(0)
    expect(screen.getByText('正在调用模型，失败会自动重试 3 次。')).toBeInTheDocument()
    expect(screen.getByText('开始调用模型 Agent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成中' })).toBeDisabled()
  })

  it('shows streaming feedback while model chunks are arriving', async () => {
    const user = userEvent.setup()
    let resolveModel: ((value: string) => void) | undefined
    const modelClient = vi.fn<AgentModelClient>().mockImplementation((request) => {
      request.onStreamChunk?.('{"kind":"agent-answer",')
      request.onStreamChunk?.('"payload":{"message":"你好","toolTrace":[]}}')
      return new Promise((resolve) => {
        resolveModel = resolve
      })
    })
    render(<App modelClient={modelClient} isOnline={true} />)

    await user.click(screen.getByRole('button', { name: 'Agent' }))

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '你好')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('正在接收模型响应')).toBeInTheDocument()
    expect(screen.getByText('收到模型流式响应')).toBeInTheDocument()
    expect(screen.getByText(/已接收 \d+ 字结构化结果/)).toBeInTheDocument()

    resolveModel?.('{"kind":"agent-answer","payload":{"message":"你好","toolTrace":[]}}')
    expect(await screen.findByText('模型 Agent 建议')).toBeInTheDocument()
  })

  it('shows retry steps in the agent process timeline', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>()
      .mockRejectedValueOnce(new Error('temporary outage 1'))
      .mockRejectedValueOnce(new Error('temporary outage 2'))
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'agent-answer',
          requiresConfirmation: false,
          title: '模型 Agent',
          payload: { message: '重试后已恢复。', toolTrace: ['model:agent-answer'] },
        }),
      )
    render(<App modelClient={modelClient} isOnline={true} />)

    await user.click(screen.getByRole('button', { name: 'Agent' }))

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '你好')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('模型调用失败，正在进行第 1 次重试')).toBeInTheDocument()
    expect(screen.getByText('模型调用失败，正在进行第 2 次重试')).toBeInTheDocument()
    expect(await screen.findByText('模型 Agent 已返回结果')).toBeInTheDocument()
    expect((await screen.findAllByText('重试后已恢复。')).length).toBeGreaterThan(0)
    expect(modelClient).toHaveBeenCalledTimes(3)
  })

  it('saves model id from settings and passes the built-in gateway to the model client', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent 建议',
        payload: { message: '模型配置已生效。', toolTrace: ['model:agent-answer'] },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.clear(screen.getByLabelText('模型 ID'))
    await user.type(screen.getByLabelText('模型 ID'), 'kcust-model')
    await user.click(screen.getByRole('button', { name: '保存模型配置' }))

    expect(screen.getByText('模型配置已保存')).toBeInTheDocument()

    await openAgentTab(user)
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '今天怎么安排')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('模型 Agent 建议')).toBeInTheDocument()
    expect(modelClient).toHaveBeenCalledTimes(1)
    expect(modelClient.mock.calls[0]?.[0].modelConfig).toMatchObject({
      provider: 'openai-compatible',
      apiKey: BUILT_IN_MODEL_API_KEY,
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: 'kcust-model',
    })
  })

  it('tests model connection from settings and shows the result', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>()
    const connectionTester = vi.fn().mockResolvedValue({ ok: true })
    render(<App modelClient={modelClient} isOnline={true} modelConnectionTester={connectionTester} />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.clear(screen.getByLabelText('模型 ID'))
    await user.type(screen.getByLabelText('模型 ID'), 'kcust-model')
    await user.click(screen.getByRole('button', { name: '测试模型连接' }))

    expect(connectionTester).toHaveBeenCalledWith({
      apiKey: BUILT_IN_MODEL_API_KEY,
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: 'kcust-model',
    })
    expect(await screen.findByText('模型连接测试通过')).toBeInTheDocument()
  })

  it('uses the built-in gateway when testing after returning to settings', async () => {
    const user = userEvent.setup()
    const connectionTester = vi.fn().mockResolvedValue({ ok: true })
    render(<App isOnline={true} modelConnectionTester={connectionTester} />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '保存模型配置' }))
    await user.click(screen.getByRole('button', { name: '工作台' }))
    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.queryByLabelText('模型 API Key')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '测试模型连接' }))

    expect(connectionTester).toHaveBeenLastCalledWith({
      apiKey: BUILT_IN_MODEL_API_KEY,
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: 'MiniMax-M3',
    })
    expect(await screen.findByText('模型连接测试通过')).toBeInTheDocument()
  })

  it('loads model ids from the base url and lets the user choose one', async () => {
    const user = userEvent.setup()
    const modelListFetcher = vi.fn().mockResolvedValue({
      ok: true,
      models: ['deepseek-chat', 'qwen-plus'],
    })
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent 建议',
        payload: { message: '模型已选择。', toolTrace: ['model:agent-answer'] },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} modelListFetcher={modelListFetcher} />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '获取模型列表' }))

    expect(modelListFetcher).toHaveBeenCalledWith({
      apiKey: BUILT_IN_MODEL_API_KEY,
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: 'MiniMax-M3',
    })
    expect(await screen.findByRole('button', { name: '选择模型 deepseek-chat' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '选择模型 qwen-plus' }))
    expect(screen.getByLabelText('模型 ID')).toHaveValue('qwen-plus')

    await user.click(screen.getByRole('button', { name: '保存模型配置' }))
    await user.click(screen.getByRole('button', { name: 'Agent' }))
    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '你好')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('模型 Agent 建议')).toBeInTheDocument()
    expect(modelClient.mock.calls[0]?.[0].modelConfig.model).toBe('qwen-plus')
  })

  it('shows locally grounded customer query results even when the model invents the summary', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'query-customers',
        requiresConfirmation: false,
        title: '模型查询结果',
        payload: {
          city: '无锡',
          resultSummary: '模型编造客户｜无锡｜999w',
        },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await openAgentTab(user)

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '请用模型整理无锡客户摘要')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('本地客户查询结果')).toBeInTheDocument()
    expect(screen.getAllByText(/张总/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/王先生/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/模型编造客户/)).not.toBeInTheDocument()
    expect(screen.queryByText('工具：model:query-customers / local:ground-query')).not.toBeInTheDocument()
  })

  it('sends model requests directly without showing a data-disclosure confirmation', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent',
        payload: { message: '已收到。', toolTrace: ['model:agent-answer'] },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await openAgentTab(user)

    await user.type(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'), '新增赵女士')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect((await screen.findAllByText('已收到。')).length).toBeGreaterThan(0)
    expect(screen.queryByText('模型数据确认')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消发送' })).not.toBeInTheDocument()
    expect(modelClient).toHaveBeenCalledTimes(1)
  })

  it('keeps recent assistant conversation turns for follow-up questions', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAgentTab(user)
    await user.type(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'), '今天我该优先跟进谁')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))
    await user.type(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'), '那张总呢')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(screen.getByText('最近对话')).toBeInTheDocument()
    expect(screen.getByText('今天我该优先跟进谁')).toBeInTheDocument()
    expect(screen.getByText('那张总呢')).toBeInTheDocument()
    expect(screen.getAllByText(/张总下一步建议/).length).toBeGreaterThan(0)
  })

  it('keeps the pending confirmation card when leaving and returning to the agent tab', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openAgentTab(user)
    await user.type(
      screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'),
      '和无锡的王先生明天晚上八点有个会，提醒我',
    )
    await user.click(screen.getByRole('button', { name: '生成草稿' }))

    expect(await screen.findByText('提醒草稿')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '客户' }))

    expect(screen.queryByText('提醒草稿')).not.toBeInTheDocument()

    await openAgentTab(user)

    expect(screen.getByText('提醒草稿')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认保存' })).toBeInTheDocument()
  })

  it('shows a clear fallback when voice input is unavailable in preview', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '按住说话' }))
    expect(screen.getByText('语音输入需要 Android 麦克风权限；Web 预览请先使用文字输入')).toBeInTheDocument()

    await openAgentTab(user)
    const voiceButtons = screen.getAllByRole('button', { name: '按住说话' })
    await user.click(voiceButtons[1])
    expect(screen.getByText('语音输入需要 Android 麦克风权限；Web 预览请先使用文字输入')).toBeInTheDocument()
  })

  it('puts an Android speech transcript into the assistant input for review', async () => {
    const speechBridge: SpeechBridge = {
      isAvailable: vi.fn().mockResolvedValue({ available: true }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
      listenOnce: vi.fn().mockResolvedValue({ text: '我在无锡有哪些客户' }),
      startListening: vi.fn().mockResolvedValue({ provider: 'iflytek' }),
      stopListening: vi.fn().mockResolvedValue({ text: '我在无锡有哪些客户', provider: 'iflytek' }),
      cancelListening: vi.fn().mockResolvedValue({ cancelled: true }),
    }
    const user = userEvent.setup()
    render(<App speechBridge={speechBridge} speechPlatform="android" />)
    await openAgentTab(user)

    const holdButton = screen.getAllByRole('button', { name: '按住说话' })[1]
    fireEvent.pointerDown(holdButton, { clientY: 400, pointerId: 1 })
    expect(await screen.findAllByText('讯飞识别中，松开发送，上滑取消')).not.toHaveLength(0)
    fireEvent.pointerUp(holdButton, { clientY: 400, pointerId: 1 })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...')).toHaveValue('我在无锡有哪些客户')
    })
    expect(screen.getByText('讯飞语音已转成文字，请确认后生成草稿')).toBeInTheDocument()
  })

  it('cancels hold-to-talk when the pointer slides upward', async () => {
    const speechBridge: SpeechBridge = {
      isAvailable: vi.fn().mockResolvedValue({ available: true }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
      listenOnce: vi.fn().mockResolvedValue({ text: '不应写入' }),
      startListening: vi.fn().mockResolvedValue({ provider: 'iflytek' }),
      stopListening: vi.fn().mockResolvedValue({ text: '不应写入', provider: 'iflytek' }),
      cancelListening: vi.fn().mockResolvedValue({ cancelled: true }),
    }
    const user = userEvent.setup()
    render(<App speechBridge={speechBridge} speechPlatform="android" />)
    await openAgentTab(user)

    const holdButton = screen.getAllByRole('button', { name: '按住说话' })[1]
    fireEvent.pointerDown(holdButton, { clientY: 420, pointerId: 1 })
    expect(await screen.findAllByText('讯飞识别中，松开发送，上滑取消')).not.toHaveLength(0)
    fireEvent.pointerMove(holdButton, { clientY: 320, pointerId: 1 })
    expect(screen.getByText('松手后不会写入内容')).toBeInTheDocument()
    fireEvent.pointerUp(holdButton, { clientY: 320, pointerId: 1 })

    expect(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...')).toHaveValue('')
    await screen.findByText('已取消语音输入')
    expect(speechBridge.cancelListening).toHaveBeenCalledTimes(1)
  })

  it('runs overlay voice recognition and confirms an agent action without switching to the app agent tab', async () => {
    const overlayEvents: Array<{ command: string; action?: string }> = [
      { command: '', action: 'overlay-voice-start' },
      { command: '', action: 'overlay-voice-stop' },
    ]
    const overlayBridge: OverlayBridge = {
      checkPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
      start: vi.fn().mockResolvedValue({ status: 'started' }),
      stop: vi.fn().mockResolvedValue({ status: 'stopped' }),
      consumePendingCommand: vi.fn().mockImplementation(() => Promise.resolve(overlayEvents.shift() ?? { command: '' })),
      updateTodos: vi.fn().mockResolvedValue({ status: 'updated' }),
      updateStatus: vi.fn().mockResolvedValue({ status: 'updated' }),
    }
    const speechBridge: SpeechBridge = {
      isAvailable: vi.fn().mockResolvedValue({ available: true }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
      listenOnce: vi.fn().mockResolvedValue({ text: '' }),
      startListening: vi.fn().mockResolvedValue({ provider: 'iflytek' }),
      stopListening: vi.fn().mockResolvedValue({
        text: '帮我添加一个无锡客户，预算 50w，120 平高层，3 个人住，有小孩，考虑智能家居',
        provider: 'iflytek',
      }),
      cancelListening: vi.fn().mockResolvedValue({ cancelled: true }),
    }
    const user = userEvent.setup()
    render(
      <App
        overlayBridge={overlayBridge}
        overlayPlatform="android"
        overlayPollIntervalMs={20}
        speechBridge={speechBridge}
        speechPlatform="android"
      />,
    )

    expect(screen.getByRole('heading', { name: '客户工作台' })).toBeInTheDocument()

    await waitFor(() => expect(speechBridge.startListening).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(speechBridge.stopListening).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(overlayBridge.updateStatus).toHaveBeenCalledWith(expect.objectContaining({
        message: '需要确认',
        requiresConfirmation: true,
        primaryActionLabel: '确认保存',
        secondaryActionLabel: '取消',
      }))
    })
    expect(screen.getByRole('heading', { name: '客户工作台' })).toBeInTheDocument()

    overlayEvents.push({ command: '', action: 'overlay-confirm' })
    await waitFor(() => {
      expect(overlayBridge.updateStatus).toHaveBeenCalledWith(expect.objectContaining({
        message: '已保存',
      }))
    })

    await user.click(screen.getByRole('button', { name: '客户' }))
    expect(await screen.findByText('未命名客户')).toBeInTheDocument()
    expect(screen.getAllByText('50w').length).toBeGreaterThan(0)
  })

  it('syncs the floating overlay todo list when open todos change', async () => {
    const overlayBridge: OverlayBridge = {
      checkPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
      requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
      start: vi.fn().mockResolvedValue({ status: 'started' }),
      stop: vi.fn().mockResolvedValue({ status: 'stopped' }),
      consumePendingCommand: vi.fn().mockResolvedValue({ command: '' }),
      updateTodos: vi.fn().mockResolvedValue({ status: 'updated' }),
      updateStatus: vi.fn().mockResolvedValue({ status: 'updated' }),
    }
    const user = userEvent.setup()
    render(<App overlayBridge={overlayBridge} overlayPlatform="android" />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '开启悬浮球' }))

    await waitFor(() => expect(overlayBridge.updateTodos).toHaveBeenCalled())
    const syncedBefore = vi.mocked(overlayBridge.updateTodos).mock.calls.at(-1)?.[0].todos ?? []
    expect(syncedBefore.some((todo) => todo.id === 'todo-zhang-meeting')).toBe(true)

    await user.click(screen.getByRole('button', { name: '待办' }))
    await user.click(screen.getAllByRole('button', { name: /完成/ })[0])

    await waitFor(() => {
      const syncedAfter = vi.mocked(overlayBridge.updateTodos).mock.calls.at(-1)?.[0].todos ?? []
      expect(syncedAfter.some((todo) => todo.id === 'todo-zhang-meeting')).toBe(false)
    })
  })

  it('supports manual customer creation, detail viewing and recycle-bin restore without AI', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '手动新增' }))
    await user.type(screen.getByLabelText('客户姓名'), '孙先生')
    await user.type(screen.getByLabelText('城市'), '无锡')
    await user.type(screen.getByLabelText('预算'), '65')
    await user.type(screen.getByLabelText('面积'), '140')
    await user.type(screen.getByLabelText('来源渠道'), '朋友介绍')
    await user.type(screen.getByLabelText('风格偏好'), '原木风')
    await user.type(screen.getByLabelText('需求标签'), '全屋定制、智能家居')
    await user.click(screen.getByRole('button', { name: '保存客户' }))

    expect(screen.getByText('孙先生')).toBeInTheDocument()
    expect(screen.getByText('朋友介绍')).toBeInTheDocument()
    expect(screen.getByText('原木风')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看孙先生详情' }))
    expect(screen.getByRole('heading', { name: '孙先生客户档案' })).toBeInTheDocument()
    expect(screen.getByText('全屋定制')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除客户' }))
    expect(screen.getByText('客户已移入回收站')).toBeInTheDocument()
    expect(screen.queryByText('孙先生')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByText('回收站')).toBeInTheDocument()
    expect(screen.getByText('孙先生 · 无锡')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '恢复孙先生' }))
    expect(screen.getByText('客户已从回收站恢复')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '客户' }))
    expect(screen.getByText('孙先生')).toBeInTheDocument()
  })

  it('supports editing an existing customer profile from the detail page', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '查看张总详情' }))
    await user.click(screen.getByRole('button', { name: '编辑客户' }))

    await user.clear(screen.getByLabelText('城市'))
    await user.type(screen.getByLabelText('城市'), '南京')
    await user.clear(screen.getByLabelText('预算'))
    await user.type(screen.getByLabelText('预算'), '58')
    await user.clear(screen.getByLabelText('来源渠道'))
    await user.type(screen.getByLabelText('来源渠道'), '老客户转介绍')
    await user.clear(screen.getByLabelText('风格偏好'))
    await user.type(screen.getByLabelText('风格偏好'), '轻奢')
    await user.clear(screen.getByLabelText('需求标签'))
    await user.type(screen.getByLabelText('需求标签'), '智能家居、整体浴室')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    expect(screen.getByText('南京 · 高层 · 120平')).toBeInTheDocument()
    expect(screen.getByText('老客户转介绍')).toBeInTheDocument()
    expect(screen.getByText('轻奢')).toBeInTheDocument()
    expect(screen.getByText('整体浴室')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回客户列表' }))
    expect(screen.getByText('南京 · 高层 · 120平')).toBeInTheDocument()
    expect(screen.getByText('58w')).toBeInTheDocument()
  })

  it('adds a customer todo from the detail page and shows it in the todo list', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '查看张总详情' }))
    await user.click(screen.getByRole('button', { name: '添加待办' }))

    await user.type(screen.getByLabelText('待办标题'), '确认全屋智能清单')
    await user.type(screen.getByLabelText('提醒时间'), '2026-05-28T09:30')
    await user.click(screen.getByRole('button', { name: '保存待办' }))

    expect(screen.getByText('确认全屋智能清单')).toBeInTheDocument()
    expect(screen.getByText('2026-05-28 09:30')).toBeInTheDocument()
    expect(await screen.findByText('客户待办已添加，已保留 app 内提醒')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '待办' }))
    expect(screen.getByText('张总 · 2026-05-28 09:30')).toBeInTheDocument()
  })

  it('surfaces calendar write success when scheduling a customer todo', async () => {
    const user = userEvent.setup()
    const reminderScheduler = vi.fn<typeof scheduleTodoReminder>().mockResolvedValue({
      status: 'scheduled',
      notificationId: 101,
      calendarEvent: { status: 'linked', providerEventId: 'event-101', calendarId: 'primary' },
    })
    render(<App reminderScheduler={reminderScheduler} />)

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '查看张总详情' }))
    await user.click(screen.getByRole('button', { name: '添加待办' }))
    await user.type(screen.getByLabelText('待办标题'), '张总方案复盘')
    await user.type(screen.getByLabelText('提醒时间'), '2026-05-28T09:30')
    await user.click(screen.getByRole('button', { name: '保存待办' }))

    expect(await screen.findByText('客户待办已添加，系统通知已调度，已写入安卓日历')).toBeInTheDocument()
    expect(reminderScheduler).toHaveBeenCalledTimes(1)
  })

  it('shows health reasons and a next-step suggestion in customer detail', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '查看李女士详情' }))

    expect(screen.getByText('健康度原因')).toBeInTheDocument()
    expect(screen.getByText('超过 30 天未互动')).toBeInTheDocument()
    expect(screen.getByText('存在逾期待办')).toBeInTheDocument()
    expect(screen.getByText('下一步建议')).toBeInTheDocument()
    expect(screen.getByText(/先处理逾期待办/)).toBeInTheDocument()
  })

  it('adds a communication record from customer detail into the timeline', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '查看张总详情' }))
    await user.click(screen.getByRole('button', { name: '添加沟通' }))
    await user.selectOptions(screen.getByLabelText('沟通渠道'), 'wechat')
    await user.clear(screen.getByLabelText('沟通时间'))
    await user.type(screen.getByLabelText('沟通时间'), '2026-05-27T10:30')
    await user.type(screen.getByLabelText('沟通摘要'), '确认需要整体浴室和儿童房收纳')
    await user.type(screen.getByLabelText('下一步动作'), '发送整体浴室案例')
    await user.click(screen.getByRole('button', { name: '保存沟通' }))

    expect(screen.getByText('客户沟通记录已保存')).toBeInTheDocument()
    expect(screen.getByText('确认需要整体浴室和儿童房收纳')).toBeInTheDocument()
    expect(screen.getByText('下一步：发送整体浴室案例')).toBeInTheDocument()
  })

  it('shows the built-in model gateway state from settings', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByText('模型网关已内置')).toBeInTheDocument()
    expect(screen.getByText('Base URL 和 Key 已封装在本机应用内，只需要选择模型。')).toBeInTheDocument()
    expect(screen.queryByLabelText('模型 API Key')).not.toBeInTheDocument()
  })

  it('does not expose model api key editing when Android secure storage is available', async () => {
    const user = userEvent.setup()
    const secureKeysBridge: SecureKeysBridge = {
      getModelApiKey: vi.fn().mockResolvedValue({ apiKey: '' }),
      saveModelApiKey: vi.fn().mockResolvedValue({ saved: true }),
      deleteModelApiKey: vi.fn().mockResolvedValue({ deleted: true }),
    }
    render(<App secureKeysBridge={secureKeysBridge} secureKeysPlatform="android" />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.queryByLabelText('模型 API Key')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存模型配置' }))

    expect(secureKeysBridge.saveModelApiKey).not.toHaveBeenCalled()
    expect(await screen.findByText('模型配置已保存')).toBeInTheDocument()
  })

  it('shows a Web preview fallback when enabling the Android floating assistant', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByText('状态：未开启')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开启悬浮球' }))

    expect(screen.getByText('系统悬浮球需要 Android 原生环境；Web 预览继续使用底部 AI 输入条')).toBeInTheDocument()
    expect(screen.getByText('状态：当前环境不可用')).toBeInTheDocument()
  })

  it('resets the screen scroll position when switching primary tabs', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.click(screen.getByRole('button', { name: '客户' }))
    await user.click(screen.getByRole('button', { name: '查看李女士详情' }))

    const screenContent = container.querySelector('.screen-content') as HTMLElement
    screenContent.scrollTop = 240
    await user.click(screen.getByRole('button', { name: '设置' }))

    const nextScreenContent = container.querySelector('.screen-content') as HTMLElement
    expect(nextScreenContent.scrollTop).toBe(0)
  })
})
