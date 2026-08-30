/**
 * Usage remote service — exposes the per-account usage report and the login
 * flow to the web client over the shared `/api` Fetch channel.
 *
 * 0.1.2-aplha note: the old `ctx.typert.register(path, handler)` endpoint
 * registration no longer exists. The public seam for Host features that serve
 * the browser is `connection.fetch.register()` — the same exact-Fetch-route
 * registry upstream's `/api/session.export` uses. Routes are exact-path and
 * GET-only by contract, so the three login operations are three GET routes;
 * each carries the flow state back as JSON. The carrier applies its trust and
 * browser-authentication policy before a handler runs, so these routes are
 * never reachable without an authenticated session.
 *
 * Rides the optional `connection` service; profiles without a web stack never
 * activate the routes.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type { CommandCodeAdapter, CommandCodeUsageReport } from './adapter.ts'
import type { CommandCodeAccountsReport } from './usage-wire.ts'
import { USAGE_REPORT_PATH } from './usage-wire.ts'
import type { CommandCodeLoginFlow, CommandCodeLoginCredentials } from './login.ts'
import {
  LOGIN_BEGIN_PATH,
  LOGIN_STATUS_PATH,
  LOGIN_CANCEL_PATH,
} from './login-wire.ts'

/** Dependencies for the usage remote. */
export interface CommandCodeUsageDeps {
  adapter: Pick<CommandCodeAdapter, 'getUsage'>
  reports: () => Promise<CommandCodeAccountsReport>
  login: CommandCodeLoginFlow
}

/** Login flow facade (for the usage remote to call). */
export interface LoginFlowFacade {
  begin: () => Promise<unknown>
  cancel: () => Promise<unknown>
  getStatus: () => unknown
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function errorResponse(error: unknown): Response {
  return new Response(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
  }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Apply the usage remote: register the `/api/commandcode/*` Fetch routes.
 */
export function applyUsageRemote(ctx: Context, deps: CommandCodeUsageDeps): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.get('connection') as {
      fetch: { register: (route: ConnectionFetchRoute) => () => Promise<void> }
    }

    const routes: ConnectionFetchRoute[] = [
      {
        path: USAGE_REPORT_PATH,
        methods: ['GET'],
        fetch: async () => {
          try {
            return jsonResponse(await deps.reports())
          } catch (error) {
            return errorResponse(error)
          }
        },
      },
      {
        path: LOGIN_BEGIN_PATH,
        methods: ['GET'],
        fetch: async () => {
          try {
            return jsonResponse(await deps.login.begin())
          } catch (error) {
            return errorResponse(error)
          }
        },
      },
      {
        path: LOGIN_STATUS_PATH,
        methods: ['GET'],
        fetch: async () => {
          try {
            return jsonResponse(deps.login.getStatus())
          } catch (error) {
            return errorResponse(error)
          }
        },
      },
      {
        path: LOGIN_CANCEL_PATH,
        methods: ['GET'],
        fetch: async () => {
          try {
            return jsonResponse(await deps.login.cancel())
          } catch (error) {
            return errorResponse(error)
          }
        },
      },
    ]

    for (const route of routes) {
      connectionCtx.effect(() => connection.fetch.register(route), `dsh-commandcode: ${route.path}`)
    }
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
