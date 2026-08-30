/**
 * Usage controller — manages the per-account usage display state by
 * calling the Host's `GET /api/commandcode/report` Fetch route.
 */

import type { CommandCodeAccountUsage, CommandCodeAccountsReport } from '../usage-wire.ts'

/** One account's usage data (Host report entry). */
export type UsageAccountEntry = CommandCodeAccountUsage

/** Usage page state. */
export interface UsagePageState {
  accounts: UsageAccountEntry[]
  loading: boolean
  error?: string
  lastUpdated?: number
  selectedAccountId?: string
}

/** Usage remote interface. */
export interface UsageRemote {
  report: () => Promise<{ ok: boolean; data?: CommandCodeAccountsReport; error?: { message: string } }>
}

/**
 * Usage controller. Fetches the usage report on demand and manages
 * the selected account tab state.
 */
export class CommandCodeUsageController {
  private stateValue: UsagePageState = { accounts: [], loading: false }
  private readonly listeners = new Set<() => void>()
  private disposed = false

  constructor(private readonly remote: UsageRemote) {}

  state(): UsagePageState {
    return { ...this.stateValue, accounts: [...this.stateValue.accounts] }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  async refresh(): Promise<void> {
    if (this.stateValue.loading) return
    this.stateValue = { ...this.stateValue, loading: true, error: undefined }
    this.emit()

    try {
      const result = await this.remote.report()
      if (!result.ok || !result.data) {
        this.stateValue = {
          ...this.stateValue,
          loading: false,
          error: result.error?.message ?? 'Failed to fetch usage',
        }
        this.emit()
        return
      }
      const accounts = result.data.accounts
      this.stateValue = {
        accounts,
        loading: false,
        lastUpdated: Date.now(),
        selectedAccountId: this.stateValue.selectedAccountId
          ?? accounts.find((a) => a.active)?.id
          ?? accounts[0]?.id,
      }
      this.emit()
    } catch (error) {
      this.stateValue = {
        ...this.stateValue,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }
      this.emit()
    }
  }

  selectAccount(id: string): void {
    this.stateValue = { ...this.stateValue, selectedAccountId: id }
    this.emit()
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }
}
