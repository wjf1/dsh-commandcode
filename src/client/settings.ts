/**
 * Settings controller — manages the settings page state, validation, and
 * persistence through the settings-namespace scope and the credentials
 * Remote namespace.
 *
 * 0.1.2-alpha note: the scope is the reactive snapshot handle from
 * `dsh-client-ui-settings` (`getSnapshot`/`set`/`unset`), and the credentials
 * seam no longer returns secret values to the browser — the page reads a
 * configured/writable view (`credentials.describe`) and writes through
 * `credentials.set`. The stored API key is therefore never displayed; the
 * key input only accepts a replacement.
 */

import type { CredentialInfo } from '@deepseek-ai/dsh-credentials/types'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Settings namespace for the llm-commandcode section. */
export const COMMANDCODE_NS = 'llm-commandcode'

/** One account entry in the settings form. */
export interface AccountFormEntry {
  id: string
  label: string
  apiKey: string
  apiKeyEnv: string
  showKey: boolean
}

/** Settings page state. */
export interface SettingsPageState {
  /** Replacement key typed into the input; write-only, never read back. */
  apiKey: string
  apiKeyEnv: string
  apiKeyConfigured: boolean
  apiBase: string
  workingDir: string
  requestTimeoutMs: string
  streamIdleTimeoutMs: string
  filterModelsByPlan: boolean
  modelsCachePath: string
  lang: string
  accounts: AccountFormEntry[]
  activeAccount: string
  status: 'loading' | 'ready' | 'unavailable'
  dirty: boolean
  saving: boolean
  saved: boolean
  failed: boolean
  errorMessage: string
  anyAccountConfigured: boolean
  errors: Record<string, string>
}

/** Credentials view + write face (Remote namespace, RemoteResult-unwrapped). */
export interface CredentialsFace {
  describe: (refs: string[]) => Promise<Record<string, CredentialInfo> | undefined>
  set: (ref: string, value: string) => Promise<void>
}

type SectionValue = Record<string, unknown>

/** Dependencies for the controller. */
export interface ControllerDeps {
  credentials: CredentialsFace
}

const DEFAULT_API_KEY_ENV = 'COMMANDCODE_API_KEY'

const EMPTY_STATE: SettingsPageState = {
  apiKey: '',
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  apiKeyConfigured: false,
  apiBase: '',
  workingDir: '',
  requestTimeoutMs: '',
  streamIdleTimeoutMs: '',
  filterModelsByPlan: true,
  modelsCachePath: '',
  lang: 'zh',
  accounts: [],
  activeAccount: '',
  status: 'loading',
  dirty: false,
  saving: false,
  saved: false,
  failed: false,
  errorMessage: '',
  anyAccountConfigured: false,
  errors: {},
}

export class CommandCodeSettingsController {
  private stateValue: SettingsPageState
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribeScope: () => void
  private disposed = false

  constructor(
    private readonly scope: SettingsScope<SectionValue>,
    private readonly deps: ControllerDeps,
  ) {
    this.stateValue = { ...EMPTY_STATE }
    this.unsubscribeScope = this.scope.subscribe(() => {
      if (!this.stateValue.dirty) this.absorbSnapshot()
    })
    void this.load()
  }

