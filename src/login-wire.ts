/**
 * Login wire protocol types — shared between Host and Client.
 *
 * The Host exposes three Typert Gateway endpoints under `commandcode/login`:
 *   - begin: start the OAuth flow (returns the authorization URL)
 *   - status: poll the flow status (pending / success / failed)
 *   - cancel: abort an in-progress flow
 */

import z from '@deepseek-ai/schemastery'

/** Endpoint paths (mounted under the `commandcode` Typert namespace). */
export const LOGIN_BEGIN_ENDPOINT = 'commandcode/login/begin'
export const LOGIN_STATUS_ENDPOINT = 'commandcode/login/status'
export const LOGIN_CANCEL_ENDPOINT = 'commandcode/login/cancel'

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

/** Schema for the status endpoint response (validated by Typert). */
export const loginStatusSchema = z.object({
  phase: z.union([
    z.literal('idle'),
    z.literal('pending'),
    z.literal('success'),
    z.literal('failed'),
  ]),
  authUrl: z.string().optional(),
  failure: z.union([
    z.literal('timeout'),
    z.literal('cancelled'),
    z.literal('callback-error'),
    z.literal('invalid-key'),
    z.literal('store-error'),
    z.literal('network'),
  ]).optional(),
  message: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
})

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

/** Typert Remote contribution descriptor for the login endpoints. */
export const LOGIN_REMOTE_CONTRIBUTION = {
  package: 'dsh-commandcode',
  descriptors: [
    { name: LOGIN_BEGIN_ENDPOINT, input: z.object({}), output: loginStatusSchema },
    { name: LOGIN_STATUS_ENDPOINT, input: z.object({}), output: loginStatusSchema },
    { name: LOGIN_CANCEL_ENDPOINT, input: z.object({}), output: loginStatusSchema },
  ],
} as const
