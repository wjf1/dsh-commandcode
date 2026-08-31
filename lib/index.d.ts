import z from "@deepseek-ai/schemastery";
import { GenerateOptions, LlmAdapter, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, ResolvedRetryPolicy, StreamChunk } from "@deepseek-ai/dsh-llm";
import { CredentialRef } from "@deepseek-ai/dsh-credentials";
import { Context } from "@deepseek-ai/cordis";
import { AttachmentStore } from "@deepseek-ai/dsh-attachment";
//#region src/adapter.d.ts
/** Default API base for the Command Code Provider API. */
declare const DEFAULT_API_BASE = "https://api.commandcode.ai";
/** Default request timeout (first byte): 60s. */
declare const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
/** Default stream idle timeout: 300s. */
declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Default max output tokens (capped by context window). */
declare const DEFAULT_MAX_OUTPUT_TOKENS = 32768;
/** Hard cap on generate max_tokens. */
declare const DEFAULT_GENERATE_MAX_TOKENS = 65536;
/** CLI version reported to the API (the endpoint rejects clients below its
 *  `minVersion` when the `x-command-code-version` header is missing). */
declare const COMMAND_CODE_CLI_VERSION = "1.38.2";
/** Models with selectable reasoning effort (from command-code@1.37.0 registry). */
declare const KNOWN_EFFORTS: Readonly<Record<string, readonly string[]>>;
/** Vision-capable models (from command-code registry). */
declare const KNOWN_IMAGE_MODELS: ReadonlySet<string>;
/** Subscription plan tiers (lower index = more accessible). */
declare const KNOWN_PLANS: Readonly<Record<string, string>>;
declare const PLAN_LABELS: Readonly<Record<string, string>>;
declare const PLAN_ORDER: Readonly<Record<string, number>>;
/** Known subscription plans with monthly credit totals. */
declare const KNOWN_SUBSCRIPTION_PLANS: Readonly<Record<string, {
  name: string;
  monthlyCredits: number;
}>>;
/** Billing access TTL (5 minutes). */
declare const BILLING_ACCESS_TTL_MS: number;
/** Connection facts resolved fresh per request. */
interface CommandCodeConnectionOptions {
  apiBase: string;
  workingDir: string;
  modelsCachePath: string;
  requestTimeoutMs: number;
  streamIdleTimeoutMs: number;
  filterModelsByPlan?: boolean;
}
/** Resolve the durable attachment service, or undefined. */
type ResolveAttachments = () => AttachmentStore | undefined;
/** Everything the adapter needs. */
interface CommandCodeAdapterDeps<C extends CommandCodeConnectionOptions = CommandCodeConnectionOptions> {
  options: () => C;
  resolveApiKey: (connection: C) => Promise<string>;
  rotateApiKey?: (rejectedKey: string, rejection: 'rate-limit' | 'invalid-credential', connection: C) => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  resolveAttachments?: ResolveAttachments;
}
/** Account identity from /alpha/whoami. */
interface CommandCodeAccount {
  id: string;
  name: string;
  userName: string;
}
/** Usage summary from /alpha/usage/summary. */
interface CommandCodeUsage {
  totalCount: number;
  totalCost: number;
  successRate: number;
  completedCount: number;
  failedCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCredits: number;
  periodBasis: string;
}
/** Credit/limit state from /alpha/billing/credits. */
interface CommandCodeCredits {
  monthlyCredits: number;
  purchasedCredits: number;
  freeCredits: number;
  fiveHour: {
    used: number;
    cap: number;
    exceeded: boolean;
    resetAt: number;
  };
  weekly: {
    used: number;
    cap: number;
    exceeded: boolean;
    resetAt: number;
  };
}
/** Subscription plan state. */
interface CommandCodePlan {
  planId: string;
  name: string;
  status: string;
  monthlyCredits: number | null;
  currentPeriodEnd: number;
}
/** Why every usage endpoint failed at once. */
type UsageBlockReason = 'invalid-key' | 'service-unavailable' | 'network';
/** Full usage report (degrades per-endpoint). */
interface CommandCodeUsageReport {
  account?: CommandCodeAccount;
  usage?: CommandCodeUsage;
  credits?: CommandCodeCredits;
  plan?: CommandCodePlan;
  failures: string[];
  blocked?: UsageBlockReason;
}
/** Billing access snapshot (for plan-based model filtering). */
interface CommandCodeBillingAccess {
  planId?: string;
  planName?: string;
  onDemandCredits: number;
  fetchedAt: number;
}
/** Extract the API key from the CLI auth file (~/.commandcode/auth.json). */
declare function resolveAuthFileApiKey(): string | undefined;
declare function planLabel(modelId: string): string | undefined;
declare function compareByPlan(a: {
  id: string;
}, b: {
  id: string;
}): number;
declare function modelVisibleInPlan(modelId: string, access: CommandCodeBillingAccess | undefined): boolean;
declare function formatContext(contextWindow: number): string;
declare function capabilityDescription(modelId: string, contextWindow?: number): string;
declare function projectSlugFromPath(pathName: string): string;
declare class CommandCodeAdapter<C extends CommandCodeConnectionOptions = CommandCodeConnectionOptions> extends LlmAdapter {
  private readonly deps;
  private readonly catalog;
  private readonly fetchImpl;
  private readonly resolveAttachments;
  private readonly billingAccess;
  private readonly billingAccessInflight;
  constructor(deps: CommandCodeAdapterDeps<C>);
  providerInfo(provider: string): LlmProviderInfo;
  providerRetryPolicy(_provider: string): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy;
  listModels(provider: string): Promise<readonly LlmModelInfo[]>;
  resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
  /**
   * Probe one account's five-hour window (for the multi-account pool).
   */
  probeFiveHourWindow(apiKey: string): Promise<{
    exceeded: boolean;
    resetAt: number;
  } | undefined>;
  /**
   * Fetch the full usage report for one API key (4 endpoints, degraded).
   */
  getUsage(apiKey: string): Promise<CommandCodeUsageReport>;
  /** Load billing access (cached per API key, TTL-gated). */
  private loadBillingAccess;
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
//#endregion
//#region src/accounts.d.ts
/** Max delay for retry-after (matches dsh-llm's cap). */
declare const RETRY_MAX_DELAY_MS: number;
/** One configured account entry from settings. */
interface CommandCodeAccountConfig {
  /** Human-readable label shown in the UI. */
  label?: string;
  /** Environment variable name holding the API key (credential ref). */
  apiKeyEnv?: string;
  /** Literal API key (composition config only; not shown in UI). */
  apiKey?: string;
}
/** Runtime slot for one account. */
interface CommandCodeAccountSlot {
  /** Stable id: credential ref name, or `default` / `account-N`. */
  id: string;
  /** Display label. */
  label: string;
  /** Credential reference (env var), when the account uses one. */
  ref?: CredentialRef;
  /** Literal API key, when the account uses one. */
  literal?: string;
  /** Whether this slot may fall back to the CLI auth file (`~/.commandcode/auth.json`). */
  allowAuthFile: boolean;
}
/** Account state tracked by the pool. */
type CommandCodeAccountState = {
  kind: 'ok';
} | {
  kind: 'cooldown';
  rejection: 'rate-limit' | 'invalid-credential';
  until: number;
} | {
  kind: 'disabled';
  rejection: 'invalid-credential';
};
/** One resolved account (slot + resolved key + state). */
interface ResolvedAccount {
  slot: CommandCodeAccountSlot;
  key: string;
  state: CommandCodeAccountState;
}
/** Dependencies for the account pool. */
interface CommandCodeAccountPoolDeps {
  /** Rebuild the slot list from live config (called per resolution). */
  slots: () => CommandCodeAccountSlot[];
  /** Resolve a credential ref to its value. */
  resolveRef: (ref: CredentialRef) => Promise<string | undefined>;
  /** Read the API key from the CLI auth file. */
  authFileKey: () => Promise<string | undefined>;
  /** Probe one key's 5-hour window (returns exceeded + resetAt, or undefined on failure). */
  probeWindow: (apiKey: string) => Promise<{
    exceeded: boolean;
    resetAt: number;
  } | undefined>;
  /** Manually preferred account id (settings). */
  preferredId: () => string | undefined;
}
/**
 * Multi-account pool.
 *
 * Rotation is passive: a key is marked only when a request using it is
 * actually rejected (429/401). When every account is marked, the pool
 * probes windows to revive cooled-down accounts. The steady state costs
 * zero extra API calls.
 */
declare class CommandCodeAccountPool {
  private readonly deps;
  /** Keyed by resolved API key (process-local, never logged). */
  private readonly states;
  private probeInflight;
  constructor(deps: CommandCodeAccountPoolDeps);
  /**
   * Resolve the next usable API key.
   * @param exclude Optional key to exclude (just-rejected, for rotation).
   */
  resolveKey(opts?: {
    exclude?: string;
  }): Promise<ResolvedAccount | undefined>;
  /** Mark a key as rejected (rate-limit or invalid-credential). */
  markRejected(key: string, rejection: 'rate-limit' | 'invalid-credential'): void;
  /** Describe all accounts (for the settings page UI). */
  describeAccounts(): Promise<ResolvedAccount[]>;
  /** Get all resolved accounts (for active selection logic). */
  resolvedAccounts(): Promise<ResolvedAccount[]>;
  /** Clear all state (e.g. when settings change drastically). */
  reset(): void;
  private resolveSlotKey;
  private isUsable;
  private select;
  /** Probe all marked accounts' windows to revive cooled-down ones. */
  private probeAllWindows;
}
/** Whether an account state is currently usable (exported for UI). */
declare function accountUsable(state: CommandCodeAccountState | undefined): boolean;
/** Select the active account from a list, respecting preferred id. */
declare function selectActiveAccount(accounts: ResolvedAccount[], preferredId: string | undefined): ResolvedAccount | undefined;
/** Build slot list from raw config (shared between index.ts and tests). */
declare function buildSlots(config: {
  apiKeyEnv?: string;
  apiKey?: string;
  accounts?: CommandCodeAccountConfig[];
}, defaultEnv: string): CommandCodeAccountSlot[];
//#endregion
//#region src/usage-wire.d.ts
/**
 * Usage wire protocol types — shared between Host and Client.
 *
 * The Host exposes a `GET /api/commandcode/report` Fetch route that returns
 * per-account usage, billing, and plan data for the settings page. The
 * payloads travel as plain JSON (no generated Remote codec), so the Client
 * side validates defensively through `parseAccountsReport`.
 */
/** Fetch route path (mounted on the shared `/api` channel). */
declare const USAGE_REPORT_PATH = "/api/commandcode/report";
/** One account's usage entry in the report. */
interface CommandCodeAccountUsage {
  id: string;
  label: string;
  configured: boolean;
  active: boolean;
  mark: '' | 'rate-limit' | 'invalid-credential';
  cooldownUntil: number;
  report: {
    account?: {
      id: string;
      name: string;
      userName: string;
    };
    usage?: {
      totalCount: number;
      totalCost: number;
      successRate: number;
      completedCount: number;
      failedCount: number;
      totalTokensIn: number;
      totalTokensOut: number;
      totalCredits: number;
      periodBasis: string;
    };
    credits?: {
      monthlyCredits: number;
      purchasedCredits: number;
      freeCredits: number;
      fiveHour: {
        used: number;
        cap: number;
        exceeded: boolean;
        resetAt: number;
      };
      weekly: {
        used: number;
        cap: number;
        exceeded: boolean;
        resetAt: number;
      };
    };
    plan?: {
      planId: string;
      name: string;
      status: string;
      monthlyCredits: number | null;
      currentPeriodEnd: number;
    };
    failures: string[];
    blocked?: 'invalid-key' | 'service-unavailable' | 'network';
  };
}
/** Full usage report returned by the endpoint. */
interface CommandCodeAccountsReport {
  accounts: CommandCodeAccountUsage[];
}
/**
 * Parse a raw report response (defensive: drops malformed entries instead of
 * throwing, so a partial Host report still renders).
 */
declare function parseAccountsReport(value: unknown): CommandCodeAccountsReport;
//#endregion
//#region src/command-locales.d.ts
/**
 * Command locale strings for the /commandcode Host-side command.
 *
 * Host commands cannot read the client's locale service, so language is
 * resolved from the explicit `lang` config or the launching shell's
 * LC_ALL/LANG. Two surfaces, two independent locales.
 */
type LocaleId = 'zh' | 'en';
/** All translatable strings for the /commandcode command. */
interface CommandLocale {
  commandName: string;
  commandDescription: string;
  usageTitle: string;
  accountLabel: string;
  planLabel: string;
  creditsLabel: string;
  monthlyCredits: string;
  purchasedCredits: string;
  freeCredits: string;
  fiveHourWindow: string;
  weeklyWindow: string;
  used: string;
  cap: string;
  exceeded: string;
  resetsAt: string;
  totalRequests: string;
  successRate: string;
  totalCost: string;
  tokensIn: string;
  tokensOut: string;
  noAccountsConfigured: string;
  noKeyFound: string;
  fetchingUsage: string;
  usageFetchFailed: string;
  activeAccount: string;
  rateLimited: string;
  invalidCredential: string;
  refreshHint: string;
}
/** Chinese strings. */
declare const zh: CommandLocale;
/** English strings. */
declare const en: CommandLocale;
/**
 * Pick the command locale from the explicit config or shell environment.
 * An unknown value is treated as "unset" → falls back to shell → 'zh'.
 */
declare function pickCommandLocale(lang?: string): LocaleId;
//#endregion
//#region src/commands.d.ts
/** Dependencies for the command. */
interface CommandCodeCommandDeps {
  reports: () => Promise<CommandCodeAccountsReport>;
  getLocale: () => LocaleId;
}
/** Command definition (for registration with the commands service). */
declare const commandDefinition: {
  name: string;
  description: {
    zh: string;
    en: string;
  };
};
/**
 * Apply the /commandcode command to the commands context.
 */
declare function applyCommands(ctx: Context, deps: CommandCodeCommandDeps): void;
//#endregion
//#region src/login-wire.d.ts
/**
 * Login wire protocol types — shared between Host and Client.
 *
 * The Host exposes three GET Fetch routes on the shared `/api` channel:
 *   - /api/commandcode/login/begin: start the OAuth flow (returns the
 *     authorization URL)
 *   - /api/commandcode/login/status: poll the flow status
 *   - /api/commandcode/login/cancel: abort an in-progress flow
 *
 * Payloads travel as plain JSON; the Client validates them defensively
 * through `parseLoginStatus`.
 */
/** Fetch route paths (mounted on the shared `/api` channel). */
declare const LOGIN_BEGIN_PATH = "/api/commandcode/login/begin";
declare const LOGIN_STATUS_PATH = "/api/commandcode/login/status";
declare const LOGIN_CANCEL_PATH = "/api/commandcode/login/cancel";
/** Why a login flow failed. */
type CommandCodeLoginFailureReason = 'timeout' | 'cancelled' | 'callback-error' | 'invalid-key' | 'store-error' | 'network';
/** Login flow status returned by the status endpoint. */
interface CommandCodeLoginStatus {
  /** Current phase. */
  phase: 'idle' | 'pending' | 'success' | 'failed';
  /** Authorization URL (present when phase = 'pending'). */
  authUrl?: string;
  /** Failure reason (present when phase = 'failed'). */
  failure?: CommandCodeLoginFailureReason;
  /** Human-readable failure message. */
  message?: string;
  /** Timestamp when the flow started (epoch ms). */
  startedAt?: number;
  /** Timestamp when the flow completed (epoch ms). */
  completedAt?: number;
}
/** Parse a raw status response (defensive: returns idle on bad input). */
declare function parseLoginStatus(value: unknown): CommandCodeLoginStatus;
//#endregion
//#region src/login.d.ts
/** Login flow timeout (5 minutes). */
declare const LOGIN_TIMEOUT_MS: number;
/** Start of the loopback port range. */
declare const LOGIN_START_PORT = 18700;
/** Number of ports to try before giving up. */
declare const LOGIN_MAX_PORT_ATTEMPTS = 100;
/** Credentials delivered by a successful login. */
interface CommandCodeLoginCredentials {
  apiKey: string;
  /** Optional: the account email or username (for display). */
  account?: string;
}
/** Dependencies for the login flow. */
interface CommandCodeLoginFlowDeps {
  /** Resolve the current API base (settings-aware). */
  apiBase: () => string;
  /** Store the delivered API key through the credentials seam. */
  storeKey: (creds: CommandCodeLoginCredentials) => Promise<void>;
  /** HTTP transport override (tests). */
  fetchImpl?: typeof fetch;
}
/** Result of API key validation. */
interface ApiKeyValidation {
  valid: boolean;
  account?: string;
  error?: string;
}
/**
 * Build the Command Code authorization URL for the given callback port.
 */
declare function buildCommandAuthUrl(apiBase: string, port: number): string;
/** Derive the studio (web UI) base from the API base. */
declare function studioBaseForApiBase(apiBase: string): string;
/**
 * Validate an API key by calling the /alpha/whoami endpoint.
 * Returns the account info when valid.
 */
declare function validateCommandApiKey(apiKey: string, apiBase: string, fetchImpl?: typeof fetch): Promise<ApiKeyValidation>;
/**
 * Login flow controller. One instance per plugin lifecycle.
 * Only one flow can be active at a time.
 */
declare class CommandCodeLoginFlow {
  private readonly deps;
  private server;
  private port;
  private status;
  private timeoutHandle;
  private readonly fetchImpl;
  constructor(deps: CommandCodeLoginFlowDeps);
  /** Current status (for the status endpoint). */
  getStatus(): CommandCodeLoginStatus;
  /**
   * Begin the login flow. Binds the callback server and returns the
   * authorization URL. Throws if a flow is already active.
   */
  begin(): Promise<CommandCodeLoginStatus>;
  /** Cancel an in-progress flow. */
  cancel(): Promise<CommandCodeLoginStatus>;
  /** Dispose: clean up server and timers. */
  dispose(): void;
  private bindServer;
  private handleCallback;
  private processCallback;
  private sendError;
  private fail;
  private cleanup;
}
//#endregion
//#region src/usage-remote.d.ts
/** Dependencies for the usage remote. */
interface CommandCodeUsageDeps {
  adapter: Pick<CommandCodeAdapter, 'getUsage'>;
  reports: () => Promise<CommandCodeAccountsReport>;
  login: CommandCodeLoginFlow;
}
/** Login flow facade (for the usage remote to call). */
interface LoginFlowFacade {
  begin: () => Promise<unknown>;
  cancel: () => Promise<unknown>;
  getStatus: () => unknown;
}
/**
 * Apply the usage remote: register the `/api/commandcode/*` Fetch routes.
 */
declare function applyUsageRemote(ctx: Context, deps: CommandCodeUsageDeps): void;
/**
 * Usage service wrapper (for tests and direct access).
 */
declare class CommandCodeUsageService {
  private readonly deps;
  constructor(deps: CommandCodeUsageDeps);
  getReport(): Promise<CommandCodeAccountsReport>;
  getUsageForAccount(apiKey: string): Promise<CommandCodeUsageReport>;
}
//#endregion
//#region src/catalog.d.ts
/**
 * Model catalog manager with stale-while-revalidate, on-disk cache,
 * background refresh, and a circuit breaker.
 *
 * Enhancement over the reference plugin:
 * - Stale-while-revalidate: return cached catalog immediately, refresh in
 *   the background so the picker never blocks on a slow network.
 * - Explicit cache TTL with stale-accept window.
 * - Circuit breaker: after N consecutive failures, stop hammering the
 *   endpoint and serve cache immediately.
 * - Atomic cache writes (write-temp + rename) to avoid corrupt cache files.
 * - ETag / If-Modified-Since support to reduce bandwidth when the API
 *   supports it.
 */
/** One model entry from the Command Code Provider API. */
interface CommandCodeModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
}
/**
 * Model catalog manager.
 *
 * Usage:
 * ```ts
 * const catalog = new ModelCatalog({ apiBase: () => opts.apiBase, cachePath, fetchImpl })
 * const models = await catalog.list() // SWR: returns cache immediately, refreshes in background
 * ```
 */
