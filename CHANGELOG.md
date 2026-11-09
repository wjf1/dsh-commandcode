# Changelog

All notable changes to **dsh-commandcode** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-11-01

### 修复

- **兼容 DSH 0.2.x 宿主**：12 条 `peerDependencies` 追加 `^0.2.1-rc.1` 区间（宿主 0.2.1-rc.3 下安装即 problem 的根因）；client 注册改为懒声明感知（`whenSlotDeclared`，0.1.2-alpha.1 起 API 兼容）。
- **市场防御**：npm 名 `dsh-commandcode` 被第三方抢注，本版起以 GitHub Release 附官方 tarball，市场条目钉 `tarball:` 字段。

## [Unreleased]

### Changed

- 包名迁移：`dsh-commandcode` → `@jianfengwang/dsh-commandcode`（npm 名被第三方抢注后的换名决策，2026-11-08 负责人拍板）；README 安装命令同步更新，GitHub 安装与市场 tarball 钉定不受影响

### Added

- `HANDOFF.md`：补齐四文档门禁要求的跨会话接力文档（项目概况与当前状态 / 技术栈与运行基线 / 核心架构与文件拓扑 / 最近一轮变更 / 待办与下一步 / 关键避坑与运行约束）
- `README.md` 与 `README.zh-CN.md` 新增「截图 / Screenshots」章节与配图说明，并补上 `lib/` 为何刻意提交进仓库的说明
- `tests/login.test.ts`：登录回调 CORS 判定的回归测试（顶级导航 / 回环来源 / 白名单来源 / 任意来源拒绝）
- `tests/retry.test.ts`：熔断器状态机回归测试（达阈值熔断 / 半开探测失败重新熔断 / 探测成功恢复）
- `tests/adapter.test.ts`：适配器回归测试（41 个用例）——SSE/JSONL 流解析与 text/reasoning/tool-call 块组装、`finish` 兜底守卫（不重复结算）、finish reason 映射、SSE 注释与 `[DONE]` 行忽略、末尾无换行残行 flush、429/401 多账户轮换（含已试 key 不复用）、请求超时与网络错误映射、CLI 版本与授权头、system 提示折叠、`max_tokens` 按 catalog 与硬上限钳制、`reasoning_effort` 支持性判定、工具 schema 转换、tool-result 配对与孤儿丢弃、`getUsage` 四端点聚合与 `blocked` 三态分类（401/5xx/网络）、ISO 账期解析、`probeFiveHourWindow` 新旧响应 shape、`resolveAuthFileApiKey` 各凭证文件 shape、计划过滤与能力描述纯函数
- `tests/catalog.test.ts`：模型目录回归测试（14 个用例）——`parseCatalogResponse` 双字段拼写 / 无效条目跳过 / 空目录与非 list shape 报错，`ModelCatalog` 的 SWR 后台刷新（非阻塞）、ETag 条件请求与 304 处理、磁盘缓存命中免网络、强制刷新失败降级旧目录、熔断器开门后拒绝请求且 `refreshNow` 强制绕过、`find` 命中路径、`state` 诊断
- `tests/retry.test.ts` 追加：`buildRetryPolicy`（默认值与覆盖合并、可重试码集合）、重试码常量分区（可重试 / 永不重试互斥）、`backoffDelay` 指数上界与封顶、`sleep` 的 AbortSignal 行为（已中止立即拒绝 / 中途中止及时返回）
- 测试套件新增 64 个用例，`npm test` 共 101 个用例全部通过（Node 内置 test runner）
- CI 增加「`lib/` 是否与 `src/` 同步」的校验：`lib/` 是提交进仓库的产物，只检查文件存在无法发现忘记重建
- `src/client/index.ts`：新增 `whenSlotDeclared` 注册辅助，为 DSH 0.2.x 的懒声明槽位加固设置页两处注册（`settings.section` 与 `settings.models.provider-card`）——0.2.x 把这两个槽位的声明推迟到设置弹窗的条目 children 表（`sidebar.settings` → Models section），client 在启动时注册会在声明出现前落空；现在先探测声明、未声明则订阅声明边界（`subscribeDeclaration`，0.1.2-alpha.1 起即存在于 SlotCore 合同）等声明出现再注册，宿主级联释放后自动复位重试；仅吞「slot not declared」竞态错误，其余注册错误保持原样抛出

### Fixed

