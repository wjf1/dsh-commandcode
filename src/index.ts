/**
 * dsh-commandcode — Enhanced DSH-Desktop LLM provider plugin for Command Code.
 *
 * Registers the `commandcode` provider route on `ctx.llm`, declares it in
 * the configurable-provider directory (Models page card), and wires up:
 * - Live model catalog with stale-while-revalidate + on-disk cache
 * - Multi-account pool with passive rotation and active window probing
 * - OAuth login flow with loopback callback server
 * - Per-account usage/billing report (Typert Gateway)
 * - /commandcode Host-side command for terminal usage
 * - Settings section with API key, endpoint, timeouts, and accounts
 *
 * ```yaml
 * - id: llm-commandcode
 *   name: "dsh-commandcode"
 *   config:
 *     apiKeyEnv: COMMANDCODE_API_KEY
 * ```
 *
 * @module dsh-commandcode
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

import {
  CommandCodeAdapter,
  DEFAULT_API_BASE,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  resolveAuthFileApiKey,
} from './adapter.ts'
import type {
  CommandCodeConnectionOptions,
  CommandCodeUsageReport,
} from './adapter.ts'
import {
  CommandCodeAccountPool,
  accountUsable,
  selectActiveAccount,
  buildSlots,
} from './accounts.ts'
import type { CommandCodeAccountConfig } from './accounts.ts'
import { applyCommands } from './commands.ts'
import { applyUsageRemote } from './usage-remote.ts'
import type { CommandCodeAccountsReport } from './usage-wire.ts'
import { CommandCodeLoginFlow } from './login.ts'
import type { CommandCodeLoginCredentials } from './login.ts'
import { pickCommandLocale, type LocaleId } from './command-locales.ts'
import { CommandCodeError, CommandCodeErrorCode } from './errors.ts'

// --- Re-exports for consumers and tests ---
export {
  COMMAND_CODE_CLI_VERSION,
  DEFAULT_API_BASE,
  DEFAULT_GENERATE_MAX_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  CommandCodeAdapter,
  KNOWN_EFFORTS,
  KNOWN_IMAGE_MODELS,
  KNOWN_PLANS,
  KNOWN_SUBSCRIPTION_PLANS,
  PLAN_LABELS,
  PLAN_ORDER,
  BILLING_ACCESS_TTL_MS,
  capabilityDescription,
  compareByPlan,
  formatContext,
  modelVisibleInPlan,
  planLabel,
  projectSlugFromPath,
  resolveAuthFileApiKey,
} from './adapter.ts'
export type {
  CommandCodeAdapterDeps,
  CommandCodeBillingAccess,
  CommandCodeConnectionOptions,
  CommandCodeUsageReport,
  ResolveAttachments,
} from './adapter.ts'

export { applyCommands, commandDefinition } from './commands.ts'
export type { CommandCodeCommandDeps } from './commands.ts'

export { applyUsageRemote, CommandCodeUsageService } from './usage-remote.ts'
export type { CommandCodeUsageDeps, LoginFlowFacade } from './usage-remote.ts'

export { USAGE_REPORT_ENDPOINT, usageReportSchema } from './usage-wire.ts'
export type { CommandCodeAccountUsage, CommandCodeAccountsReport } from './usage-wire.ts'

export {
  LOGIN_BEGIN_ENDPOINT,
  LOGIN_STATUS_ENDPOINT,
  LOGIN_CANCEL_ENDPOINT,
  parseLoginStatus,
  loginStatusSchema,
} from './login-wire.ts'
export type { CommandCodeLoginStatus, CommandCodeLoginFailureReason } from './login-wire.ts'

export {
  LOGIN_TIMEOUT_MS,
  LOGIN_START_PORT,
  LOGIN_MAX_PORT_ATTEMPTS,
  buildCommandAuthUrl,
  studioBaseForApiBase,
  validateCommandApiKey,
  CommandCodeLoginFlow,
} from './login.ts'
export type { CommandCodeLoginCredentials, CommandCodeLoginFlowDeps, ApiKeyValidation } from './login.ts'

export {
  CommandCodeAccountPool,
  accountUsable,
  selectActiveAccount,
  buildSlots,
  RETRY_MAX_DELAY_MS,
} from './accounts.ts'
export type {
  CommandCodeAccountConfig,
  CommandCodeAccountSlot,
  CommandCodeAccountState,
  ResolvedAccount,
} from './accounts.ts'

export { ModelCatalog } from './catalog.ts'
export type { CommandCodeModel } from './catalog.ts'

export {
  CommandCodeError,
  CommandCodeErrorCode,
  errorCodeFromStatus,
  httpError,
  wrapError,
} from './errors.ts'
export type { CommandCodeErrorContext, CommandCodeErrorHint } from './errors.ts'

export { buildRetryPolicy, CircuitBreaker, RETRYABLE_CODES, NON_RETRYABLE_CODES } from './retry.ts'

export { pickCommandLocale, zh, en } from './command-locales.ts'
export type { LocaleId, CommandLocale } from './command-locales.ts'

// --- Plugin identity ---
export const name = 'llm-commandcode'
export const inject = ['llm']

const NS = settingsNamespace('llm-commandcode')
const DEFAULT_API_KEY_ENV = 'COMMANDCODE_API_KEY'

/** The single provider route this plugin owns. */
export const PROVIDER = 'commandcode'
/** Default models cache path. */
export const DEFAULT_MODELS_CACHE_PATH = join(homedir(), '.commandcode', 'models-cache.json')