declare class ModelCatalog {
  private readonly deps;
  private memory;
  private memoryFetchedAt;
  private memoryEtag?;
  private readonly breaker;
  private refreshInFlight;
  private readonly ttlMs;
  private readonly staleMs;
  constructor(deps: {
    /** Resolve the current API base (settings-aware). */
    apiBase: () => string;
    /** Path to the on-disk cache file. */
    cachePath: () => string;
    /** HTTP transport override (tests). */
    fetchImpl?: typeof fetch;
    /** Cache TTL in ms (default 1h). */
    ttlMs?: number;
    /** Stale-accept window in ms (default 24h). */
    staleMs?: number;
  });
  /** Whether the in-memory catalog is fresh enough to serve. */
  private get isFresh();
  /** Whether the in-memory catalog is within the stale-accept window. */
  private get isStaleAcceptable();
  /**
   * List models with stale-while-revalidate.
   *
   * - If the in-memory catalog is fresh, return it immediately.
   * - If stale but within the accept window, return it and trigger a
   *   background refresh (non-blocking).
   * - If no memory or too stale, try to load from disk cache; if that
   *   fails and the breaker is closed, do a blocking fetch.
   */
  list(): Promise<CommandCodeModel[]>;
  /**
   * Force a refresh (bypasses cache). Used by the "Refresh models" button.
   */
  refreshNow(): Promise<CommandCodeModel[]>;
  /** Find a model by id (checks memory first, then triggers refresh). */
  find(modelId: string): Promise<CommandCodeModel | undefined>;
  /** Current catalog state for diagnostics. */
  get state(): {
    count: number;
    fetchedAt: number;
    fresh: boolean;
    circuit: 'closed' | 'open' | 'half-open';
  };
  /** Trigger a non-blocking background refresh (deduped). */
  private scheduleBackgroundRefresh;
  /**
   * Perform a catalog refresh.
   * @param blocking If true, throw on failure; if false, log and keep stale.
   * @param force If true, bypass the circuit breaker.
   */
  private refresh;
}
//#endregion
//#region src/errors.d.ts
/**
 * Enhanced error diagnostics for dsh-commandcode.
 *
 * Structured error codes, diagnostic context, and user-facing troubleshooting
 * hints. Every error the adapter surfaces carries a stable code, a machine-
 * readable context object, and a hint that guides the user to the fix.
 */
