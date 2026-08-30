/**
 * Multi-account pool with passive rotation and active window probing.
 *
 * Enhancement over the reference plugin:
 * - Explicit account states with cooldown timestamps.
 * - Active window probing when all accounts are exhausted (with dedup).
 * - Environment-aware credential resolution (each account can specify its
 *   own env var or literal key).
 * - Stable slot ids based on credential reference (survives reordering).
 * - Diagnostic report for the settings page UI.
 */

import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { CommandCodeError, CommandCodeErrorCode } from './errors.ts'

/** Max delay for retry-after (matches dsh-llm's cap). */
export const RETRY_MAX_DELAY_MS = 15 * 60 * 1000

/** One configured account entry from settings. */
export interface CommandCodeAccountConfig {
  /** Human-readable label shown in the UI. */
  label?: string
  /** Environment variable name holding the API key (credential ref). */
  apiKeyEnv?: string
  /** Literal API key (composition config only; not shown in UI). */
  apiKey?: string
}

/** Runtime slot for one account. */
export interface CommandCodeAccountSlot {
  /** Stable id: credential ref name, or `default` / `account-N`. */
  id: string
  /** Display label. */
  label: string
  /** Credential reference (env var), when the account uses one. */
  ref?: CredentialRef
  /** Literal API key, when the account uses one. */
  literal?: string
  /** Whether this slot may fall back to the CLI auth file (`~/.commandcode/auth.json`). */
  allowAuthFile: boolean
}

/** Account state tracked by the pool. */
export type CommandCodeAccountState =
  | { kind: 'ok' }
  | { kind: 'cooldown'; rejection: 'rate-limit' | 'invalid-credential'; until: number }
  | { kind: 'disabled'; rejection: 'invalid-credential' }

/** One resolved account (slot + resolved key + state). */
export interface ResolvedAccount {
  slot: CommandCodeAccountSlot
  key: string
  state: CommandCodeAccountState
}

/** Dependencies for the account pool. */
export interface CommandCodeAccountPoolDeps {
  /** Rebuild the slot list from live config (called per resolution). */
  slots: () => CommandCodeAccountSlot[]
  /** Resolve a credential ref to its value. */
  resolveRef: (ref: CredentialRef) => Promise<string | undefined>
  /** Read the API key from the CLI auth file. */
  authFileKey: () => Promise<string | undefined>
  /** Probe one key's 5-hour window (returns exceeded + resetAt, or undefined on failure). */
  probeWindow: (apiKey: string) => Promise<{ exceeded: boolean; resetAt: number } | undefined>
  /** Manually preferred account id (settings). */
  preferredId: () => string | undefined
}

/**
 * Multi-account pool.
 *
 * Rotation is passive: a key is marked only when a request using it is
 * actually rejected (429/401). When every account is marked, the pool
 * probes windows to revive cooled-down accounts. The steady state costs
 * zero extra API calls.
 */
export class CommandCodeAccountPool {
  /** Keyed by resolved API key (process-local, never logged). */
  private readonly states = new Map<string, CommandCodeAccountState>()
  private probeInflight: Promise<void> | undefined

  constructor(private readonly deps: CommandCodeAccountPoolDeps) {}

  /**
   * Resolve the next usable API key.
   * @param exclude Optional key to exclude (just-rejected, for rotation).
   */
  async resolveKey(opts: { exclude?: string } = {}): Promise<ResolvedAccount | undefined> {
    const slots = this.deps.slots()
    const preferred = this.deps.preferredId()

    // Resolve all slots' keys in parallel
    const resolved = await Promise.all(
      slots.map(async (slot): Promise<ResolvedAccount | undefined> => {
        const key = await this.resolveSlotKey(slot)
        if (key === undefined) return undefined
        return { slot, key, state: this.states.get(key) ?? { kind: 'ok' } }
      }),
    )

    const usable = resolved.filter(
      (r): r is ResolvedAccount => r !== undefined && this.isUsable(r.state),
    )

    if (usable.length === 0) {
      // All accounts exhausted or unconfigured: probe windows to revive
      await this.probeAllWindows(resolved.filter((r): r is ResolvedAccount => r !== undefined))
      const revived = resolved.filter(
        (r): r is ResolvedAccount => r !== undefined && this.isUsable(this.states.get(r.key) ?? r.state),
      )
      if (revived.length === 0) return undefined
      return this.select(revived, preferred, opts.exclude)
    }

    return this.select(usable, preferred, opts.exclude)
  }

  /** Mark a key as rejected (rate-limit or invalid-credential). */
  markRejected(key: string, rejection: 'rate-limit' | 'invalid-credential'): void {
    if (rejection === 'invalid-credential') {
      this.states.set(key, { kind: 'disabled', rejection })
    } else {
      // Default cooldown: 5 minutes (probe will refine with actual resetAt)
      this.states.set(key, {
        kind: 'cooldown',
        rejection,
        until: Date.now() + 5 * 60 * 1000,
      })
    }
  }

