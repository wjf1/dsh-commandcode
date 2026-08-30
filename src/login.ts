/**
 * Command Code login flow — OAuth-style authorization with a loopback
 * callback server.
 *
 * The flow:
 * 1. Host binds a loopback HTTP server on a random port (18700–18799).
 * 2. Host builds the authorization URL (Command Code studio OAuth endpoint).
 * 3. Client opens the URL in the user's browser.
 * 4. User authorizes; Command Code redirects to the loopback callback with
 *    the API key in the query string or POST body.
 * 5. Host validates the key, stores it through the credentials seam, and
 *    reports success.
 *
 * Enhancement: explicit port range, CORS-safe callback, timeout with
 * automatic cleanup, and structured failure reasons.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { CommandCodeError, CommandCodeErrorCode } from './errors.ts'
import type { CommandCodeLoginStatus } from './login-wire.ts'

/** Login flow timeout (5 minutes). */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
/** Start of the loopback port range. */
export const LOGIN_START_PORT = 18700
/** Number of ports to try before giving up. */
export const LOGIN_MAX_PORT_ATTEMPTS = 100
/** Max body size for the callback POST. */
export const LOGIN_BODY_LIMIT_BYTES = 64 * 1024
/** Allowed Origin headers for the callback (loopback only). */
export const LOGIN_ALLOWED_ORIGINS = [
  'http://localhost:18700',
  'http://127.0.0.1:18700',
  'https://commandcode.ai',
  'https://www.commandcode.ai',
]

/** Credentials delivered by a successful login. */
export interface CommandCodeLoginCredentials {
  apiKey: string
  /** Optional: the account email or username (for display). */
  account?: string
}

/** Dependencies for the login flow. */
export interface CommandCodeLoginFlowDeps {
  /** Resolve the current API base (settings-aware). */
  apiBase: () => string
  /** Store the delivered API key through the credentials seam. */
  storeKey: (creds: CommandCodeLoginCredentials) => Promise<void>
  /** HTTP transport override (tests). */
  fetchImpl?: typeof fetch
}

/** Result of API key validation. */
export interface ApiKeyValidation {
  valid: boolean
  account?: string
  error?: string
}

/**
 * Build the Command Code authorization URL for the given callback port.
 */
export function buildCommandAuthUrl(apiBase: string, port: number): string {
  const studio = studioBaseForApiBase(apiBase)
  const params = new URLSearchParams({
    callback: `http://localhost:${port}/callback`,
    source: 'dsh-commandcode',
  })
  return `${studio}/auth/authorize?${params.toString()}`
}

/** Derive the studio (web UI) base from the API base. */
export function studioBaseForApiBase(apiBase: string): string {
  try {
    const url = new URL(apiBase)
    // Default: same origin, /studio path
    return `${url.protocol}//${url.host}/studio`
  } catch {
    return 'https://commandcode.ai/studio'
  }
}

/**
 * Validate an API key by calling the /alpha/whoami endpoint.
 * Returns the account info when valid.
 */