/** Stable error codes — never renumber, only append. */
declare enum CommandCodeErrorCode {
  /** No API key could be resolved from any source. */
  MISSING_CREDENTIAL = "MISSING_CREDENTIAL",
  /** The resolved API key was rejected (401). */
  INVALID_CREDENTIAL = "INVALID_CREDENTIAL",
  /** Usage window exhausted (429). */
  RATE_LIMIT = "RATE_LIMIT",
  /** The model is not available on the current subscription plan. */
  MODEL_NOT_IN_PLAN = "MODEL_NOT_IN_PLAN",
  /** The requested model does not exist in the catalog. */
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  /** The Command Code API returned an unexpected response shape. */
  PROVIDER_PROTOCOL_ERROR = "PROVIDER_PROTOCOL_ERROR",
  /** The request timed out before headers arrived. */
  REQUEST_TIMEOUT = "REQUEST_TIMEOUT",
  /** The stream stalled beyond the idle timeout. */
  STREAM_IDLE_TIMEOUT = "STREAM_IDLE_TIMEOUT",
  /** A network-level failure (no HTTP response). */
  NETWORK_ERROR = "NETWORK_ERROR",
  /** The Command Code service returned 5xx. */
  SERVER_ERROR = "SERVER_ERROR",
  /** The request carried unsupported content (e.g. images to a non-vision model). */
  UNSUPPORTED_CONTENT = "UNSUPPORTED_CONTENT",
  /** The request carried an unsupported option (e.g. stop sequences). */
  UNSUPPORTED_OPTION = "UNSUPPORTED_OPTION",
  /** The model catalog endpoint failed and no cache is available. */
  CATALOG_UNAVAILABLE = "CATALOG_UNAVAILABLE",
  /** The login flow was cancelled or timed out. */
  LOGIN_FAILED = "LOGIN_FAILED",
  /** An internal invariant was violated. */
  INTERNAL_ERROR = "INTERNAL_ERROR"
}
/** HTTP status → error code mapping. */
declare function errorCodeFromStatus(status: number): CommandCodeErrorCode;
/** Diagnostic context attached to every CommandCodeError. */
interface CommandCodeErrorContext {
  /** The provider route (always `commandcode`). */
  provider: string;
  /** The model id, when the error is model-specific. */
  model?: string;
  /** The API endpoint that failed, when applicable. */
  endpoint?: string;
  /** HTTP status code, when the error came from an HTTP response. */
  status?: number;
  /** Retry-After header value in milliseconds, when the server sent one. */
  retryAfterMs?: number;
  /** The account slot id that produced this error (multi-account). */
  accountId?: string;
  /** Number of attempts made before surfacing. */
  attempts?: number;
  /** Timestamp when the error was created (epoch ms). */
  timestamp: number;
  /** Request id from the server, when available. */
  requestId?: string;
}
/** User-facing troubleshooting hint. */
interface CommandCodeErrorHint {
  /** Short, actionable hint shown in the UI. */
  message: string;
  /** Optional documentation anchor or URL. */
  docRef?: string;
}
/**
 * Structured error with diagnostic context and a user-facing hint.
 * Extends the harness LlmError contract so it flows through the retry
 * executor unchanged.
 */
