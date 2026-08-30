# Changelog

All notable changes to **dsh-commandcode** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