/**
 * Plugin config — validated by schemastery, doubles as the settings section
 * shape. Every field is optional: a missing API key resolves through
 * `apiKeyEnv` at each request (the web Models page writes it), with the
 * official Command Code CLI auth file as the last fallback.
 */
export interface Config {
  apiKeyEnv?: string
  apiKey?: string
  apiBase?: string
  workingDir?: string
  modelsCachePath?: string
  requestTimeoutMs?: number
  streamIdleTimeoutMs?: number
  filterModelsByPlan?: boolean
  accounts?: CommandCodeAccountConfig[]
  activeAccount?: string
  lang?: string
}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  apiKey: z.string(),
  apiBase: z.string(),
  workingDir: z.string(),
  modelsCachePath: z.string(),
  requestTimeoutMs: z.number().min(1).max(MAX_TIMER_DELAY_MS),
  streamIdleTimeoutMs: z.number().min(1).max(MAX_TIMER_DELAY_MS),
  filterModelsByPlan: z.boolean(),
  accounts: z.array(z.object({
    label: z.string(),
    apiKeyEnv: z.string().role('credential-ref'),
    apiKey: z.string(),
  })),
  activeAccount: z.string(),
  lang: z.string().pattern(/^(zh|en)$/).default('zh' as const),
})

/** One resolution's complete request facts. */
export interface ResolvedCommandCodeOptions extends CommandCodeConnectionOptions {
  apiKeyEnv: CredentialRef
}

