# Contributing / 贡献指南

Thanks for your interest in improving dsh-commandcode! / 感谢你有兴趣改进 dsh-commandcode！

## Development Setup / 开发环境

### Prerequisites / 前置要求

- Node.js >= 20
- Git
- No DSH checkout required — see "Vendored @deepseek-ai packages" below / 无需本地 DSH 源码，见下文「内置的 @deepseek-ai 依赖」

### Install / 安装

```bash
# Clone the repo
git clone https://github.com/wjf1/dsh-commandcode.git
cd dsh-commandcode

# Install dependencies
npm install
# or with pnpm:
pnpm install
```

### Vendored @deepseek-ai packages / 内置的 @deepseek-ai 依赖

DeepSeek Harness `0.1.2-alpha.1` (bundled by DSH Desktop 0.7.x) has **not been
published to npm** yet. So that `npm ci`, tests, and builds work for everyone
without a local DSH checkout, the exact tarball closure the plugin compiles
against is committed under `vendor/` and referenced with `file:` paths in
`devDependencies`. The tarballs come from the same packages DSH Desktop itself
ships. When upstream publishes `0.1.2` to npm, swap the `file:` entries back to
semver ranges and delete `vendor/`.

DeepSeek Harness `0.1.2-alpha.1`（DSH Desktop 0.7.x 内置版本）**尚未发布到
npm**。为了让所有人无需本地 DSH 源码即可完成 `npm ci`、测试和构建，插件编译
所需的确切 tarball 闭包已提交到 `vendor/`，并在 `devDependencies` 中以
`file:` 路径引用。这些 tarball 与 DSH Desktop 实际打包的包完全一致。待上游
发布 `0.1.2` 后，把 `file:` 条目换回语义化版本范围并删除 `vendor/` 即可。

### Build / 构建

```bash
# Build ESM + type declarations to ./lib
npm run build

# Type-check only
npm run typecheck
```

### Test / 测试

```bash
# Run unit tests (Node test runner + tsx)
npm test
```

## Project Structure / 项目结构

```
src/
  index.ts              # Plugin entry: registers provider, settings, commands
  adapter.ts            # Core LLM adapter: chat completion, streaming, usage
  catalog.ts            # Model catalog with SWR + ETag + circuit breaker
  accounts.ts           # Multi-account pool with passive rotation + active probing
  login.ts              # OAuth login flow with loopback callback server
  commands.ts           # /commandcode terminal command
  errors.ts             # Structured error types with stable codes
  retry.ts              # Retry policy + circuit breaker
  usage-remote.ts       # Typert Gateway usage report remote
  login-wire.ts         # Login flow wire protocol (request/response schemas)
  usage-wire.ts         # Usage report wire protocol
  command-locales.ts    # Command output locales (zh/en)
client/
  index.ts              # Client entry: settings page + provider card + CSS
  section.tsx           # Settings page React component
  card.tsx              # Models page provider card React component
  settings.ts           # Settings state controller
  login.ts              # Login state controller
  usage.ts              # Usage display state controller
  locales.ts            # UI copy locales (zh/en)
  sessions.ts           # Image session error friendly messages
  update.ts             # Plugin update check
  version.ts            # Version constant
tests/
  errors.test.ts        # Error type unit tests
  accounts.test.ts      # Account pool unit tests
```

## Coding Standards / 编码规范

- **TypeScript** with strict mode (`strict: true` in tsconfig)
- 2-space indentation, UTF-8, LF line endings (see `.editorconfig`)
- No `any` without an explicit justification comment
- All exported functions and types must have JSDoc comments
- Error handling: use `CommandCodeError` with stable error codes from `errors.ts`

## Commit Messages / 提交信息

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

Examples:
- `feat(accounts): add active window probing for rate-limit detection`
- `fix(catalog): prevent stale cache overwrite on network failure`
- `docs(readme): add troubleshooting section for ERESOLVE errors`

## Pull Requests / 拉取请求

1. Fork the repository and create a feature branch
2. Make your changes with tests where applicable
3. Ensure `npm run typecheck` and `npm test` pass
4. Submit a PR with a clear description of the change
5. Link any related issues

## Reporting Issues / 报告问题

When filing a bug report, please include:

- DSH-Desktop version
- Plugin version
- Steps to reproduce
- Expected vs actual behavior
- Error messages or logs (with API keys redacted)
- Your configuration (API base, timeout settings, etc.)

## License / 许可证

By contributing, you agree that your contributions will be licensed under the MIT License.

贡献即表示你同意你的贡献将以 MIT 许可证发布。
