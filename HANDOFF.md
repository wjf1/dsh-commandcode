# HANDOFF — dsh-commandcode

> 跨会话接力文档。**新会话接手时先读本文件，再读代码。**
> 最后更新：2026-10-21 · 对应版本 `v1.1.2`

---

## 1. 项目概况与当前状态

**是什么**：`dsh-commandcode` 是一个 DSH-Desktop（DeepSeek Harness 桌面版）的 **LLM 提供商插件**，把 [Command Code](https://commandcode.ai) 的模型接入 DSH 的模型选择器。它在社区原版 `Mars-Sea/dsh-commandcode-provider`（MIT）的基础上重写增强：SWR 模型目录、可配置超时与重试、多账户轮换、结构化错误诊断、按套餐过滤模型、用量与计费面板、中英双语设置页。

**当前状态（截至 2026-10-21）**

| 项 | 状态 |
|---|---|
| 版本 | `package.json` = **1.1.2** |
| 分支 | `main` |
| 已验证功能 | 提供商路由注册、Models 页卡片、模型目录 SWR、设置页（连接/用量与套餐/多账户/高级）、`/commandcode` 终端命令、OAuth 回环登录、用量与套餐面板、多账户轮换 |
| 测试 | `npm test` 覆盖 `tests/accounts.test.ts`、`tests/errors.test.ts`（Node 内置 test runner，无第三方测试框架） |
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
├── tests/                  # accounts.test.ts / errors.test.ts
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

---

## 5. 待办与下一步

1. **补真实截图**：在 DSH Desktop 0.7.1 内实拍 `assets/panel-usage.png`、`assets/card-models.png`、`assets/settings-accounts.png`，把 `screenshots.json` 从空数组改成实际清单，再向市场提条目更新，让卡片带图。
2. **市场条目补版本**：`data/plugins/wjf1__dsh-commandcode.yml` 目前 version/npm 为空。仓库有了 tag 与 Release 后，提一次「更新条目」PR（改 description、确认 install 方式、加 screenshots）。
3. **可选：发 npm**。发布后市场抓取器才能填 `npm` 字段；同时 README「快速安装」的 `npm install dsh-commandcode` 才真正成立（当前该包在 npm 上是 404，安装只能走 GitHub）。
4. **补测试**：现有测试只覆盖 `accounts` 与 `errors`，`adapter` / `catalog` / `retry` 的回归仍有空档（README 早期宣传的「覆盖 errors/accounts/catalog/adapter」与实际测试文件不符，已在文档层按实际收口）。
5. **盯上游**：`0.1.2-alpha.1` 正式发到 npm 后，可以把 `vendor/` 从 `file:` devDependencies 换回正常版本区间并瘦身仓库。

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