- **插件在 DSH 0.2.x 宿主上完全不装载（主进程半 import 失败）**：主进程入口 import 了 `@deepseek-ai/dsh-settings` 的 `installSettingsSection` / `settingsNamespace`——这两个导出只存在于 0.1.x（`vendor/` 内 devDependency 钉的 0.1.2-alpha.1 仍有），0.2.x 的 `dsh-settings` 已重构为 `SettingsForms` 类并删除了它们，属破坏性重构而非改名。import 失败使 fiber 从未创建，`dsh-client-modules` 因此不把 client bundle 放进启动 manifest（`/plugins/<id>/client.js` 恒 404、无 `style[data-plugin]` 标记），设置页与模型卡片静默失效——此前多轮排查把现象误判为宿主装载层问题。现改为 0.2.x 范式：删掉该 import，命名空间内联为 profile 条目 id，settings 页面交由宿主从本插件 `Config` schema 自动投影（0.2.x 不需要也不支持插件侧注册）；配置变更随 fiber 重启重新 `apply`，`current()` 闭包重定向一并去掉。验证：`npm run typecheck`、`npm test`（101 用例）、`npm run build` 全绿，部署后插件进入 boot manifest（94 项含本插件）。

- **登录回调的 CORS 通配符**（`src/login.ts`）：回环回调服务器此前对任意来源回 `Access-Control-Allow-Origin: *`，任何网页都能跨域读取回调响应，并可借简单 POST 把攻击者自己的 API key 注入进去。现在无 `Origin`（浏览器顶级导航）不下发任何 CORS 头；有 `Origin` 时必须是绑定的回环端口或白名单来源，其余一律 403 且不回 CORS 头。
- **超限请求的 413 发不出去**（`src/login.ts`）：请求体超限时先 `req.destroy()` 再回 413，客户端只会收到 `ECONNRESET`。现在先回响应、再靠 drain 收尾。
- **流式响应重复 finish**（`src/adapter.ts`）：循环外的兜底 `finish` 无条件执行，上游已经发过 `finish` 时会再补一个，按 `finish` 计费/收尾的下游被触发两次。现在用 `finished` 标记守卫。
- **熔断器半开后永久失效**（`src/retry.ts`）：`recordFailure` 用 `failures === threshold` 判断，半开探测失败后 `failures` 已超过阈值，`openedAt` 不再刷新，熔断器从此永久放行。改为 `>=`。
- `README.md` 与 `README.zh-CN.md` 的「项目结构」树补全 `lib/`、`vendor/`、`screenshots.json`、`HANDOFF.md` 等实际存在的条目

### Removed

- `tsdown.config.ts`：与 `tsdown.config.js` 内容重复且未被任何构建脚本引用（构建显式 `--config tsdown.config.js`），保留两份会让读者无法判断哪份生效

## [1.1.2] - 2026-08-31

### Fixed

- **DSH Desktop 插件市场安装失败**（"build scripts are blocked by pnpm by default"）：pnpm v10 起默认拦截依赖包的生命周期脚本，本插件此前依赖 `prepare` 脚本在安装现场执行 tsdown 构建，被拦截后市场直接判定无法安装。现在将构建产物 `lib/` 直接提交进仓库并移除 `prepare` 脚本，安装变为零脚本的纯文件拷贝，不再触发 pnpm 的构建脚本拦截，也无需手动点击「放行构建脚本并重试」。`npm run build` 保留，供本地开发与 CI 使用

## [1.1.1] - 2026-08-30

### Changed

- **用量与套餐面板对照设计稿重做**：头部账户 chip + 套餐徽标 + 刷新；四张统计卡（请求/成功率/花费/Token 入出分解）；三张额度卡（月额度/已购/赠送）；5 小时与每周窗口进度条（金额制，重置时间仅在未来时显示）；页脚账期截止与更新时间；账户标签页真正可切换；面板挂载时自动加载一次数据

### Fixed

- 成功率显示：API 返回的已是百分数，设置页与 /commandcode 命令此前又乘 100（会显示 10000%）
- 账期截止：订阅接口返回 ISO 时间字符串，此前按数字解析导致永远为空

## [1.1.0] - 2026-08-30

### Changed