declare class CommandCodeError extends Error {
  readonly code: CommandCodeErrorCode;
  readonly context: CommandCodeErrorContext;
  readonly hint: CommandCodeErrorHint;
  readonly cause?: unknown;
  constructor(code: CommandCodeErrorCode, message: string, context?: Partial<CommandCodeErrorContext>, cause?: unknown);
  /** Serialize for logging and UI display (no secrets). */
  toJSON(): Record<string, unknown>;
  /** One-line diagnostic summary for logs. */
  get diagnostic(): string;
}
/**
 * Wrap a raw error (fetch failure, JSON parse error, etc.) into a
 * CommandCodeError with the appropriate code and context.
 */
declare function wrapError(error: unknown, code: CommandCodeErrorCode, context?: Partial<CommandCodeErrorContext>): CommandCodeError;
/**
 * Classify an HTTP error response into a CommandCodeError.
 * Reads Retry-After and request-id headers when present.
 */
declare function httpError(status: number, bodyText: string, context?: Partial<CommandCodeErrorContext>, retryAfterMs?: number, requestId?: string): CommandCodeError;
//#endregion
//#region src/retry.d.ts
/** Default retry configuration. */
declare const DEFAULT_RETRY_CONFIG: {
  /** Maximum retry attempts for transient errors. */
  readonly maxRetries: 12;
  /** Initial backoff delay in milliseconds. */
  readonly initialDelayMs: 500;
  /** Maximum backoff delay in milliseconds (cap). */
  readonly maxDelayMs: number;
  /** Jitter ratio (0–1) applied to each delay. */
  readonly jitterRatio: 0.1;
  /** Circuit breaker: consecutive failures before opening. */
  readonly circuitThreshold: 20;
  /** Circuit breaker: cooldown in ms before half-open. */
  readonly circuitCooldownMs: number;
};
/** Error codes that are always retryable (transient). */
declare const RETRYABLE_CODES: readonly ["EMPTY_RESPONSE", "RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT"];
/** Error codes that are never retried (permanent). */
declare const NON_RETRYABLE_CODES: readonly ["INVALID_CREDENTIAL", "UNSUPPORTED_CONTENT", "UNSUPPORTED_OPTION", "MODEL_NOT_IN_PLAN", "MODEL_NOT_FOUND", "MISSING_CREDENTIAL"];
/**
 * Build the resolved retry policy for the provider route.
 * Captured once at registration; per-request overrides flow through
 * the adapter's options thunk instead.
 */
