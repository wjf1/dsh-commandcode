/**
 * Enhanced error diagnostics for dsh-commandcode.
 *
 * Structured error codes, diagnostic context, and user-facing troubleshooting
 * hints. Every error the adapter surfaces carries a stable code, a machine-
 * readable context object, and a hint that guides the user to the fix.
 */

/** Stable error codes — never renumber, only append. */
export enum CommandCodeErrorCode {
  /** No API key could be resolved from any source. */
  MISSING_CREDENTIAL = 'MISSING_CREDENTIAL',
  /** The resolved API key was rejected (401). */
  INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
  /** Usage window exhausted (429). */
  RATE_LIMIT = 'RATE_LIMIT',
  /** The model is not available on the current subscription plan. */
  MODEL_NOT_IN_PLAN = 'MODEL_NOT_IN_PLAN',
  /** The requested model does not exist in the catalog. */
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  /** The Command Code API returned an unexpected response shape. */
  PROVIDER_PROTOCOL_ERROR = 'PROVIDER_PROTOCOL_ERROR',
  /** The request timed out before headers arrived. */
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  /** The stream stalled beyond the idle timeout. */
  STREAM_IDLE_TIMEOUT = 'STREAM_IDLE_TIMEOUT',
  /** A network-level failure (no HTTP response). */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** The Command Code service returned 5xx. */
  SERVER_ERROR = 'SERVER_ERROR',
  /** The request carried unsupported content (e.g. images to a non-vision model). */
  UNSUPPORTED_CONTENT = 'UNSUPPORTED_CONTENT',
  /** The request carried an unsupported option (e.g. stop sequences). */
  UNSUPPORTED_OPTION = 'UNSUPPORTED_OPTION',
  /** The model catalog endpoint failed and no cache is available. */
  CATALOG_UNAVAILABLE = 'CATALOG_UNAVAILABLE',
  /** The login flow was cancelled or timed out. */
  LOGIN_FAILED = 'LOGIN_FAILED',
  /** An internal invariant was violated. */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** HTTP status → error code mapping. */
export function errorCodeFromStatus(status: number): CommandCodeErrorCode {
  if (status === 401) return CommandCodeErrorCode.INVALID_CREDENTIAL
  if (status === 403) return CommandCodeErrorCode.MODEL_NOT_IN_PLAN
  if (status === 404) return CommandCodeErrorCode.MODEL_NOT_FOUND
  if (status === 429) return CommandCodeErrorCode.RATE_LIMIT
  if (status >= 500) return CommandCodeErrorCode.SERVER_ERROR
  return CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR
}

/** Diagnostic context attached to every CommandCodeError. */
export interface CommandCodeErrorContext {
  /** The provider route (always `commandcode`). */
  provider: string
  /** The model id, when the error is model-specific. */
  model?: string
  /** The API endpoint that failed, when applicable. */
  endpoint?: string
  /** HTTP status code, when the error came from an HTTP response. */
  status?: number
  /** Retry-After header value in milliseconds, when the server sent one. */
  retryAfterMs?: number
  /** The account slot id that produced this error (multi-account). */
  accountId?: string
  /** Number of attempts made before surfacing. */
  attempts?: number
  /** Timestamp when the error was created (epoch ms). */
  timestamp: number
  /** Request id from the server, when available. */
  requestId?: string
}

/** User-facing troubleshooting hint. */
export interface CommandCodeErrorHint {
  /** Short, actionable hint shown in the UI. */
  message: string
  /** Optional documentation anchor or URL. */
  docRef?: string
}

const HINTS: Record<CommandCodeErrorCode, CommandCodeErrorHint> = {
  [CommandCodeErrorCode.MISSING_CREDENTIAL]: {
    message: 'Set COMMANDCODE_API_KEY in the Models page, your environment, or run the built-in login flow.',
    docRef: '#configuration',
  },
  [CommandCodeErrorCode.INVALID_CREDENTIAL]: {
    message: 'The API key was rejected. Verify it in the Models page or re-run login. Multi-account rotation may have exhausted all keys.',
    docRef: '#troubleshooting',
  },
  [CommandCodeErrorCode.RATE_LIMIT]: {
    message: 'Usage limit reached. Wait for the window to reset, switch accounts, or upgrade your plan.',
    docRef: '#multi-account',
  },
  [CommandCodeErrorCode.MODEL_NOT_IN_PLAN]: {
    message: 'This model requires a higher subscription tier. Switch to a model in your plan or upgrade.',
    docRef: '#model-catalog',
  },
  [CommandCodeErrorCode.MODEL_NOT_FOUND]: {
    message: 'The model id is not in the current catalog. Refresh the model list or check the spelling.',
    docRef: '#model-catalog',
  },
  [CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR]: {
    message: 'The Command Code API returned an unexpected response. The service may have changed its protocol — check for plugin updates.',
    docRef: '#changelog',
  },
  [CommandCodeErrorCode.REQUEST_TIMEOUT]: {
    message: 'The request timed out. Increase requestTimeoutMs in settings or check your network connection.',
    docRef: '#advanced-settings',
  },
  [CommandCodeErrorCode.STREAM_IDLE_TIMEOUT]: {
    message: 'The response stream stalled. Increase streamIdleTimeoutMs in settings or retry the request.',
    docRef: '#advanced-settings',
  },
  [CommandCodeErrorCode.NETWORK_ERROR]: {
    message: 'Could not reach the Command Code API. Check your network connection, firewall, and proxy settings.',
    docRef: '#troubleshooting',
  },
  [CommandCodeErrorCode.SERVER_ERROR]: {
    message: 'The Command Code service is experiencing issues. Retry later or check status.commandcode.ai.',
    docRef: '#troubleshooting',
  },
  [CommandCodeErrorCode.UNSUPPORTED_CONTENT]: {
    message: 'This model does not support the input content type. Use a Vision-capable model for image input.',
    docRef: '#model-catalog',
  },
  [CommandCodeErrorCode.UNSUPPORTED_OPTION]: {
    message: 'The Command Code API does not support this request option. Remove it and retry.',
    docRef: '#limitations',
  },
  [CommandCodeErrorCode.CATALOG_UNAVAILABLE]: {
    message: 'Could not fetch the model catalog and no cached copy is available. Check your network and retry.',
    docRef: '#troubleshooting',
  },
  [CommandCodeErrorCode.LOGIN_FAILED]: {
    message: 'The login flow did not complete. Close the browser tab and try again, or paste your API key manually.',
    docRef: '#login',
  },
  [CommandCodeErrorCode.INTERNAL_ERROR]: {
    message: 'An internal error occurred. Please file an issue with the diagnostic details below.',
    docRef: 'https://github.com/wjf1/dsh-commandcode/issues',
  },
}

/**
 * Structured error with diagnostic context and a user-facing hint.
 * Extends the harness LlmError contract so it flows through the retry
 * executor unchanged.
 */
export class CommandCodeError extends Error {
  readonly code: CommandCodeErrorCode
  readonly context: CommandCodeErrorContext
  readonly hint: CommandCodeErrorHint
  readonly cause?: unknown

