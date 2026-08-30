/**
 * Settings controller — manages the settings page state, validation, and
 * persistence through the credentials domain and settings namespace.
 */

import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

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
  apiKey: string
  apiKeyEnv: string
  apiBase: string
  workingDir: string
  requestTimeoutMs: string
  streamIdleTimeoutMs: string
  filterModelsByPlan: boolean
  modelsCachePath: string
  lang: string
  accounts: AccountFormEntry[]
  activeAccount: string
  dirty: boolean
  saving: boolean
  saved: boolean
  failed: boolean
  errorMessage: string
  anyAccountConfigured: boolean
  errors: Record<string, string>
}

interface CredentialsApi {
  get: (ref: CredentialRef) => Promise<{ value: string } | undefined>
  set: (ref: CredentialRef, value: string) => Promise<void>
}

interface SettingsScope {
  get: () => Record<string, unknown>
  set: (patch: Record<string, unknown>) => Promise<void>
}

interface ControllerDeps {
  credentials: CredentialsApi
  hostDescription?: { platform?: string }
}

const DEFAULT_STATE: SettingsPageState = {
  apiKey: '',
  apiKeyEnv: 'COMMANDCODE_API_KEY',
  apiBase: '',
  workingDir: '',
  requestTimeoutMs: '',
  streamIdleTimeoutMs: '',
  filterModelsByPlan: true,
  modelsCachePath: '',
  lang: 'zh',
  accounts: [],
  activeAccount: '',
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
  private disposed = false

  constructor(
    private readonly scope: SettingsScope,
    private readonly deps: ControllerDeps,
  ) {
    this.stateValue = { ...DEFAULT_STATE }
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
      const settings = this.scope.get()
      const apiKeyEnv = typeof settings.apiKeyEnv === 'string' ? settings.apiKeyEnv : 'COMMANDCODE_API_KEY'

      let apiKey = ''
      try {
        const ref = { name: apiKeyEnv } as CredentialRef
        const cred = await this.deps.credentials.get(ref)
        apiKey = cred?.value ?? ''
      } catch {
        // credentials service may not be available
      }

      const accounts: AccountFormEntry[] = Array.isArray(settings.accounts)
        ? settings.accounts.map((a: Record<string, unknown>, i: number) => ({
            id: typeof a.apiKeyEnv === 'string' && a.apiKeyEnv ? a.apiKeyEnv : `account-${i + 2}`,
            label: typeof a.label === 'string' ? a.label : `Account ${i + 2}`,
            apiKey: typeof a.apiKey === 'string' ? a.apiKey : '',
            apiKeyEnv: typeof a.apiKeyEnv === 'string' ? a.apiKeyEnv : '',
            showKey: false,
          }))
        : []

      this.stateValue = {
        ...DEFAULT_STATE,
        apiKey,
        apiKeyEnv,
        apiBase: typeof settings.apiBase === 'string' ? settings.apiBase : '',
        workingDir: typeof settings.workingDir === 'string' ? settings.workingDir : '',
        requestTimeoutMs: settings.requestTimeoutMs !== undefined ? String(settings.requestTimeoutMs) : '',
        streamIdleTimeoutMs: settings.streamIdleTimeoutMs !== undefined ? String(settings.streamIdleTimeoutMs) : '',
        filterModelsByPlan: settings.filterModelsByPlan !== false,
        modelsCachePath: typeof settings.modelsCachePath === 'string' ? settings.modelsCachePath : '',
        lang: typeof settings.lang === 'string' ? settings.lang : 'zh',
        accounts,
        activeAccount: typeof settings.activeAccount === 'string' ? settings.activeAccount : '',
        anyAccountConfigured: apiKey.length > 0 || accounts.some((a) => a.apiKey.length > 0 || a.apiKeyEnv.length > 0),
        dirty: false,
      }
      this.emit()
    } catch (error) {
      this.stateValue = {
        ...DEFAULT_STATE,
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
      if (this.stateValue.apiKey) {
        try {
          const ref = { name: this.stateValue.apiKeyEnv || 'COMMANDCODE_API_KEY' } as CredentialRef
          await this.deps.credentials.set(ref, this.stateValue.apiKey)
        } catch {
          // credentials set may fail; settings still save
        }
      }

      const patch: Record<string, unknown> = {
        apiKeyEnv: this.stateValue.apiKeyEnv || 'COMMANDCODE_API_KEY',
        apiBase: this.stateValue.apiBase || undefined,
        workingDir: this.stateValue.workingDir || undefined,
        requestTimeoutMs: this.stateValue.requestTimeoutMs ? Number(this.stateValue.requestTimeoutMs) : undefined,
        streamIdleTimeoutMs: this.stateValue.streamIdleTimeoutMs ? Number(this.stateValue.streamIdleTimeoutMs) : undefined,
        filterModelsByPlan: this.stateValue.filterModelsByPlan,
        modelsCachePath: this.stateValue.modelsCachePath || undefined,
        lang: this.stateValue.lang || undefined,
        activeAccount: this.stateValue.activeAccount || undefined,
        accounts: this.stateValue.accounts.map((a) => ({
          label: a.label,
          apiKeyEnv: a.apiKeyEnv || undefined,
          apiKey: a.apiKey || undefined,
        })),
      }
      for (const key of Object.keys(patch)) {
        if (patch[key] === undefined) delete patch[key]
      }

      await this.scope.set(patch)

      this.stateValue = {
        ...this.stateValue,
        saving: false,
        saved: true,
        dirty: false,
        anyAccountConfigured: this.stateValue.apiKey.length > 0
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

  async refreshCredentials(): Promise<void> {
    await this.load()
  }

  dispose(): void {
    this.disposed = true
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
