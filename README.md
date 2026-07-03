# KCUST AI

家装全案定制行业的个人客户管理 Agent。它不是传统 CRM 表格，也不是只会聊天的助手，而是一个围绕“今天该跟进谁、客户说过什么、下一步要做什么”构建的移动客户工作台。

KCUST AI 目前安卓优先、本地优先、单用户优先，适合设计师、家装顾问、全案定制主理人用来管理微信客户、需求记录、提醒和跟进节奏。

## 产品爆点

- **客户工作台叠加 AI Agent**  
  打开 App 先看到今日待跟进、重点客户、低健康度客户和下一步建议；Agent 不是独立玩具，而是嵌在客户工作流里。

- **一句话沉淀客户资料**  
  可以输入或语音描述“客户微信名、工地城市、预算、需求、沟通内容、是否加急、服务价值”，Agent 会生成结构化草稿，确认后写入本地客户库。

- **对话式检索客户网络**  
  例如“我现在在湖北省，告诉我这边哪些地级市有沟通中的客户”，Agent 会基于本地客户、待办和沟通记录回答，不依赖记忆猜测。

- **待办和提醒闭环**  
  客户要求几月几号去工地、给图纸、开会或回访时，Agent 可以生成提醒草稿；确认后创建 App 内提醒，并尝试写入安卓日历。

- **系统级悬浮助手**  
  安卓授权后，可以在其他 App 上方呼出轻量悬浮窗，查看最近待办、按住录音、让 Agent 处理客户指令；复杂操作仍可回到 App 深入处理。

## 核心功能

- 客户 CRUD：新增、编辑、删除、回收站恢复、搜索和详情查看。
- 客户画像：城市、预算、面积、房型、家庭结构、来源渠道、风格偏好、需求标签、阶段和健康度。
- 沟通记录：支持记录微信、电话、量房/现场、会议和备注，并更新客户最近互动时间。
- AI 意图识别：新增客户、更新客户、创建沟通记录、创建提醒、批量动作和客户查询。
- Agent 确认卡片：所有写操作默认先生成结构化草稿，用户确认后保存。
- 语音输入：Web 预览使用输入框；Android 支持科大讯飞中文识别大模型。
- 系统能力：安卓悬浮窗、本机通知、日历写入、Keystore 安全存储。
- 本地数据：客户、待办、画像、沟通记录、提醒和日历链接保存在本地 repository，并提供导入导出基础能力。

## 体验结构

```text
工作台
  今日待跟进 / 重点客户 / 健康度提醒 / 下一步建议

客户
  客户清单 / 客户档案 / 需求标签 / 沟通时间线 / 待办

Agent
  对话历史 / 当前动作 / 中间态 / 确认卡片 / 语音输入

待办
  客户关联待办 / 到期时间 / 完成状态 / 提醒调度

设置
  模型选择 / 悬浮窗参数 / 回收站 / 原生能力状态
```

## 技术栈

- React
- TypeScript
- Vite
- Ionic 风格移动端布局
- Capacitor
- Android 原生插件
- Vitest
- ESLint

Android 侧包含：

- 悬浮窗服务
- 科大讯飞 ASR 接入
- 本机日历写入
- 本机通知调度
- Android Keystore 加密存储

## 隐私与安全

- 真实模型网关参数不提交到仓库。
- 真实科大讯飞参数不提交到仓库。
- `.env.local`、`android/local.properties`、构建产物和本地 SDK 文件均被忽略。
- Agent 写入客户资料前需要用户确认。
- 模型调用前会生成数据范围披露，避免静默发送客户库内容。

## 快速开始

```bash
npm install
cp .env.example .env.local
npm run dev -- --host 127.0.0.1
```

`.env.local` 用于配置 OpenAI-compatible 模型网关：

```bash
VITE_MODEL_GATEWAY_BASE_URL=https://your-model-gateway.example/v1
VITE_MODEL_GATEWAY_API_KEY=your-local-api-key
```

## 常用命令

```bash
npm test
npm run lint
npm run build
npx cap sync android
```

Android Java 编译需要本机安装 JDK 21：

```bash
cd android
cp local.properties.example local.properties
./gradlew :app:compileDebugJavaWithJavac
```

`android/local.properties` 用于配置 Android SDK 路径和科大讯飞中文识别大模型参数：

```properties
sdk.dir=/path/to/android-sdk
iflytek.appId=your-app-id
iflytek.apiKey=your-api-key
iflytek.apiSecret=your-api-secret
```

科大讯飞原生语音依赖需要放在 `android/app/libs/` 下；这些本地 SDK 文件不会提交到仓库。

## Android Native Preflight

真机 QA 前建议先运行：

```bash
scripts/android-preflight.sh
```

该脚本会检查 Java、Gradle Wrapper、Android SDK 环境变量、adb 和已连接设备。

## 文档

- [隐私与模型数据说明](docs/privacy.md)
- [Android QA 清单](docs/android-qa.md)
- [剩余工作计划](docs/superpowers/plans/2026-05-26-kcust-ai-remaining-work.md)

## 项目状态

这是一个持续迭代中的个人客户管理 Agent 原型。当前重点是打磨安卓真机体验、悬浮窗语音交互、模型 Agent 稳定性和家装客户字段结构化能力。
