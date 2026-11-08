# AGENTS.md

本文件为 AI 代理（ZCode / Claude Code 等）提供本项目级上下文。接手任务前先通读，再读 `HANDOFF.md` 了解最新进展。

## 项目概览

DSH 桌面版的 Command Code LLM 提供商插件：把本机 Command Code 代理（`http://127.0.0.1:9090`）以 LLM adapter 形式接入 DSH-Desktop，含模型目录同步（stale-while-revalidate）、请求重试、多凭证轮换与设置页 UI。

- 包名 `@jianfengwang/dsh-commandcode`，当前版本 **1.1.3**（2026-11-01 发布，兼容 DSH 0.2.x 宿主）。
- 技术栈：TypeScript + ESM（`"type": "module"`），tsdown 构建，测试用 Node 内置 `node:test` + tsx。
- 发布形态特殊：`lib/` 预构建产物**刻意提交进仓库**（市场安装不做构建），依赖以 `file:vendor/*.tgz` 本地包形式 vendored。
- 关键目录：`src/adapter.ts`（线路协议解析 + 重试策略，核心文件）、`src/` 其余为模型目录 / 多账号 / 凭证 / 本地化模块、`tests/`（node:test 回归测试）、`vendor/`（DSH peer 依赖 tgz，勿手改）、`cordis.patch.yml`（DSH bundle 补丁声明）、`polyfill.mjs`（构建入口 polyfill）。
- 运行环境：Node >= 20；CI 用 Node 22.x。

## 构建与测试命令

均已在 `package.json` scripts 与 `.github/workflows/ci.yml`（Node 22.x）中验证真实存在：

```bash
npm ci                # 安装依赖（vendor tgz 本地包，勿改用 registry 拉取）
npm run typecheck     # tsc --noEmit（lint 同义）
npm test              # node --import tsx --test tests/**/*.test.ts
npm run build         # tsdown 构建，产物落 lib/
npm run check:vendor  # 校验 vendor/ 与 package.json 一致
```

CI 流程：typecheck → test → build → 校验 `lib/index.js`、`lib/index.d.ts`、`lib/client.js` 存在 → **校验 `lib/` 与 `src/` 同步**（`git status --porcelain lib/` 非空即红）。CI 不跑真实 API 调用，涉及真实模型的改动必须本机手工走查设置页与对话流。

## 代码风格约定

- 缩进 2 空格，单引号，**语句末尾不加分号**；import 分组（node: 内置 → 类型 → 本地）。
- 文件头用 JSDoc 块注释概括模块职责与关键协议（见 `src/adapter.ts` 头部），内部注释克制、只在协议/坑点处出现。
- 命名 camelCase；类型与接口 PascalCase；测试文件 `tests/*.test.ts` 与 `src/` 结构对应。
- React 18（peer 依赖）写设置页 UI，client 端注入 `@deepseek-ai/dsh-client-connection` / `-locale` / `-ui-settings`（见 package.json `dsh` 字段），平台为 web。
- 配置项一律做成**逐请求 thunk 解析**（而非启动时快照），改设置立刻对下一次请求生效，沿用此模式。
- 错误对象（`CommandCodeError`）上下文带 status/model/account/requestId，**绝不能带 API key**。
- 登录回调只绑回环 127.0.0.1（端口 18700–18799）并做 CORS origin 校验。

## 提交与发布规范

- 提交信息用 Conventional Commits 且描述为中文：`fix(peers): ...`、`docs: ...`、`test: ...`、`chore(release): v1.1.3——<中文摘要>`。
- 变更记录写入 `CHANGELOG.md`（Keep a Changelog：`[Unreleased]` / `[X.Y.Z] - 日期`，中文六类分类）；版本发布需 package.json / CHANGELOG / README / HANDOFF 四文档齐备且版本一致。
- 发布流程：测试通过 → 四文档核验 → `git tag -a vX.Y.Z -m "vX.Y.Z: 中文摘要"` → `git push origin main --tags` → 建 GitHub Release（标题与 tag subject 逐字一致）。市场条目钉 `tarball:` 字段；裸名 `dsh-commandcode` 被第三方抢注勿用，npm 包为 `@jianfengwang/dsh-commandcode`（2026-11-08 换名首发）。

## 项目专属注意

1. **改 `src/` 后必须 `npm run build` 并把 `lib/` 的改动一并提交**——只提交 `src/` 等于发布坏包（市场装上没反应），CI 有同步校验会拦。
2. **不要在 package.json 加回 `prepare` 脚本**：pnpm v10 会拦截导致市场安装当场失败（v1.1.2 修过的坑）。
3. **凭证只写不回读**：API Key 保存后设置页只显示「已配置」徽章并接受替换，别做「把 key 读回来显示」的改动。
4. **`/commandcode` 命令的本地化字符串必须静态 `import`**（ESM 里用 `require()` 会运行时崩溃）；`tsconfig.json` 的 `allowImportingTsExtensions` 不能删，否则类型检查跑不起来。
5. **线路协议是私有的**：`/alpha/generate` 的 SSE/JSONL 事件名（`text-delta`/`reasoning-*`/`tool-call`/`finish`/`error`）由 Command Code 定义，解析在 `adapter.ts`，上游一改就断流式，改动前先拿真实响应比对。
