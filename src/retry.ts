/**
 * Enhanced retry policy for dsh-commandcode.
 *
 * Configurable per error-type retry with exponential backoff + jitter,
 * a circuit breaker for persistent failures, and retry-after header
 * passthrough. The policy is captured at route registration (dsh-llm
 * snapshots it) but the per-request knobs (maxRetries, timeouts) are
 * read live from settings.
 */

import type { ResolvedRetryPolicy } from '@deepseek-ai/dsh-llm'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'

/** Default retry configuration. */
export const DEFAULT_RETRY_CONFIG = {
  /** Maximum retry attempts for transient errors. */
  maxRetries: 12,
  /** Initial backoff delay in milliseconds. */
  initialDelayMs: 500,
  /** Maximum backoff delay in milliseconds (cap). */
  maxDelayMs: 15 * 60 * 1000, // 15 minutes
  /** Jitter ratio (0–1) applied to each delay. */
  jitterRatio: 0.1,
  /** Circuit breaker: consecutive failures before opening. */
  circuitThreshold: 20,
  /** Circuit breaker: cooldown in ms before half-open. */
  circuitCooldownMs: 60 * 1000,
} as const

/** Error codes that are always retryable (transient). */
export const RETRYABLE_CODES = [
  'EMPTY_RESPONSE',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
] as const

/** Error codes that are never retried (permanent). */
export const NON_RETRYABLE_CODES = [
  'INVALID_CREDENTIAL',
  'UNSUPPORTED_CONTENT',
  'UNSUPPORTED_OPTION',
  'MODEL_NOT_IN_PLAN',
  'MODEL_NOT_FOUND',
  'MISSING_CREDENTIAL',
] as const

/**
 * Build the resolved retry policy for the provider route.
 * Captured once at registration; per-request overrides flow through
 * the adapter's options thunk instead.
 */
export function buildRetryPolicy(
  config: Partial<typeof DEFAULT_RETRY_CONFIG> = {},
): ResolvedRetryPolicy {
  const merged = { ...DEFAULT_RETRY_CONFIG, ...config }
  return resolveRetryPolicy(
    {
      mode: 'normal',
      maxRetries: merged.maxRetries,
      retryableCodes: [...RETRYABLE_CODES],
      backoff: {
        initialDelayMs: merged.initialDelayMs,
        maxDelayMs: merged.maxDelayMs,
        jitterRatio: merged.jitterRatio,
      },
    },
    'dsh-commandcode: retryPolicy',
  )
}

/**
 * Simple circuit breaker for the model catalog and billing endpoints.
 * Opens after `threshold` consecutive failures, rejects calls immediately
 * during cooldown, then allows one probe (half-open).
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt = 0
  private readonly threshold: number
  private readonly cooldownMs: number

  constructor(
    threshold: number = DEFAULT_RETRY_CONFIG.circuitThreshold,
    cooldownMs: number = DEFAULT_RETRY_CONFIG.circuitCooldownMs,
  ) {
    this.threshold = threshold
    this.cooldownMs = cooldownMs
  }

  /** Whether calls should be allowed through right now. */
  get isOpen(): boolean {
    if (this.failures < this.threshold) return false
    return Date.now() - this.openedAt < this.cooldownMs
  }

  /** Record a successful call (resets the breaker). */
  recordSuccess(): void {
    this.failures = 0
    this.openedAt = 0
  }

  /** Record a failed call. */
  recordFailure(): void {
    this.failures += 1
    if (this.failures === this.threshold) {
      this.openedAt = Date.now()
    }
  }

  /** Current state for diagnostics. */
  get state(): 'closed' | 'open' | 'half-open' {
    if (this.failures < this.threshold) return 'closed'
    if (Date.now() - this.openedAt >= this.cooldownMs) return 'half-open'
    return 'open'
  }
}

/**
 * Sleep with AbortSignal support. Resolves after `ms` or rejects when
 * the signal aborts. Used between retries.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Compute the next backoff delay with full jitter.
 * `attempt` is 0-indexed (first retry = attempt 0).
 */
export function backoffDelay(
  attempt: number,
  initialMs: number = DEFAULT_RETRY_CONFIG.initialDelayMs,
  maxMs: number = DEFAULT_RETRY_CONFIG.maxDelayMs,
): number {
  const exponential = Math.min(initialMs * 2 ** attempt, maxMs)
  // Full jitter: random in [0, exponential]
  return Math.floor(exponential * Math.random())
}
