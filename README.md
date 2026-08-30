# dsh-commandcode

> Enhanced DSH-Desktop LLM provider plugin for [Command Code](https://commandcode.ai). Feature-parity with `dsh-commandcode-provider` plus robust catalog sync, configurable retry, multi-credential environments, and refined UI for DSH-Desktop 0.7.1.

[![CI](https://github.com/wjf1/dsh-commandcode/actions/workflows/ci.yml/badge.svg)](https://github.com/wjf1/dsh-commandcode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org/)

[English](README.md) | [中文](README.zh-CN.md)

---

## Features

### Core Capability (Feature Parity)
- **Provider Route Registration** — Registers the `commandcode` provider route on `ctx.llm`, making Command Code models selectable in any conversation
- **Models Page Card** — A dedicated provider card on the Models settings page with API key input and quick login
- **Live Model Catalog** — Real-time model directory fetching from the Command Code Provider API (`/provider/v1/models`) with on-disk cache
- **Credential Configuration** — API key via environment variable (`COMMANDCODE_API_KEY`), settings page, CLI auth file (`~/.commandcode/auth.json`), or built-in OAuth login flow
- **Streaming Generation** — Full SSE/JSONL streaming with text, reasoning, tool-call, and usage events

### Enhancements
- **Stale-While-Revalidate Catalog** — Serves cached models instantly, refreshes in the background; ETag conditional requests; circuit breaker prevents hammering a failing endpoint
- **Configurable Timeout & Retry** — Per-request timeout (first byte) and stream idle timeout, both adjustable in settings; exponential backoff with jitter for transient failures
- **Multi-Account Rotation** — Configure multiple API keys; automatic rotation on 429 rate-limit or 401 invalid-credential; active window probing to revive cooled-down accounts
- **Structured Error Diagnostics** — Every error carries a stable code, diagnostic context (status, model, account, request ID), and a user-facing troubleshooting hint
- **Plan-Aware Model Filtering** — Hides models above the account's subscription tier (fails open: unknown plan or on-demand credits show everything)
- **Usage & Billing Dashboard** — Per-account usage stats, 5-hour/weekly window limits with progress bars, subscription plan info, and credit balance
- **Image Input Support** — Vision-capable models accept image attachments via the durable attachment service

### UI Optimization
- **Redesigned Settings Page** — Clear card-based layout: Connection, Usage & Plan, Multi-Account, Advanced
- **Real-time Form Validation** — Invalid API base URL, non-positive timeout, etc. with inline error messages
- **Bilingual Interface** — Full Chinese/English localization following the browser language
- **DSH-Desktop 0.7.1 Design** — Aligned design tokens (`--dsw-alias-*`), rounded corners, smooth transitions, focus rings
- **Per-Account Usage Tabs** — Switch between accounts to view individual usage and plan status

### Version Adaptation
- **DSH-Desktop 0.7.1 Compatible** — Follows the bundle loading mechanism (`dsh.profile.bundles`) and client injection规范
- **One-Click Install** — Add to profile's `dsh.profile.bundles` and restart; no manual build steps required
- **TypeScript Build** — Reproducible build via `tsdown` with ESM output and type declarations

---

## Installation

### Prerequisites
- DSH-Desktop >= 0.7.1
- Node.js >= 22 (for development/build only; the desktop app bundles its own runtime)
- A Command Code account with API key or subscription

### Quick Install (Profile Bundle)

Add the plugin to your DSH profile's `package.json`:

```bash
# In your profile directory (e.g. ~/.dsh/profiles/desktop/)
npm install dsh-commandcode
```

Then add it to `dsh.profile.bundles` in `package.json`:

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

Restart DSH-Desktop. The Command Code provider will appear in the Models page.

### Manual Build from Source

```bash
git clone https://github.com/wjf1/dsh-commandcode.git
cd dsh-commandcode
npm install
npm run build
# Output in ./lib
```

---

## Configuration

### API Key

Three ways to configure, in order of precedence:

1. **Settings Page** — Go to Settings → Command Code, paste your API key, click Save
2. **Environment Variable** — Export `COMMANDCODE_API_KEY` in the shell that launches DSH
3. **CLI Auth File** — Run `command-code login` to write `~/.commandcode/auth.json`
4. **Built-in Login** — Click "Login with Browser" in the settings page for OAuth flow

### Settings Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKeyEnv` | string | `COMMANDCODE_API_KEY` | Environment variable name for the API key |
| `apiBase` | string | `https://api.commandcode.ai` | Command Code Provider API base URL |
| `workingDir` | string | `process.cwd()` | Working directory reported to the API |
| `modelsCachePath` | string | `~/.commandcode/models-cache.json` | Model catalog cache file path |
| `requestTimeoutMs` | number | `60000` | Time to wait for first response byte |
| `streamIdleTimeoutMs` | number | `300000` | Max stall allowed during streaming |
| `filterModelsByPlan` | boolean | `true` | Hide models unavailable on current plan |
| `accounts` | array | `[]` | Extra accounts for multi-account rotation |
| `activeAccount` | string | — | Manually selected active account slot id |
| `lang` | `'zh' \| 'en'` | `'zh'` | Language for the /commandcode terminal command |

### Multi-Account Configuration

```yaml
# cordis.patch.yml
- insert:
    - id: llm-commandcode
      name: "dsh-commandcode"
      config:
        apiKeyEnv: COMMANDCODE_API_KEY
        accounts:
          - label: "Work"
            apiKeyEnv: COMMANDCODE_API_KEY_WORK
          - label: "Personal"
            apiKeyEnv: COMMANDCODE_API_KEY_PERSONAL
```

When a request hits 429 (rate limit) or 401 (invalid key), the plugin automatically switches to the next usable account.

---

## Usage

### Selecting a Model

1. Open any conversation in DSH-Desktop
2. Click the model selector
3. Find the "Command Code" group
4. Select any available model (marked with `(CC)` suffix)

### Viewing Usage

- **Settings Page** — Go to Settings → Command Code → Usage & Plan card
- **Terminal Command** — Type `/commandcode` in the DSH terminal to see per-account usage, plan, and credit limits

### Login Flow

1. Go to Settings → Command Code
2. Click "Login with Browser"
3. Authorize in the opened browser tab
4. The API key is saved automatically — no restart needed

---

## Troubleshooting

### "No API key" error

Ensure at least one of:
- `COMMANDCODE_API_KEY` is set in the environment
- API key is saved in Settings → Command Code
- `command-code login` has been run (creates `~/.commandcode/auth.json`)

### "429 Rate Limit"

- The 5-hour usage window is exhausted
- Wait for the window to reset (shown in the Usage card)
- Add more accounts for automatic rotation
- Upgrade your Command Code subscription

### "401 Invalid Credential"

- The API key is expired or revoked
- Re-run the login flow or paste a new key
- Check that the environment variable contains the correct key

### Models not showing in selector

- Click "Refresh" in the Usage card to trigger a catalog refresh
- Check network connectivity to `api.commandcode.ai`
- The cached catalog is served even when offline; restart clears in-memory cache

### Stream stalls / disconnects

- Increase `streamIdleTimeoutMs` in Advanced settings
- Check network stability
- Long generations may exceed the idle timeout if the model is slow to respond

---

## Development

### Project Structure

```
dsh-commandcode/
├── src/
│   ├── index.ts            # Plugin entry: provider registration, settings, wiring
│   ├── adapter.ts          # LLM adapter: streaming, model catalog, usage endpoints
│   ├── catalog.ts          # Model catalog: SWR, cache, circuit breaker
│   ├── accounts.ts         # Multi-account pool: rotation, window probing
│   ├── login.ts            # OAuth login flow: loopback callback server
│   ├── login-wire.ts       # Login wire protocol types
│   ├── commands.ts         # /commandcode terminal command
│   ├── command-locales.ts  # Command i18n (zh/en)
│   ├── usage-remote.ts     # Usage Typert Gateway endpoints
│   ├── usage-wire.ts       # Usage wire protocol types
│   ├── errors.ts           # Structured error diagnostics
│   ├── retry.ts            # Retry policy, circuit breaker, backoff
│   └── client/
│       ├── index.ts        # Client entry: CSS, slots, controllers
│       ├── section.tsx     # Settings page React component
│       ├── card.tsx        # Models page provider card
│       ├── settings.ts     # Settings controller (state, validation, persist)
│       ├── login.ts        # Login controller (polling)
│       ├── usage.ts        # Usage controller (fetch, tabs)
│       ├── locales.ts      # Client i18n (zh/en)
│       ├── sessions.ts     # Friendly image-session error wrapper
│       ├── update.ts       # Update check
│       └── version.ts      # Version constants
├── tests/                  # Node test runner test suite
├── assets/                 # Icons and screenshots
├── cordis.patch.yml        # Bundle layer definition
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── README.md / README.zh-CN.md / CHANGELOG.md / LICENSE
```

### Build Commands

```bash
npm install          # Install dependencies
npm run typecheck    # TypeScript type check
npm test             # Run test suite
npm run build        # Build ESM output + type declarations to ./lib
```

### Architecture Notes

- **Host/Client Split**: `src/index.ts` runs in the Node.js host process; `src/client/index.ts` runs in the browser. The `dsh.client.inject` field in `package.json` declares the client bundle's dependencies.
- **Per-Request Resolution**: All connection facts (API key, endpoint, timeouts) are resolved fresh per request via thunks, so a settings change reaches the next request without restart.
- **Wire Protocol**: The Command Code Provider API uses a custom SSE/JSONL format (`/alpha/generate`). The adapter parses `text-delta`, `reasoning-*`, `tool-call`, `finish`, and `error` events.

---

## Acknowledgments

- [Mars-Sea/dsh-commandcode-provider](https://github.com/Mars-Sea/dsh-commandcode-provider) — The original community plugin that this project enhances. MIT License.
- The Command Code team for the Provider API and CLI.
- The DeepSeek Harness team for the plugin architecture and LLM adapter framework.

---

## License

[MIT](LICENSE) © 2026 dsh-commandcode contributors
