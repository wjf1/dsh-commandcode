/**
 * Usage remote service — exposes the per-account usage report and login
 * flow through the Typert Gateway.
 *
 * Rides the optional `typert` registry service; profiles without the web
 * stack never activate it.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandCodeAdapter, CommandCodeUsageReport } from './adapter.ts'
import type { CommandCodeAccountsReport } from './usage-wire.ts'
import { USAGE_REPORT_ENDPOINT } from './usage-wire.ts'
import type { CommandCodeLoginFlow, CommandCodeLoginCredentials } from './login.ts'
import {
  LOGIN_BEGIN_ENDPOINT,
  LOGIN_STATUS_ENDPOINT,
  LOGIN_CANCEL_ENDPOINT,
} from './login-wire.ts'

/** Dependencies for the usage remote. */
export interface CommandCodeUsageDeps {
  adapter: CommandCodeAdapter
  reports: () => Promise<CommandCodeAccountsReport>
  login: CommandCodeLoginFlow
}

/** Login flow facade (for the usage remote to call). */
export interface LoginFlowFacade {
  begin: () => Promise<unknown>
  cancel: () => Promise<unknown>
  getStatus: () => unknown
}

/**
 * Apply the usage remote: register the Typert Gateway endpoints.
 */
export function applyUsageRemote(ctx: Context, deps: CommandCodeUsageDeps): void {
  const typert = ctx.get('typert')
  if (typert === undefined) return

  // Usage report endpoint
  typert.register(USAGE_REPORT_ENDPOINT, async () => {
    return deps.reports()
  })

  // Login flow endpoints
  typert.register(LOGIN_BEGIN_ENDPOINT, async () => {
    return deps.login.begin()
  })

  typert.register(LOGIN_STATUS_ENDPOINT, async () => {
    return deps.login.getStatus()
  })

  typert.register(LOGIN_CANCEL_ENDPOINT, async () => {
    return deps.login.cancel()
  })
}

/**
 * Usage service wrapper (for tests and direct access).
 */
export class CommandCodeUsageService {
  constructor(private readonly deps: CommandCodeUsageDeps) {}

  async getReport(): Promise<CommandCodeAccountsReport> {
    return this.deps.reports()
  }

  async getUsageForAccount(apiKey: string): Promise<CommandCodeUsageReport> {
    return this.deps.adapter.getUsage(apiKey)
  }
}
