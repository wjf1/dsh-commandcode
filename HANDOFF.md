# HANDOFF — dsh-commandcode

> 跨会话接力文档。**新会话接手时先读本文件，再读代码。**
> 最后更新：2026-10-31 · 对应版本 `v1.1.2`

---

## 1. 项目概况与当前状态

**是什么**：`dsh-commandcode` 是一个 DSH-Desktop（DeepSeek Harness 桌面版）的 **LLM 提供商插件**，把 [Command Code](https://commandcode.ai) 的模型接入 DSH 的模型选择器。它在社区原版 `Mars-Sea/dsh-commandcode-provider`（MIT）的基础上重写增强：SWR 模型目录、可配置超时与重试、多账户轮换、结构化错误诊断、按套餐过滤模型、用量与计费面板、中英双语设置页。

**当前状态（截至 2026-10-21）**

| 项 | 状态 |
|---|---|
| 版本 | `package.json` = **1.1.2** |
| 分支 | `main` |
| 已验证功能 | 提供商路由注册、Models 页卡片、模型目录 SWR、设置页（连接/用量与套餐/多账户/高级）、`/commandcode` 终端命令、OAuth 回环登录、用量与套餐面板、多账户轮换 |
| 测试 | `npm test` 覆盖 `tests/` 下 6 个文件（accounts / errors / login / retry / adapter / catalog，Node 内置 test runner），101 个用例 |
| CI | `.github/workflows/ci.yml`：Node 22 → `npm ci` → `typecheck` → `test` → `build` → 校验 `lib/` 三件产物存在 |
| 发布渠道 | ①GitHub 公开发布（tag + Release）；②DSH 插件市场（awesome-dsh-plugin，条目已收录，PR #3925 于 2026-08-31 合并）；③**未发布到 npm**（`dsh-commandcode` 在 npm 上为 404） |
| 市场条目 | `data/plugins/wjf1__dsh-commandcode.yml`，`install` 为 `dsh plugin --profile web add github:wjf1/dsh-commandcode`，目录中 version/npm 均为空、无截图 |
| 已知缺口 | `assets/` 目录尚未入库（README 截图章节指向 `assets/*.png`，需补真实截图）；`screenshots.json` 目前是 `{"screenshots": []}` |

---

## 2. 技术栈与运行基线

- **语言/构建**：TypeScript + ESM（`"type": "module"`），构建器 `tsdown`（`tsdown.config.ts` 为源，仓库同时保留编译出的 `tsdown.config.js`）。
- **运行时基线**：DSH-Desktop ≥ 0.7.0（内置 **DeepSeek Harness 0.1.2-alpha.1**）；开发机 Node ≥ 20，CI 用 Node 22。
- **宿主侧**：`cordis` 插件体系，入口由 `cordis.patch.yml` 声明（`insert` 一条 `id: llm-commandcode`），在 `ctx.llm` 上注册 `commandcode` 提供商路由。
- **客户端侧**：`package.json` 的 `dsh.client` 声明 `platform: web`、`immediately: true`、`inject: [dsh-client-locale, dsh-client-ui-slots]`，加载器自动取 `exports["./client"]`。
- **依赖闭包**：`vendor/` 下以 `file:` 形式落盘了 0.1.2-alpha.1 的整套 `@deepseek-ai/*` tarball（devDependencies），用于 `npm ci` / 测试 / 构建的可复现性，直到上游把该版本正式发到 npm。
- **关键上游变更（0.1.2-alpha.1）**：`LlmAdapter` 的 `CallId` → `ToolCallId`；finish reason 新增 `max-tokens` 联合成员；`@deepseek-ai/dsh-client-runtime` 被删除，改用 `@deepseek-ai/dsh-client-store`；`ctx.typert.register()` 消失，用量/登录后端改走共享 `/api` 精确 Fetch 路由注册表（`connection.fetch.register`）。
- **常用命令**

```bash
npm ci            # 按 package-lock 还原（含 vendor/ 的 file: 依赖）
npm run typecheck # tsc --noEmit
npm test          # node --test tests/*.test.ts
npm run build     # tsdown → lib/（ESM + .d.ts）
```

---

## 3. 核心架构与文件拓扑

```
dsh-commandcode/
├── src/
│   ├── index.ts            # 宿主入口：注册 commandcode 提供商路由、设置区、装配各服务
│   ├── adapter.ts          # LLM 适配器（38KB，最大文件）：流式生成、模型目录、用量端点
│   ├── catalog.ts          # 模型目录：SWR + 磁盘缓存 + ETag 条件请求 + 熔断器
│   ├── accounts.ts         # 多账户池：429/401 自动轮换、冷却账户窗口探测
│   ├── retry.ts            # 重试策略：指数退避+抖动、错误分类（RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT/EMPTY_RESPONSE）
│   ├── errors.ts           # 结构化错误：稳定错误码 + 诊断上下文 + 用户可读提示
│   ├── login.ts            # OAuth 登录：回环回调服务器（端口 18700–18799）
│   ├── login-wire.ts       # 登录线路协议类型
│   ├── usage-remote.ts     # 用量端点：GET /api/commandcode/report
│   ├── usage-wire.ts       # 用量线路协议类型
│   ├── commands.ts         # /commandcode 终端命令
│   ├── command-locales.ts  # 命令中文/英文字符串（静态 import，见避坑 5）
│   └── client/             # 浏览器侧
│       ├── index.ts        # 客户端入口：CSS 注入、slot 注册、控制器装配
│       ├── section.tsx     # 设置页主组件（17.5KB）
│       ├── card.tsx        # Models 页提供商卡片
│       ├── settings.ts     # 设置控制器：状态、实时校验、持久化
│       ├── login.ts        # 登录控制器：轮询 /api/commandcode/login/status
│       ├── usage.ts        # 用量控制器：拉取、账户标签页
│       ├── locales.ts      # 客户端中英文本地化
│       ├── sessions.ts     # 图片会话错误包装
│       ├── update.ts       # 更新检查
│       └── version.ts      # 版本常量
├── tests/                  # accounts / errors / login / retry / adapter / catalog 六个回归测试
├── lib/                    # 预构建产物，刻意提交（见避坑 1）
├── vendor/                 # 0.1.2-alpha.1 依赖闭包 tarball
├── cordis.patch.yml        # Bundle 层：insert id=llm-commandcode，config.apiKeyEnv=COMMANDCODE_API_KEY
├── screenshots.json        # 市场抓取的截图清单（当前为空）
├── README.md / README.zh-CN.md / CHANGELOG.md / HANDOFF.md / NOTICE / LICENSE
```

**数据流**：对话请求 → DSH `ctx.llm` → `adapter.ts`（逐请求用 thunk 解析 API Key/端点/超时） → Command Code Provider API `POST {apiBase}/alpha/generate`（自定义 SSE/JSONL）→ 解析 `text-delta` / `reasoning-*` / `tool-call` / `finish` / `error` 事件回流。模型目录走 `GET /provider/v1/models`，命中缓存即刻返回、后台刷新。

**凭证解析优先级**（高 → 低）：设置页保存的 key → 环境变量 `COMMANDCODE_API_KEY` → CLI 认证文件 `~/.commandcode/auth.json` → 内置 OAuth 登录。

---

## 4. 最近一轮变更与交付成果

**v1.1.2（2026-08-31）** — 修 DSH Desktop 插件市场安装失败。根因是 pnpm v10 起默认拦截依赖的生命周期脚本，本插件此前靠 `prepare` 跑 tsdown 构建，被拦截后市场直接判不可安装。做法：把 `lib/` 构建产物提交进仓库、删掉 `prepare`，安装变成零脚本纯文件拷贝。

**v1.1.1（2026-08-30）** — 用量与套餐面板按设计稿重做（账户 chip、四张统计卡、三张额度卡、两条窗口进度条、账户标签页真正可切换、挂载即加载）；修两个数据 bug：成功率被重复乘 100（显示 10000%）、账期截止把 ISO 字符串当数字解析导致恒空。

**v1.1.0（2026-08-30）** — 适配 DeepSeek Harness 0.1.2-alpha.1（`CallId`→`ToolCallId`、`max-tokens`、`dsh-client-store` 接替 `dsh-client-runtime`、`/api` Fetch 路由、`CredentialRef` 品牌化字符串）；落盘 `vendor/` 依赖闭包；修 `tsc --noEmit` 从未能跑通、`/commandcode` 在 ESM 里用 `require()` 崩、测试用错 `assert` 导出。

**本轮（2026-10-21，未发版）** — 补齐发布门禁要求的四文档：新增 `HANDOFF.md`；双语 README 增加截图章节与 `lib/` 提交原因说明、补全项目结构树；CHANGELOG 增加 `[Unreleased]` 小节。随后创建 **首个** annotated tag `v1.1.2` 与 GitHub Release（此前仓库无任何 tag 与 Release）。

**本轮（2026-10-31，未发版）** — 测试补齐与市场条目更新：

1. **测试补齐**：新增 `tests/adapter.test.ts`（41 用例：SSE 流解析、finish 兜底守卫、429/401 轮换、超时/网络错误映射、getUsage 四端点聚合与 blocked 分类、probeFiveHourWindow、凭证文件解析等）与 `tests/catalog.test.ts`（14 用例：响应解析、SWR、ETag/304、磁盘缓存、熔断门控与强制刷新），`tests/retry.test.ts` 追加 `buildRetryPolicy` / 重试码常量 / `backoffDelay` / `sleep` 的 AbortSignal 行为（9 用例）。`npm test` 共 **101 个用例全部通过**（Node 22 本机验证）。
2. **市场条目更新（PR [#10798](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10798)，待合并）**：`data/plugins/wjf1__dsh-commandcode.yml` 的 description 对齐双语 README 一句话定位。经查上游 `scripts/lib/entries.mjs` 的 `ENTRY_KEYS` 白名单（url/name/category/description/icon/tarball/file），条目 schema **不支持** version/npm/install/screenshots 字段：npm 由 `probe-npm` 从仓库自动解析、install 命令按 URL 自动生成（当前 npm 404，安装走 GitHub，与实际一致）、version 以 GitHub Release v1.1.2 表达；v1.1.2 Release 无 `.tgz` 资产故不写 tarball。提交走 GitHub REST API（merge-upstream 同步 fork → git/refs 建分支 `update-entry-v1-1-2` → PUT contents → PR）。

**本轮（2026-11-01，未发版）** — DSH 0.2.x client 半适配加固与装载层阻塞定性：

1. **`src/client/index.ts` 新增 `whenSlotDeclared`**：设置页两处槽位注册（`settings.section` / `settings.models.provider-card`）改为「探测声明 → 未声明则 `subscribeDeclaration` 等声明边界再注册」的防御模式（0.2.x 把设置 chrome 的槽位声明推迟到设置弹窗条目的 children 表；`npm run typecheck` 与 `npm run build` 通过，产物已部署本机 profile）。
2. **装载层根因定性**（详见第 5 节第 6 条）：插件组件 row `llm-commandcode` 在 0.2.1-rc.3 上 `phase: null`（fiber 从未创建），`dsh-client-modules` registry 因此不把 client bundle 放进启动 manifest，client 半从未执行——设置 UI 静默失效的根因在宿主装载层，client 槽位名与注册 API 与 0.1.x 相比未变。peer 兼容、bundles 位置、modules overlay、文件解析等假设逐一排除，激活错误因宿主无日志/CLI/主进程调试通道而无法浮出。
3. **三张市场截图继续阻塞**：UI 未渲染，无法拍摄。排障过程沉淀的全部证据与解锁路径已写入第 5 节第 6 条。

---

## 5. 待办与下一步

1. **盯市场 PR 合并**：PR [#10798](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10798)（分支 `update-entry-v1-1-2`）已在 CI 走查中，合并后确认上游 README 两份生成文件里 `wjf1/dsh-commandcode` 行已同步为新 description。
2. **补真实截图**：在 DSH Desktop 0.7.1 内实拍 `assets/panel-usage.png`、`assets/card-models.png`、`assets/settings-accounts.png`，把 `screenshots.json` 从空数组改成实际清单，再向市场提一次条目更新（届时可在 Release 补 `.tgz` 资产并加 `tarball` 字段，市场索引即可展示版本号）。
3. **可选：发 npm**。发布后市场 `probe-npm` 自动填 npm 字段；同时 README「快速安装」的 `npm install dsh-commandcode` 才真正成立（当前该包在 npm 上是 404，安装只能走 GitHub）。
4. ~~补测试~~：**已完成（2026-10-31）**——`adapter` / `catalog` / `retry` 的回归已补齐，`npm test` 101 个用例全绿。
5. **盯上游**：`0.1.2-alpha.1` 正式发到 npm 后，可以把 `vendor/` 从 `file:` devDependencies 换回正常版本区间并瘦身仓库。
6. **适配 DSH 0.2.x 宿主（2026-11-01 两轮实测，阻塞补截图）**：本机宿主已自动升级到 `0.2.1-rc.3`（内部 `@deepseek-ai/dsh-*` 同步 0.2.x）。两轮排查后的精确结论：
   ① **UI 槽位名没有变，注册 API 也没有变**：0.2.x 的 `settings.section` 由设置弹窗 shell（`ui-settings-general`）的 `sidebar.settings` 条目 children 表声明（kind list），`settings.models.provider-card` 由其中 Models 条目的 children 声明（kind keyed，key = provider 的 settingsNs `llm-commandcode`，`renderSlot` 时传入 `provider/configured/keyConfigured` props）。`ctx.slots.inject(name, factory)` 的语义是「声明已存在才调 factory，否则等声明边界再调」（实现在 `dsh-client-ui-renderer` 的 `SlotRegistry.inject`）。
   ② **client 侧已做懒声明防御**（`whenSlotDeclared`：先探测注册、未声明则 `subscribeDeclaration` 等声明出现再注册，仅吞 not declared 竞态错误）——`src/client/index.ts`、已构建部署。0.1.2-alpha.1 的 SlotCore 合同同样有 `subscribeDeclaration`，0.1.x 兼容不受影响。
   ③ **真正的卡点在装载层，不在 client**：插件详情页（插件 → dsh-commandcode）显示组件 `llm-commandcode` **「未运行」**——React store 数据为 `enabled: true, phase: null`（row 存在、未禁用、但 fiber 从未创建）；而插件页列表的 `data-plugin-status="running"` 只是包级安装状态，会掩盖组件未激活。由于 `dsh-client-modules` 的 `ClientModuleRegistry` 扫描 loader entries 时跳过 `entry.fiber === void 0` 的行，本插件 client bundle 从未进入启动 manifest（`window.__DSH_BOOT__.entries` 共 94 项无 dsh-commandcode；`fetch /plugins/dsh-commandcode/client.js` 返回 404），client 半**从未被执行**（head 中无 `style[data-plugin="dsh-commandcode"]` 标记）——这才是设置 UI 静默失效的根因。client 槽位注册代码再正确也不会被调用。
   ④ **已排除的原因**：peer 兼容性（12 条 dsh-* peer 用宿主同款 `semver.satisfies(0.2.1-rc.3, range, {includePrerelease: true})` 逐一验证全部满足）；`dsh.profile.bundles` 栈位置（把 dsh-commandcode 从末位前移到 vision-router 之前并重启，无效，已还原）；给官方 `modules` row 追加 `inject: [webServer]`（dsh-vision-router 的已知竞态 workaround，对本例无效，workaround 保留在 cordis.patch.yml 末尾）；profile 树内文件解析（`createRequire(profiles/desktop/node_modules).resolve('dsh-commandcode/package.json')` 正常，exports/dsh.client 合法）。
   ⑤ **激活错误无法浮出**：宿主 0.2.1-rc.3 无常规运行日志文件（`logs/` 只有 crash 转储）、本机无 `dsh` CLI、主进程无 `--inspect`；用 `Start-Process -RedirectStandardError` 捕获 stderr 也没有 cordis 层 deny/preflight 诊断（`dsh-app-boot` 的 `prepareProfileEntries` 会把「disabling profile plugin row …」写到 stderr，本例没有出现，说明 row 未被显式 deny，而是停在未激活）。
   ⑥ **补三张截图（panel-usage / card-models / settings-accounts）继续被此项阻塞**。解锁路径建议（按性价比排序）：a) 给宿主主进程开 `--inspect` 或找到上游日志开关后重启，读 llm-commandcode row 的激活错误；b) 若上游发布带 CLI 的版本，用 `dsh --dump-config` 对照 include 树中该 row 的最终形态；c) 对照宿主上同样「组件未运行」过的插件（如 `@michengai/dsh-archive-manager`、`@michengai/dsh-im-connect` 曾因 peer 不兼容被 deny 后豁免恢复）确认恢复手法是否适用于本例；d) 等 0.2.1 正式版看装载层是否变化。
   本机已按上述状态安装：登记进 profile 的 dependencies + bundles（`^1.1.2`，裸目录手动部署于 `profiles/desktop/node_modules/dsh-commandcode`，lib/ 与 src/ 同步）。