  state(): SettingsPageState {
    return { ...this.stateValue, accounts: this.stateValue.accounts.map((a) => ({ ...a })) }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private patch(partial: Partial<SettingsPageState>): void {
    this.stateValue = { ...this.stateValue, ...partial, dirty: true, saved: false, failed: false }
    this.emit()
  }

  private section(): SectionValue {
    return this.scope.getSnapshot().value ?? {}
  }

  /** Re-read the scope snapshot into local state (keeps user edits when dirty). */
  private absorbSnapshot(apiKeyConfigured?: boolean): void {
    const section = this.section()
    const configured = apiKeyConfigured ?? this.stateValue.apiKeyConfigured
    const accounts: AccountFormEntry[] = Array.isArray(section.accounts)
      ? (section.accounts as Record<string, unknown>[]).map((a, i) => ({
          id: typeof a.apiKeyEnv === 'string' && a.apiKeyEnv ? a.apiKeyEnv : `account-${i + 2}`,
          label: typeof a.label === 'string' ? a.label : `Account ${i + 2}`,
          apiKey: typeof a.apiKey === 'string' ? a.apiKey : '',
          apiKeyEnv: typeof a.apiKeyEnv === 'string' ? a.apiKeyEnv : '',
          showKey: false,
        }))
      : []
    this.stateValue = {
      ...this.stateValue,
      apiKeyEnv: typeof section.apiKeyEnv === 'string' && section.apiKeyEnv !== ''
        ? section.apiKeyEnv
        : DEFAULT_API_KEY_ENV,
      apiKeyConfigured: configured,
      apiBase: typeof section.apiBase === 'string' ? section.apiBase : '',
      workingDir: typeof section.workingDir === 'string' ? section.workingDir : '',
      requestTimeoutMs: section.requestTimeoutMs !== undefined && section.requestTimeoutMs !== null
        ? String(section.requestTimeoutMs)
        : '',
      streamIdleTimeoutMs: section.streamIdleTimeoutMs !== undefined && section.streamIdleTimeoutMs !== null
        ? String(section.streamIdleTimeoutMs)
        : '',
      filterModelsByPlan: section.filterModelsByPlan !== false,
      modelsCachePath: typeof section.modelsCachePath === 'string' ? section.modelsCachePath : '',
      lang: typeof section.lang === 'string' ? section.lang : 'zh',
      accounts,
      activeAccount: typeof section.activeAccount === 'string' ? section.activeAccount : '',
      anyAccountConfigured: configured
        || accounts.some((a) => a.apiKey.length > 0 || a.apiKeyEnv.length > 0),
      status: this.scope.getSnapshot().status,
      dirty: false,
    }
    this.emit()
  }

  edit(field: string, text: string): void {
    const errors = { ...this.stateValue.errors }
    delete errors[field]
    this.patch({ [field]: text, errors } as Partial<SettingsPageState>)
  }

  editAccountLabel(id: string, text: string): void {
    const accounts = this.stateValue.accounts.map((a) =>
      a.id === id ? { ...a, label: text } : a,
    )
    this.patch({ accounts })
  }

  editAccountKey(id: string, text: string): void {
    const accounts = this.stateValue.accounts.map((a) =>
      a.id === id ? { ...a, apiKey: text } : a,
    )
    this.patch({ accounts })
  }

  toggleKeyClear(id: string): void {
    const accounts = this.stateValue.accounts.map((a) =>
      a.id === id ? { ...a, showKey: !a.showKey } : a,
    )
    this.patch({ accounts })
  }

  setFilterModels(value: boolean): void {
    this.patch({ filterModelsByPlan: value })
  }

  setLang(value: string): void {
    this.patch({ lang: value })
  }

  addAccount(): void {
    const id = `account-${Date.now()}`
    const accounts = [...this.stateValue.accounts, {
      id,
      label: `Account ${this.stateValue.accounts.length + 2}`,
      apiKey: '',
      apiKeyEnv: '',
      showKey: false,
    }]
    this.patch({ accounts })
  }

  removeAccount(id: string): void {
    const accounts = this.stateValue.accounts.filter((a) => a.id !== id)
    this.patch({ accounts })
  }

  resetField(field: string): void {
    const defaults: Record<string, string> = {
      apiBase: '',
      workingDir: '',
      requestTimeoutMs: '',
      streamIdleTimeoutMs: '',
      modelsCachePath: '',
    }
    if (field in defaults) {
      this.edit(field, defaults[field])
    }
  }

  private validate(): boolean {
    const errors: Record<string, string> = {}
    const { apiBase, requestTimeoutMs, streamIdleTimeoutMs } = this.stateValue

    if (apiBase && !isValidUrl(apiBase)) {
      errors.apiBase = 'invalidApiBase'
    }
    if (requestTimeoutMs && (!Number.isInteger(Number(requestTimeoutMs)) || Number(requestTimeoutMs) <= 0)) {
      errors.requestTimeoutMs = 'invalidTimeout'
    }
    if (streamIdleTimeoutMs && (!Number.isInteger(Number(streamIdleTimeoutMs)) || Number(streamIdleTimeoutMs) <= 0)) {
      errors.streamIdleTimeoutMs = 'invalidTimeout'
    }

    this.stateValue = { ...this.stateValue, errors }
    return Object.keys(errors).length === 0
  }

  private async load(): Promise<void> {
    try {
      const section = this.section()
      const apiKeyEnv = typeof section.apiKeyEnv === 'string' && section.apiKeyEnv !== ''
        ? section.apiKeyEnv
        : DEFAULT_API_KEY_ENV
      let configured = false
      try {
        const described = await this.deps.credentials.describe([apiKeyEnv])
        configured = described?.[apiKeyEnv]?.configured === true
      } catch {
        // credentials service may not be reachable; degrade to the section view
      }
      this.absorbSnapshot(configured)
      this.stateValue = { ...this.stateValue, status: this.scope.getSnapshot().status }
      this.emit()
    } catch (error) {
      this.stateValue = {
        ...EMPTY_STATE,
        failed: true,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
      this.emit()
    }
  }

  async save(): Promise<void> {
    if (!this.validate()) {
      this.stateValue = { ...this.stateValue, failed: true, errorMessage: 'validation' }
      this.emit()
      return
    }

    this.stateValue = { ...this.stateValue, saving: true, saved: false, failed: false }
    this.emit()

    try {
      const apiKeyEnv = this.stateValue.apiKeyEnv || DEFAULT_API_KEY_ENV

      // Replacement key only: stored secrets are write-only from the browser.
      if (this.stateValue.apiKey.length > 0) {
        try {
          await this.deps.credentials.set(apiKeyEnv, this.stateValue.apiKey)
          this.stateValue = { ...this.stateValue, apiKey: '', apiKeyConfigured: true }
        } catch {
          // credentials set may fail; settings still save
        }
      }

      const fieldWrites: Array<{ field: string; value: unknown }> = [
        { field: 'apiKeyEnv', value: apiKeyEnv },
        { field: 'apiBase', value: this.stateValue.apiBase || undefined },
        { field: 'workingDir', value: this.stateValue.workingDir || undefined },
        { field: 'requestTimeoutMs', value: this.stateValue.requestTimeoutMs ? Number(this.stateValue.requestTimeoutMs) : undefined },
        { field: 'streamIdleTimeoutMs', value: this.stateValue.streamIdleTimeoutMs ? Number(this.stateValue.streamIdleTimeoutMs) : undefined },
        { field: 'filterModelsByPlan', value: this.stateValue.filterModelsByPlan },
        { field: 'modelsCachePath', value: this.stateValue.modelsCachePath || undefined },
        { field: 'lang', value: this.stateValue.lang || undefined },
        { field: 'activeAccount', value: this.stateValue.activeAccount || undefined },
        {
          field: 'accounts',
          value: this.stateValue.accounts.map((a) => ({
            label: a.label,
            apiKeyEnv: a.apiKeyEnv || undefined,
            apiKey: a.apiKey || undefined,
          })),
        },
      ]

      for (const { field, value } of fieldWrites) {
        if (value === undefined) await this.scope.unset(field)
        else await this.scope.set(field, value)
      }

      this.stateValue = {
        ...this.stateValue,
        saving: false,
        saved: true,
        dirty: false,
        anyAccountConfigured: this.stateValue.apiKeyConfigured
          || this.stateValue.accounts.some((a) => a.apiKey.length > 0 || a.apiKeyEnv.length > 0),
      }
      this.emit()
    } catch (error) {
      this.stateValue = {
        ...this.stateValue,
        saving: false,
        failed: true,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
      this.emit()
    }
  }

  discard(): void {
    void this.load()
  }

  dispose(): void {
    this.disposed = true
    this.unsubscribeScope()
    this.listeners.clear()
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