export async function validateCommandApiKey(
  apiKey: string,
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiKeyValidation> {
  try {
    const response = await fetchImpl(`${apiBase}/alpha/whoami`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: `API key rejected (${response.status})` }
    }
    if (!response.ok) {
      return { valid: false, error: `Validation endpoint returned ${response.status}` }
    }
    const body = await response.json() as Record<string, unknown>
    return {
      valid: true,
      account: typeof body.userName === 'string' ? body.userName : typeof body.name === 'string' ? body.name : undefined,
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Login flow controller. One instance per plugin lifecycle.
 * Only one flow can be active at a time.
 */
export class CommandCodeLoginFlow {
  private server: Server | undefined
  private port = 0
  private status: CommandCodeLoginStatus = { phase: 'idle' }
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined
  private readonly fetchImpl: typeof fetch

  constructor(private readonly deps: CommandCodeLoginFlowDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch
  }

  /** Current status (for the status endpoint). */
  getStatus(): CommandCodeLoginStatus {
    return { ...this.status }
  }

  /**
   * Begin the login flow. Binds the callback server and returns the
   * authorization URL. Throws if a flow is already active.
   */
  async begin(): Promise<CommandCodeLoginStatus> {
    if (this.status.phase === 'pending') {
      return this.getStatus()
    }

    const port = await this.bindServer()
    this.port = port
    this.status = {
      phase: 'pending',
      authUrl: buildCommandAuthUrl(this.deps.apiBase(), port),
      startedAt: Date.now(),
    }

    // Auto-timeout cleanup
    this.timeoutHandle = setTimeout(() => {
      void this.fail('timeout', 'Login flow timed out after 5 minutes')
    }, LOGIN_TIMEOUT_MS)

    return this.getStatus()
  }

  /** Cancel an in-progress flow. */
  async cancel(): Promise<CommandCodeLoginStatus> {
    if (this.status.phase !== 'pending') {
      return this.getStatus()
    }
    return this.fail('cancelled', 'Login flow cancelled by user')
  }

  /** Dispose: clean up server and timers. */
  dispose(): void {
    this.cleanup()
    this.status = { phase: 'idle' }
  }

  // --- Internal ---

  private async bindServer(): Promise<number> {
    for (let attempt = 0; attempt < LOGIN_MAX_PORT_ATTEMPTS; attempt++) {
      const port = LOGIN_START_PORT + attempt
      try {
        await new Promise<void>((resolve, reject) => {
          const server = createServer((req, res) => this.handleCallback(req, res))
          server.once('error', reject)
          server.listen(port, '127.0.0.1', () => {
            this.server = server
            resolve()
          })
        })
        return port
      } catch {
        // Port in use, try next
        continue
      }
    }
    throw new CommandCodeError(
      CommandCodeErrorCode.LOGIN_FAILED,
      `Could not bind a loopback port in range ${LOGIN_START_PORT}–${LOGIN_START_PORT + LOGIN_MAX_PORT_ATTEMPTS}`,
    )
  }

  private handleCallback(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers for loopback
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://localhost:${this.port}`)

    if (url.pathname === '/callback' && (req.method === 'GET' || req.method === 'POST')) {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > LOGIN_BODY_LIMIT_BYTES) {
          req.destroy()
          this.sendError(res, 413, 'Payload too large')
        }
      })
      req.on('end', () => {
        void this.processCallback(url, body, res)
      })
      return
    }

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(404)
    res.end()
  }

  private async processCallback(url: URL, body: string, res: ServerResponse): Promise<void> {
    try {
      // Extract API key from query string or POST body
      let apiKey: string | null | undefined = url.searchParams.get('api_key')
        ?? url.searchParams.get('apiKey')
        ?? url.searchParams.get('key')

      if (!apiKey && body.length > 0) {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>
          apiKey = typeof parsed.api_key === 'string' ? parsed.api_key
            : typeof parsed.apiKey === 'string' ? parsed.apiKey
            : typeof parsed.key === 'string' ? parsed.key
            : undefined
        } catch {
          // Try form-encoded
          const params = new URLSearchParams(body)
          apiKey = params.get('api_key') ?? params.get('apiKey') ?? params.get('key')
        }
      }

      if (!apiKey || apiKey.length === 0) {
        this.sendError(res, 400, 'No API key in callback')
        await this.fail('callback-error', 'Callback did not include an API key')
        return
      }

      // Validate the key
      const validation = await validateCommandApiKey(apiKey, this.deps.apiBase(), this.fetchImpl)
      if (!validation.valid) {
        this.sendError(res, 401, validation.error ?? 'Invalid API key')
        await this.fail('invalid-key', validation.error ?? 'The delivered API key is invalid')
        return
      }

      // Store the key
      try {
        await this.deps.storeKey({ apiKey, account: validation.account })
      } catch (error) {
        this.sendError(res, 500, 'Failed to store credentials')
        await this.fail('store-error', error instanceof Error ? error.message : 'Failed to store credentials')
        return
      }

      // Success
      this.cleanup()
      this.status = {
        phase: 'success',
        completedAt: Date.now(),
        startedAt: this.status.startedAt,
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
        <!DOCTYPE html>
        <html><head><title>Login Successful</title></head>
        <body style="font-family:system-ui;text-align:center;padding:40px;">
          <h2>Command Code login successful</h2>
          <p>You can close this tab and return to DSH-Desktop.</p>
        </body></html>
      `)
    } catch (error) {
      this.sendError(res, 500, 'Internal error')
      await this.fail('callback-error', error instanceof Error ? error.message : String(error))
    }
  }

  private sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }

  private async fail(reason: CommandCodeLoginStatus['failure'], message: string): Promise<CommandCodeLoginStatus> {
    this.cleanup()
    this.status = {
      phase: 'failed',
      failure: reason,
      message,
      startedAt: this.status.startedAt,
      completedAt: Date.now(),
    }
    return this.getStatus()
  }

  private cleanup(): void {
    if (this.timeoutHandle !== undefined) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = undefined
    }
    if (this.server !== undefined) {
      this.server.close()
      this.server = undefined
    }
    this.port = 0
  }
}