declare function buildRetryPolicy(config?: Partial<typeof DEFAULT_RETRY_CONFIG>): ResolvedRetryPolicy;
/**
 * Simple circuit breaker for the model catalog and billing endpoints.
 * Opens after `threshold` consecutive failures, rejects calls immediately
 * during cooldown, then allows one probe (half-open).
 */
declare class CircuitBreaker {
  private failures;
  private openedAt;
  private readonly threshold;
  private readonly cooldownMs;
  constructor(threshold?: number, cooldownMs?: number);
  /** Whether calls should be allowed through right now. */
  get isOpen(): boolean;
  /** Record a successful call (resets the breaker). */
  recordSuccess(): void;
  /** Record a failed call. */
  recordFailure(): void;
  /** Current state for diagnostics. */
  get state(): 'closed' | 'open' | 'half-open';
}
//#endregion
//#region src/index.d.ts
declare const name = "llm-commandcode";
declare const inject: string[];
/** The single provider route this plugin owns. */
declare const PROVIDER = "commandcode";
/** Default models cache path. */
declare const DEFAULT_MODELS_CACHE_PATH: string;
/**
 * Plugin config — validated by schemastery, doubles as the settings section
 * shape. Every field is optional: a missing API key resolves through
 * `apiKeyEnv` at each request (the web Models page writes it), with the
 * official Command Code CLI auth file as the last fallback.
 */