  constructor(
    code: CommandCodeErrorCode,
    message: string,
    context: Partial<CommandCodeErrorContext> = {},
    cause?: unknown,
  ) {
    super(message)
    this.name = 'CommandCodeError'
    this.code = code
    this.context = {
      provider: 'commandcode',
      timestamp: Date.now(),
      ...context,
    }
    this.hint = HINTS[code] ?? HINTS[CommandCodeErrorCode.INTERNAL_ERROR]
    this.cause = cause
  }

  /** Serialize for logging and UI display (no secrets). */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint.message,
      context: { ...this.context },
    }
  }

  /** One-line diagnostic summary for logs. */
  get diagnostic(): string {
    const parts = [`[${this.code}]`, this.message]
    if (this.context.status !== undefined) parts.push(`status=${this.context.status}`)
    if (this.context.model !== undefined) parts.push(`model=${this.context.model}`)
    if (this.context.accountId !== undefined) parts.push(`account=${this.context.accountId}`)
    if (this.context.attempts !== undefined) parts.push(`attempts=${this.context.attempts}`)
    if (this.context.requestId !== undefined) parts.push(`reqId=${this.context.requestId}`)
    return parts.join(' ')
  }
}

/**
 * Wrap a raw error (fetch failure, JSON parse error, etc.) into a
 * CommandCodeError with the appropriate code and context.
 */
export function wrapError(
  error: unknown,
  code: CommandCodeErrorCode,
  context: Partial<CommandCodeErrorContext> = {},
): CommandCodeError {
  if (error instanceof CommandCodeError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new CommandCodeError(code, message, context, error)
}

/**
 * Classify an HTTP error response into a CommandCodeError.
 * Reads Retry-After and request-id headers when present.
 */
export function httpError(
  status: number,
  bodyText: string,
  context: Partial<CommandCodeErrorContext> = {},
  retryAfterMs?: number,
  requestId?: string,
): CommandCodeError {
  const code = errorCodeFromStatus(status)
  const snippet = bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText
  return new CommandCodeError(
    code,
    `Command Code API returned ${status}: ${snippet || '(empty body)'}`,
    { ...context, status, retryAfterMs, requestId },
  )
}
