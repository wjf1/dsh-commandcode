# dsh-commandcode

> 面向 [Command Code](https://commandcode.ai) 的增强版 DSH-Desktop LLM 提供商插件。在完整对标 `dsh-commandcode-provider` 核心能力的基础上，提供更健壮的模型目录同步、可配置的超时与重试、多凭证环境支持，以及适配 DSH-Desktop 0.7.x（DeepSeek Harness 0.1.2-alpha.1）的精致界面。

[![CI](https://github.com/wjf1/dsh-commandcode/actions/workflows/ci.yml/badge.svg)](https://github.com/wjf1/dsh-commandcode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

[English](README.md) | [中文](README.zh-CN.md)

---

## 功能特性

### 核心能力（功能对齐）
- **提供商路由注册** — 在 `ctx.llm` 上注册 `commandcode` 提供商路由，使 Command Code 模型可在任意对话中选择
- **Models 页面卡片** — 在模型设置页面提供专属提供商卡片，包含 API Key 输入和快捷登录
- **实时模型目录** — 从 Command Code Provider API（`/provider/v1/models`）实时拉取模型列表，支持本地磁盘缓存
- **凭证配置** — 支持环境变量（`COMMANDCODE_API_KEY`）、设置页面、CLI 认证文件（`~/.commandcode/auth.json`）及内置 OAuth 登录流程
- **流式生成** — 完整的 SSE/JSONL 流式输出，支持文本、推理、工具调用和用量事件

### 功能增强
- **SWR 模型目录** — 即时返回缓存模型，后台静默刷新；ETag 条件请求；熔断器避免持续请求故障端点
- **可配置超时与重试** — 请求超时（首字节）和流式空闲超时均可在设置中调整；瞬时故障采用指数退避+抖动重试
- **多账户自动轮换** — 配置多个 API Key；遇到 429 限流或 401 凭证失效时自动切换到下一个可用账户；主动探测窗口以恢复冷却账户
- **结构化错误诊断** — 每个错误都携带稳定错误码、诊断上下文（状态码、模型、账户、请求 ID）和面向用户的排查提示
- **按套餐过滤模型** — 自动隐藏超出当前订阅套餐的模型（故障时开放：未知套餐或有按需额度时显示全部模型）
- **用量与套餐面板** — 逐账户用量统计、5小时/每周窗口限制进度条、订阅套餐信息和额度余额
- **图片输入支持** — 支持视觉能力的模型可通过持久化附件服务接收图片输入

### 界面优化
- **重新设计的设置页面** — 清晰的卡片式布局：连接配置、用量与套餐、多账户管理、高级设置
- **实时表单校验** — API 地址格式错误、超时非正数等即时内联错误提示
- **中英双语界面** — 完整的中/英文本地化，跟随浏览器语言
- **DSH-Desktop 0.7.1 设计规范** — 对齐设计令牌（`--dsw-alias-*`）、圆角、平滑过渡、焦点环
- **逐账户用量标签页** — 在账户间切换查看各自的用量和套餐状态

### 版本适配
- **兼容 DeepSeek Harness 0.1.2-alpha.1** — 面向 DSH Desktop 0.7.x：使用 `@deepseek-ai/dsh-client-store`（接替已删除的 `dsh-client-runtime`）、响应式 `SettingsScope` 快照契约、`credentials` Remote 命名空间，用量/登录后端走共享 `/api` 精确 Fetch 路由
- **一键安装** — 添加到 profile 的 `dsh.profile.bundles` 后重启即可，无需手动构建
- **TypeScript 构建** — 通过 `tsdown` 可复现构建，输出 ESM 格式和类型声明

---

## 安装

### 前置要求
- DSH-Desktop >= 0.7.0（DeepSeek Harness 0.1.2-alpha.1）
- Node.js >= 20（仅开发/构建需要；桌面应用自带运行时）
- 一个 Command Code 账户和 API Key 或订阅

### 快速安装（Profile Bundle）

在 DSH profile 的 `package.json` 中添加插件：

```bash
# 在 profile 目录下（如 ~/.dsh/profiles/desktop/）
npm install dsh-commandcode
```

然后在 `package.json` 的 `dsh.profile.bundles` 中添加：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-commandcode"
      ]
    }
  }
}
```

重启 DSH-Desktop。Command Code 提供商会出现在 Models 页面。

### 从源码手动构建

```bash
git clone https://github.com/wjf1/dsh-commandcode.git
cd dsh-commandcode
npm install
npm run build
# 输出在 ./lib 目录
```

---

## 配置

### API Key

三种配置方式，按优先级排列：

1. **设置页面** — 进入 设置 → Command Code，粘贴 API Key，点击保存
2. **环境变量** — 在启动 DSH 的 shell 中导出 `COMMANDCODE_API_KEY`
3. **CLI 认证文件** — 运行 `command-code login` 生成 `~/.commandcode/auth.json`
4. **内置登录** — 在设置页面点击"使用浏览器登录"进行 OAuth 授权

### 设置项参考

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKeyEnv` | string | `COMMANDCODE_API_KEY` | API Key 的环境变量名 |
| `apiBase` | string | `https://api.commandcode.ai` | Command Code Provider API 基础地址 |
| `workingDir` | string | `process.cwd()` | 上报给 API 的工作目录 |
| `modelsCachePath` | string | `~/.commandcode/models-cache.json` | 模型目录缓存文件路径 |
| `requestTimeoutMs` | number | `60000` | 等待响应首字节的超时时间（毫秒） |
| `streamIdleTimeoutMs` | number | `300000` | 流式传输中允许的最大停顿时间（毫秒） |
| `filterModelsByPlan` | boolean | `true` | 隐藏当前套餐不可用的模型 |
| `accounts` | array | `[]` | 用于多账户轮换的额外账户 |
| `activeAccount` | string | — | 手动选择的活跃账户槽位 ID |
| `lang` | `'zh' \| 'en'` | `'zh'` | /commandcode 终端命令的语言 |