interface Config {
  apiKeyEnv?: string;
  apiKey?: string;
  apiBase?: string;
  workingDir?: string;
  modelsCachePath?: string;
  requestTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  filterModelsByPlan?: boolean;
  accounts?: CommandCodeAccountConfig[];
  activeAccount?: string;
  lang?: string;
}
declare const Config: z<Config>;
/** One resolution's complete request facts. */
interface ResolvedCommandCodeOptions extends CommandCodeConnectionOptions {
  apiKeyEnv: CredentialRef;
}
declare function resolveAdapterOptions(config: Config): ResolvedCommandCodeOptions;
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { type ApiKeyValidation, BILLING_ACCESS_TTL_MS, COMMAND_CODE_CLI_VERSION, CircuitBreaker, type CommandCodeAccountConfig, CommandCodeAccountPool, type CommandCodeAccountSlot, type CommandCodeAccountState, type CommandCodeAccountUsage, type CommandCodeAccountsReport, CommandCodeAdapter, type CommandCodeAdapterDeps, type CommandCodeBillingAccess, type CommandCodeCommandDeps, type CommandCodeConnectionOptions, CommandCodeError, CommandCodeErrorCode, type CommandCodeErrorContext, type CommandCodeErrorHint, type CommandCodeLoginCredentials, type CommandCodeLoginFailureReason, CommandCodeLoginFlow, type CommandCodeLoginFlowDeps, type CommandCodeLoginStatus, type CommandCodeModel, type CommandCodeUsageDeps, type CommandCodeUsageReport, CommandCodeUsageService, type CommandLocale, Config, DEFAULT_API_BASE, DEFAULT_GENERATE_MAX_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_MODELS_CACHE_PATH, DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, KNOWN_EFFORTS, KNOWN_IMAGE_MODELS, KNOWN_PLANS, KNOWN_SUBSCRIPTION_PLANS, LOGIN_BEGIN_PATH, LOGIN_CANCEL_PATH, LOGIN_MAX_PORT_ATTEMPTS, LOGIN_START_PORT, LOGIN_STATUS_PATH, LOGIN_TIMEOUT_MS, type LocaleId, type LoginFlowFacade, ModelCatalog, NON_RETRYABLE_CODES, PLAN_LABELS, PLAN_ORDER, PROVIDER, RETRYABLE_CODES, RETRY_MAX_DELAY_MS, type ResolveAttachments, type ResolvedAccount, ResolvedCommandCodeOptions, USAGE_REPORT_PATH, accountUsable, apply, applyCommands, applyUsageRemote, buildCommandAuthUrl, buildRetryPolicy, buildSlots, capabilityDescription, commandDefinition, compareByPlan, en, errorCodeFromStatus, formatContext, httpError, inject, modelVisibleInPlan, name, parseAccountsReport, parseLoginStatus, pickCommandLocale, planLabel, projectSlugFromPath, resolveAdapterOptions, resolveAuthFileApiKey, selectActiveAccount, studioBaseForApiBase, validateCommandApiKey, wrapError, zh };
//# sourceMappingURL=index.d.ts.map