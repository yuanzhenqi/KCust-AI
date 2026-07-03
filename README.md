# KCUST AI

家装全案定制行业的个人客户管理助理 App。第一版是安卓优先、本地优先、单用户工作台：客户清单、客户详情、图谱、待办和全局 AI 输入条叠加在同一个移动端体验里。

## 当前能力

- 客户 CRUD：手动新增、编辑、删除、搜索和详情查看。
- 客户工作台：今日待跟进、重点客户、健康度和下一步建议。
- AI 助手：自然语言新增客户、查询客户、追加需求、创建提醒；所有写操作先生成确认卡片。
- 模型桥接：支持 OpenAI-compatible Chat Completions，发送前展示数据披露确认。
- 语音输入：Web 预览兜底为文字输入，Android 通过系统语音识别写入助手输入框。
- 待办提醒：app 内通知，Android 日历写入，失败时保留 app 内提醒。
- 系统悬浮球：Android 授权后启动原生悬浮助手入口。
- 本地数据：客户、待办、画像资料、需求标签、沟通记录、提醒、日历链接都走本地 repository；提供导出/导入 snapshot。
- 安全存储：Web 预览使用本地存储，Android API Key 通过 Keystore 插件加密保存。

## 开发

```bash
npm install
cp .env.example .env.local
npm run dev -- --host 127.0.0.1
npm test
npm run lint
npm run build
npx cap sync android
```

`.env.local` 用于配置 OpenAI-compatible 模型网关：

```bash
VITE_MODEL_GATEWAY_BASE_URL=https://your-model-gateway.example/v1
VITE_MODEL_GATEWAY_API_KEY=your-local-api-key
```

Android Java 编译需要本机安装 JDK 21：

```bash
cd android
cp local.properties.example local.properties
./gradlew :app:compileDebugJavaWithJavac
```

`android/local.properties` 用于配置 Android SDK 路径和科大讯飞中文识别大模型参数，不要提交真实值：

```properties
sdk.dir=/path/to/android-sdk
iflytek.appId=your-app-id
iflytek.apiKey=your-api-key
iflytek.apiSecret=your-api-secret
```

科大讯飞原生语音依赖需要放在 `android/app/libs/` 下；这些本地 SDK 文件不会提交到仓库。

### Android Native Preflight

Run the native preflight before Android device QA:

```bash
scripts/android-preflight.sh
```

The script checks Java, the Gradle wrapper, Android SDK environment variables, adb, and connected devices.

## 文档

- 隐私与模型数据说明：[docs/privacy.md](docs/privacy.md)
- Android QA 清单：[docs/android-qa.md](docs/android-qa.md)
- 剩余工作计划：[docs/superpowers/plans/2026-05-26-kcust-ai-remaining-work.md](docs/superpowers/plans/2026-05-26-kcust-ai-remaining-work.md)