- **Adapted to DeepSeek Harness `0.1.2-alpha.1`** (bundled by DSH Desktop 0.7.x)
  - `LlmAdapter` surface: `CallId` renamed to `ToolCallId`; finish reasons now use the `max-tokens` union member; reasoning efforts are declared as typed `LlmReasoningEffortInfo` entries
  - Client: `@deepseek-ai/dsh-client-runtime` was deleted upstream — snapshot stores now come from `@deepseek-ai/dsh-client-store`
  - Client: settings pages bind the reactive `SettingsScope` snapshot contract (`getSnapshot`/`set`/`unset`) and slot components consume the injected `hooks` compartment as `use<Name>` selector hooks
  - Client: stored API keys are write-only again (secrets no longer ride the credentials Remote view); the page shows a configured badge and accepts a replacement key
  - Host: the usage report and login flow are served through the shared `/api` exact-Fetch-route registry (`connection.fetch.register`) after `ctx.typert.register(path, handler)` disappeared — routes: `GET /api/commandcode/report`, `GET /api/commandcode/login/{begin,status,cancel}`
  - `CredentialRef` is a branded string; slot ids and diagnostics follow the new shape
- Vendor the `0.1.2-alpha.1` package closure under `vendor/` (file: devDependencies) so `npm ci`, tests, and builds stay reproducible until upstream publishes the release to npm

### Fixed

- `tsc --noEmit` had never been runnable: the tsconfig lacked `allowImportingTsExtensions`, so the whole codebase now typechecks clean against `0.1.2-alpha.1`
- `/commandcode` command crashed at runtime (`require()` inside an ESM module) — locale strings are imported statically now
- Test suite used the `node:test` `assert` export which lacks `.equal`; tests now use `node:assert/strict` (29/29 pass)
- Settings controller: invalid `CredentialRef` casts removed; catalog background refresh and retry sleep type errors fixed

### Removed

- The aspirational Typert Remote contribution that never matched the generated-descriptor contract on either side of the wire, and the no-op client fetch wrapper

## [1.0.0] - 2026-08-30

### Added

- **Initial release** of dsh-commandcode — enhanced DSH-Desktop LLM provider plugin for Command Code
- Provider route registration (`commandcode`) with configurable provider directory entry
- Models page provider card with API key input and quick login button
- Live model catalog with stale-while-revalidate (SWR), on-disk cache, ETag conditional requests, and circuit breaker
- Streaming generation via `/alpha/generate` with text, reasoning, tool-call, and usage events
- Multi-account pool with automatic rotation on 429/401, active window probing, and stable slot IDs
- OAuth login flow with loopback callback server (port 18700–18799), auto-timeout, and CORS-safe callback
- Structured error diagnostics with stable error codes, diagnostic context, and user-facing hints
- Configurable request timeout (first byte) and stream idle timeout in settings
- Exponential backoff with jitter for transient failures (RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT, EMPTY_RESPONSE)
- Plan-aware model filtering (fails open: unknown plan or on-demand credits show everything)
- Per-account usage & billing dashboard with 5-hour/weekly window progress bars, subscription plan, and credit balance
- `/commandcode` terminal command with Chinese/English output
- Image input support for Vision-capable models via the durable attachment service
- Redesigned settings page with card-based layout (Connection, Usage & Plan, Multi-Account, Advanced)
- Real-time form validation (API base URL, timeout values) with inline error messages
- Full bilingual (Chinese/English) localization for both settings page and terminal command
- DSH-Desktop 0.7.1 design token alignment (`--dsw-alias-*`), rounded corners, smooth transitions, focus rings
- Per-account usage tabs in the settings page
- TypeScript build via `tsdown` with ESM output and type declarations
- Comprehensive test suite (Node test runner) covering errors, accounts, catalog, and adapter
- CI workflow (GitHub Actions) for type check, tests, and build verification
- Bilingual README (English + Chinese) with installation, configuration, usage, and troubleshooting
- MIT License, NOTICE with third-party acknowledgments, and Keep a Changelog format

### Changed

- N/A (initial release)

### Deprecated

- N/A (initial release)

### Removed

- N/A (initial release)

### Fixed

- N/A (initial release)

### Security

- API keys are stored through the credentials service, never logged or exposed in error messages
- Login callback server binds to loopback only (127.0.0.1) with CORS origin validation
- Structured error context excludes credential values

---

## Acknowledgments

This project is an enhanced reimplementation inspired by:
- [dsh-commandcode-provider](https://github.com/Mars-Sea/dsh-commandcode-provider) by Mars-Sea (MIT)
- Originally ported from `pi-commandcode-provider` (MIT)