---

## 6. 关键避坑与运行约束

1. **`lib/` 必须提交，且改 `src/` 后必须重建**。市场安装不做构建，缺少 `lib/` 就是「装了但没反应」。只提交 `src/` 的提交等于发布了一个坏包。
2. **不要在 `package.json` 里加回 `prepare` 脚本**。pnpm v10 会拦截它，市场安装当场失败——这正是 v1.1.2 修的那个坑。
3. **凭证是只写的**。API Key 保存后不会随 credentials Remote 视图回读到前端，设置页只显示「已配置」徽章并接受替换。任何「把 key 读回来显示」的需求都要重新设计，不要直接改视图。
4. **登录回调只绑回环**（127.0.0.1，端口 18700–18799）并做 CORS origin 校验；错误上下文会带 status/model/account/requestId，**绝不能带 key**。
5. **`/commandcode` 命令的本地化字符串必须静态 `import`**，早期在 ESM 里用 `require()` 直接运行时崩溃。
6. **`tsc --noEmit` 依赖 `tsconfig.json` 里的 `allowImportingTsExtensions`**，删了它整个类型检查就跑不起来。
7. **逐请求解析而非启动时快照**：API Key、`apiBase`、超时都是 thunk，改设置立刻对下一次请求生效，不需要重启。新增配置项请沿用这个模式。
8. **线路协议是私有的**：`/alpha/generate` 的自定义 SSE/JSONL 事件名（`text-delta`/`reasoning-*`/`tool-call`/`finish`/`error`）由 Command Code 定义，解析器在 `adapter.ts`，上游一改就会断流式。改动前先拿真实响应比对。
9. **CI 只跑类型检查 + 两个测试文件 + 构建**，不跑真实 API 调用；涉及真实模型的改动必须在本机手工走查一遍设置页与对话流（本项目 0.7.1 设计令牌对齐这部分尤甚）。
10. **发布流程**：测试通过 → 四文档齐备且版本一致 → `git tag -a vX.Y.Z -m "vX.Y.Z: 中文摘要"` → push `--tags` → 建 Release（标题与 tag subject 逐字一致，正文按 新增/修复/安全加固 分类）。
