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
export const LOGIN_BEGIN_PATH = '/api/commandcode/login/begin'
export const LOGIN_STATUS_PATH = '/api/commandcode/login/status'
export const LOGIN_CANCEL_PATH = '/api/commandcode/login/cancel'

/** Why a login flow failed. */
export type CommandCodeLoginFailureReason =
  | 'timeout'
  | 'cancelled'
  | 'callback-error'
  | 'invalid-key'
  | 'store-error'
  | 'network'

/** Login flow status returned by the status endpoint. */
export interface CommandCodeLoginStatus {
  /** Current phase. */
  phase: 'idle' | 'pending' | 'success' | 'failed'
  /** Authorization URL (present when phase = 'pending'). */
  authUrl?: string
  /** Failure reason (present when phase = 'failed'). */
  failure?: CommandCodeLoginFailureReason
  /** Human-readable failure message. */
  message?: string
  /** Timestamp when the flow started (epoch ms). */
  startedAt?: number
  /** Timestamp when the flow completed (epoch ms). */
  completedAt?: number
}

/** Parse a raw status response (defensive: returns idle on bad input). */
export function parseLoginStatus(value: unknown): CommandCodeLoginStatus {
  if (typeof value !== 'object' || value === null) {
    return { phase: 'idle' }
  }
  const v = value as Record<string, unknown>
  const phase = typeof v.phase === 'string' ? v.phase : 'idle'
  if (!['idle', 'pending', 'success', 'failed'].includes(phase)) {
    return { phase: 'idle' }
  }
  return {
    phase: phase as CommandCodeLoginStatus['phase'],
    authUrl: typeof v.authUrl === 'string' ? v.authUrl : undefined,
    failure: typeof v.failure === 'string' ? v.failure as CommandCodeLoginFailureReason : undefined,
    message: typeof v.message === 'string' ? v.message : undefined,
    startedAt: typeof v.startedAt === 'number' ? v.startedAt : undefined,
    completedAt: typeof v.completedAt === 'number' ? v.completedAt : undefined,
  }
}