  /** Describe all accounts (for the settings page UI). */
  async describeAccounts(): Promise<ResolvedAccount[]> {
    const slots = this.deps.slots()
    const resolved = await Promise.all(
      slots.map(async (slot): Promise<ResolvedAccount | undefined> => {
        const key = await this.resolveSlotKey(slot)
        if (key === undefined) return undefined
        return { slot, key, state: this.states.get(key) ?? { kind: 'ok' } }
      }),
    )
    return resolved.filter((r): r is ResolvedAccount => r !== undefined)
  }

  /** Get all resolved accounts (for active selection logic). */
  async resolvedAccounts(): Promise<ResolvedAccount[]> {
    return this.describeAccounts()
  }

  /** Clear all state (e.g. when settings change drastically). */
  reset(): void {
    this.states.clear()
  }

  // --- Internal ---

  private async resolveSlotKey(slot: CommandCodeAccountSlot): Promise<string | undefined> {
    if (slot.literal !== undefined && slot.literal.length > 0) {
      return slot.literal
    }
    if (slot.ref !== undefined) {
      const hit = await this.deps.resolveRef(slot.ref)
      if (hit !== undefined && hit.length > 0) return hit
    }
    if (slot.allowAuthFile) {
      return this.deps.authFileKey()
    }
    return undefined
  }

  private isUsable(state: CommandCodeAccountState): boolean {
    if (state.kind === 'ok') return true
    if (state.kind === 'cooldown') return Date.now() >= state.until
    return false // disabled
  }

  private select(
    accounts: ResolvedAccount[],
    preferredId: string | undefined,
    exclude?: string,
  ): ResolvedAccount | undefined {
    const candidates = exclude !== undefined
      ? accounts.filter((a) => a.key !== exclude)
      : accounts

    if (candidates.length === 0) return undefined

    // Preferred account first (if usable)
    if (preferredId !== undefined) {
      const hit = candidates.find((a) => a.slot.id === preferredId)
      if (hit !== undefined) return hit
    }

    // Default: first usable
    return candidates[0]
  }

  /** Probe all marked accounts' windows to revive cooled-down ones. */
  private async probeAllWindows(accounts: ResolvedAccount[]): Promise<void> {
    if (this.probeInflight !== undefined) {
      await this.probeInflight
      return
    }
    this.probeInflight = (async () => {
      await Promise.all(
        accounts.map(async (account) => {
          const state = this.states.get(account.key)
          if (state === undefined || state.kind === 'ok') return
          try {
            const result = await this.deps.probeWindow(account.key)
            if (result === undefined) return
            if (!result.exceeded) {
              // Window recovered: revive
              this.states.set(account.key, { kind: 'ok' })
            } else if (state.kind === 'cooldown') {
              // Refine the reset timestamp
              this.states.set(account.key, {
                kind: 'cooldown',
                rejection: state.rejection,
                until: result.resetAt > 0 ? result.resetAt : state.until,
              })
            }
          } catch {
            // Probe failure: leave state unchanged
          }
        }),
      )
    })()
    try {
      await this.probeInflight
    } finally {
      this.probeInflight = undefined
    }
  }
}

/** Whether an account state is currently usable (exported for UI). */
export function accountUsable(state: CommandCodeAccountState | undefined): boolean {
  if (state === undefined) return true
  if (state.kind === 'ok') return true
  if (state.kind === 'cooldown') return Date.now() >= state.until
  return false
}

/** Select the active account from a list, respecting preferred id. */
export function selectActiveAccount(
  accounts: ResolvedAccount[],
  preferredId: string | undefined,
): ResolvedAccount | undefined {
  if (preferredId !== undefined) {
    const hit = accounts.find((a) => a.slot.id === preferredId && accountUsable(a.state))
    if (hit !== undefined) return hit
  }
  return accounts.find((a) => accountUsable(a.state))
}

/** Build slot list from raw config (shared between index.ts and tests). */
export function buildSlots(
  config: {
    apiKeyEnv?: string
    apiKey?: string
    accounts?: CommandCodeAccountConfig[]
  },
  defaultEnv: string,
): CommandCodeAccountSlot[] {
  const list: CommandCodeAccountSlot[] = [{
    id: 'default',
    label: 'Default',
    ref: credentialRef(config.apiKeyEnv ?? defaultEnv),
    literal: config.apiKey,
    allowAuthFile: true,
  }]
  for (const [index, account] of (config.accounts ?? []).entries()) {
    const refName = typeof account.apiKeyEnv === 'string' && account.apiKeyEnv.trim() !== ''
      ? account.apiKeyEnv.trim()
      : undefined
    const literal = typeof account.apiKey === 'string' && account.apiKey !== ''
      ? account.apiKey
      : undefined
    if (refName === undefined && literal === undefined) continue
    list.push({
      id: refName ?? `account-${index + 2}`,
      label: typeof account.label === 'string' && account.label.trim() !== ''
        ? account.label.trim()
        : `Account ${index + 2}`,
      ref: refName === undefined ? undefined : credentialRef(refName),
      literal,
      allowAuthFile: false,
    })
  }
  return list
}