### 多账户配置

```yaml
# cordis.patch.yml
- insert:
    - id: llm-commandcode
      name: "dsh-commandcode"
      config:
        apiKeyEnv: COMMANDCODE_API_KEY
        accounts:
          - label: "工作号"
            apiKeyEnv: COMMANDCODE_API_KEY_WORK
          - label: "个人号"
            apiKeyEnv: COMMANDCODE_API_KEY_PERSONAL
```

当请求遇到 429（限流）或 401（凭证无效）时，插件会自动切换到下一个可用账户。

---

## 使用方法

### 选择模型

1. 在 DSH-Desktop 中打开任意对话
2. 点击模型选择器
3. 找到 "Command Code" 分组
4. 选择任意可用模型（带有 `(CC)` 后缀标记）

### 查看用量

- **设置页面** — 进入 设置 → Command Code → 用量与套餐卡片
- **终端命令** — 在 DSH 终端中输入 `/commandcode` 查看逐账户用量、套餐和额度限制

### 登录流程

1. 进入 设置 → Command Code
2. 点击"使用浏览器登录"
3. 在打开的浏览器标签页中完成授权
4. API Key 自动保存，无需重启

---

## 常见问题

### "No API key" 错误

请确保至少满足以下一项：
- 环境中设置了 `COMMANDCODE_API_KEY`
- 在 设置 → Command Code 中保存了 API Key
- 已运行 `command-code login`（生成 `~/.commandcode/auth.json`）

### "429 Rate Limit" 限流

- 5小时用量窗口已耗尽
- 等待窗口重置（用量卡片中显示重置时间）
- 添加更多账户以实现自动轮换
- 升级 Command Code 订阅套餐

### "401 Invalid Credential" 凭证无效

- API Key 已过期或被撤销
- 重新运行登录流程或粘贴新的 Key
- 检查环境变量中是否包含正确的 Key

### 模型选择器中不显示模型

- 在用量卡片中点击"刷新"触发目录更新
- 检查到 `api.commandcode.ai` 的网络连接
- 离线时仍会提供缓存的目录；重启会清除内存缓存

### 流式传输停顿/断开

- 在高级设置中增大 `streamIdleTimeoutMs`
- 检查网络稳定性
- 模型响应较慢时，长生成可能超过空闲超时

---

## 开发指南

### 项目结构

```
dsh-commandcode/
├── src/
│   ├── index.ts            # 插件入口：提供商注册、设置、组件装配
│   ├── adapter.ts          # LLM 适配器：流式生成、模型目录、用量端点
│   ├── catalog.ts          # 模型目录：SWR、缓存、熔断器
│   ├── accounts.ts         # 多账户池：轮换、窗口探测
│   ├── login.ts            # OAuth 登录流程：回环回调服务器
│   ├── login-wire.ts       # 登录线路协议类型
│   ├── commands.ts         # /commandcode 终端命令
│   ├── command-locales.ts  # 命令国际化（中/英）
│   ├── usage-remote.ts     # 用量 Typert Gateway 端点
│   ├── usage-wire.ts       # 用量线路协议类型
│   ├── errors.ts           # 结构化错误诊断
│   ├── retry.ts            # 重试策略、熔断器、退避
│   └── client/
│       ├── index.ts        # 客户端入口：CSS、Slot、控制器
│       ├── section.tsx     # 设置页面 React 组件
│       ├── card.tsx        # Models 页面提供商卡片
│       ├── settings.ts     # 设置控制器（状态、校验、持久化）
│       ├── login.ts        # 登录控制器（轮询）
│       ├── usage.ts        # 用量控制器（获取、标签页）
│       ├── locales.ts      # 客户端国际化（中/英）
│       ├── sessions.ts     # 友好的图片会话错误包装
│       ├── update.ts       # 更新检查
│       └── version.ts      # 版本常量
├── tests/                  # Node 测试运行器测试套件
├── assets/                 # 图标和截图
├── cordis.patch.yml        # Bundle 层定义
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── README.md / README.zh-CN.md / CHANGELOG.md / LICENSE
```

### 构建命令

```bash
npm install          # 安装依赖
npm run typecheck    # TypeScript 类型检查
npm test             # 运行测试套件
npm run build        # 构建 ESM 输出 + 类型声明到 ./lib
```

### 架构说明

- **Host/Client 分离**：`src/index.ts` 运行在 Node.js 宿主进程中；`src/client/index.ts` 运行在浏览器中。`package.json` 中的 `dsh.client.inject` 字段声明客户端 bundle 的依赖。
- **逐请求解析**：所有连接参数（API Key、端点、超时）都通过 thunk 在每次请求时 fresh 解析，因此设置变更无需重启即可生效。
- **线路协议**：Command Code Provider API 使用自定义 SSE/JSONL 格式（`/alpha/generate`）。适配器解析 `text-delta`、`reasoning-*`、`tool-call`、`finish` 和 `error` 事件。

---

## 致谢

- [Mars-Sea/dsh-commandcode-provider](https://github.com/Mars-Sea/dsh-commandcode-provider) — 本项目增强的原始社区插件。MIT 许可证。
- Command Code 团队提供 Provider API 和 CLI。
- DeepSeek Harness 团队提供插件架构和 LLM 适配器框架。

---

## 许可证

[MIT](LICENSE) © 2026 dsh-commandcode 贡献者