export function resolveAdapterOptions(config: Config): ResolvedCommandCodeOptions {
  return {
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
    apiBase: config.apiBase ?? DEFAULT_API_BASE,
    workingDir: config.workingDir ?? process.cwd(),
    modelsCachePath: config.modelsCachePath ?? DEFAULT_MODELS_CACHE_PATH,
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    filterModelsByPlan: config.filterModelsByPlan ?? true,
  }
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedCommandCodeOptions | undefined

  const options = (): ResolvedCommandCodeOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    const next = resolveAdapterOptions(raw)
    lastRaw = raw
    lastGood = next
    return next
  }
  options()

  // --- Multi-account pool ---
  const slots = () => buildSlots(current(), DEFAULT_API_KEY_ENV)
  const preferredId = (): string | undefined => {
    const raw = current().activeAccount
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined
  }

  const resolveRef = async (ref: CredentialRef): Promise<string | undefined> => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      return hit?.value
    }
    const ambient = launchEnvironmentOf(ctx).get(ref)
    return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
  }

  const pool = new CommandCodeAccountPool({
    slots,
    resolveRef,
    authFileKey: async () => resolveAuthFileApiKey(),
    probeWindow: (apiKey: string) => adapter.probeFiveHourWindow(apiKey),
    preferredId,
  })

  const resolveApiKey = async (connection: ResolvedCommandCodeOptions): Promise<string> => {
    const resolved = await pool.resolveKey()
    if (resolved !== undefined) {
      return assertUsableApiKey(
        resolved.key,
        'llm-commandcode',
        resolved.slot.ref ?? `${resolved.slot.label} (config.apiKey)`,
      )
    }
    const ref = connection.apiKeyEnv
    throw new LlmError(
      `llm-commandcode: no API key for provider route "${PROVIDER}"; store ${ref} through the`
      + ' credentials service (the web Models page writes it), export it in the launching'
      + ' environment, set config.apiKey, or run the built-in login flow.',
      'MISSING_CREDENTIAL',
    )
  }

  // --- Adapter ---
  const adapter = new CommandCodeAdapter<ResolvedCommandCodeOptions>({
    options,
    resolveApiKey,
    rotateApiKey: async (rejectedKey, rejection, connection): Promise<string | undefined> => {
      pool.markRejected(rejectedKey, rejection)
      const resolved = await pool.resolveKey({ exclude: rejectedKey })
      return resolved === undefined
        ? undefined
        : assertUsableApiKey(
            resolved.key,
            'llm-commandcode',
            resolved.slot.ref ?? `${resolved.slot.label} (config.apiKey)`,
          )
    },
    resolveAttachments: () => {
      const attachments = ctx.get('attachments')
      return attachments === undefined ? undefined : attachments
    },
  })

  // --- Register provider ---
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'Command Code', settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerAdapter([PROVIDER], adapter)

  // --- Usage report ---
  const usageReports = async (): Promise<CommandCodeAccountsReport> => {
    const described = await pool.describeAccounts()
    const byId = new Map(described.map((a) => [a.slot.id, a]))
    const active = selectActiveAccount(await pool.resolvedAccounts(), preferredId())
    const entries = await Promise.all(slots().map(async (slot) => {
      const account = byId.get(slot.id)
      let report: CommandCodeUsageReport
      if (account === undefined) {
        report = { failures: [] }
      } else {
        try {
          report = await adapter.getUsage(account.key)
        } catch (error) {
          report = { failures: [error instanceof Error ? error.message : String(error)] }
        }
      }
      const state = account?.state
      const usable = accountUsable(state)
      return {
        id: slot.id,
        label: slot.label,
        configured: account !== undefined,
        active: account !== undefined && active?.slot.id === slot.id,
        mark: usable ? '' : state?.kind === 'disabled' ? 'invalid-credential' : 'rate-limit',
        cooldownUntil: !usable && state?.kind === 'cooldown' ? state.until : 0,
        report,
      }
    }))
    return { accounts: entries }
  }

  // --- /commandcode command ---
  const commandLocale = (): LocaleId => pickCommandLocale(current().lang)
  ctx.inject(['commands'], (commandCtx) => {
    applyCommands(commandCtx, { adapter, reports: usageReports, getLocale: commandLocale })
  })

  // --- Login flow ---
  const loginFlow = new CommandCodeLoginFlow({
    apiBase: () => options().apiBase,
    storeKey: async ({ apiKey }: CommandCodeLoginCredentials): Promise<void> => {
      const ref = credentialRef(current().apiKeyEnv ?? DEFAULT_API_KEY_ENV)
      const credentials = ctx.get('credentials')
      if (credentials === undefined) {
        throw new CommandCodeError(
          CommandCodeErrorCode.LOGIN_FAILED,
          'The credentials service is unavailable in this profile; paste the key manually.',
        )
      }
      await credentials.set(ref, apiKey)
    },
  })
  ctx.effect(() => () => loginFlow.dispose(), 'dsh-commandcode: login flow')

  // --- Usage remote (Typert Gateway) ---
  applyUsageRemote(ctx, { adapter, reports: usageReports, login: loginFlow })

  // --- Settings section ---
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {
      pool.reset()
    },
  })
}
