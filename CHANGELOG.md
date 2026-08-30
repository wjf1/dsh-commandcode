# Changelog

All notable changes to **dsh-commandcode** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
