/**
 * Login controller — manages the client-side login flow state by polling
 * the Host's Typert Gateway endpoints.
 */

/** Login page state. */
export interface LoginPageState {
  phase: 'idle' | 'pending' | 'success' | 'failed'
  authUrl?: string
  failure?: string
  message?: string
}

/** Login remote interface (implemented by the client index). */
export interface LoginRemote {
  begin: () => Promise<{ ok: boolean; data?: LoginPageState; error?: { message: string } }>
  status: () => Promise<{ ok: boolean; data?: LoginPageState; error?: { message: string } }>
  cancel: () => Promise<{ ok: boolean; data?: LoginPageState; error?: { message: string } }>
}

const POLL_INTERVAL_MS = 2000

/**
 * Login controller. Polls the Host login status while a flow is pending.
 */
export class CommandCodeLoginController {
  private stateValue: LoginPageState = { phase: 'idle' }
  private readonly listeners = new Set<() => void>()
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private disposed = false

  constructor(private readonly remote: LoginRemote) {}

  state(): LoginPageState {
    return { ...this.stateValue }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  async begin(): Promise<void> {
    if (this.stateValue.phase === 'pending') return
    this.stateValue = { phase: 'pending' }
    this.emit()

    try {
      const result = await this.remote.begin()
      if (!result.ok || !result.data) {
        this.stateValue = {
          phase: 'failed',
          failure: 'network',
          message: result.error?.message ?? 'Failed to start login',
        }
        this.emit()
        return
      }
      this.stateValue = { ...result.data }
      this.emit()

      // Open the auth URL in a new tab
      if (result.data.authUrl) {
        window.open(result.data.authUrl, '_blank', 'noopener,noreferrer')
      }

      this.startPolling()
    } catch (error) {
      this.stateValue = {
        phase: 'failed',
        failure: 'network',
        message: error instanceof Error ? error.message : String(error),
      }
      this.emit()
    }
  }

  async cancel(): Promise<void> {
    this.stopPolling()
    try {
      await this.remote.cancel()
    } catch {
      // ignore
    }
    this.stateValue = { phase: 'idle' }
    this.emit()
  }

  private startPolling(): void {
    this.stopPolling()
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  private async poll(): Promise<void> {
    if (this.disposed || this.stateValue.phase !== 'pending') {
      this.stopPolling()
      return
    }
    try {
      const result = await this.remote.status()
      if (result.ok && result.data) {
        this.stateValue = { ...result.data }
        this.emit()
        if (result.data.phase !== 'pending') {
          this.stopPolling()
        }
      }
    } catch {
      // Polling failure: keep waiting, next poll will retry
    }
  }

  dispose(): void {
    this.disposed = true
    this.stopPolling()
    this.listeners.clear()
  }
}
