/**
 * Command Code settings page — a React component rendered in the DSH-Desktop
 * settings section. Covers:
 * - Connection config (API key, API base, working dir)
 * - Quick login (browser OAuth)
 * - Advanced settings (timeouts, model filter, cache path, language)
 * - Multi-account management
 * - Usage & plan display (per-account tabs)
 */

import React from 'react'
import { PLUGIN_VERSION } from './version.ts'
import type { SettingsPageState } from './settings.ts'
import type { UsagePageState } from './usage.ts'
import type { LoginPageState } from './login.ts'
import type { ClientLocale } from './locales.ts'

/** Props injected by the slot registration (hooks compartment → selector hooks). */
export interface CommandCodeSettingsPageProps {
  /** Owner share of the settings.section slot (supplied by the settings shell). */
  close?: () => void
  useCommandCodeSettings: <S>(sel: (s: SettingsPageState) => S) => S
  useCommandCodeUsage: <S>(sel: (s: UsagePageState) => S) => S
  useCommandCodeLogin: <S>(sel: (s: LoginPageState) => S) => S
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
  refreshUsage: () => void
  beginLogin: () => void
  cancelLogin: () => void
  addAccount: () => void
  removeAccount: (id: string) => void
  editAccountLabel: (id: string, text: string) => void
  editAccountKey: (id: string, text: string) => void
  toggleKeyClear: (id: string) => void
  setFilterModels: (value: boolean) => void
  selectUsageAccount: (id: string) => void
  t: (key: keyof ClientLocale) => string
}

export function CommandCodeSettingsPage(props: CommandCodeSettingsPageProps): React.ReactElement {
  const { t } = props
  const settings = props.useCommandCodeSettings((s) => s)
  const usage = props.useCommandCodeUsage((s) => s)
  const login = props.useCommandCodeLogin((s) => s)

  return (
    <div className="cc-section">
      <h2 className="cc-title">{t('title')}</h2>
      <p className="cc-intro">{t('intro')}</p>

      <div className="cc-card">
        <div className="cc-field">
          <div className="cc-fieldHead">
            <label className="cc-label" htmlFor="cc-api-key">{t('apiKeyLabel')}</label>
            {settings.apiKeyConfigured && <span className="cc-badge">{t('cardConfigured')}</span>}
          </div>
          <input
            id="cc-api-key"
            className={`cc-input ${settings.errors.apiKey ? 'cc-inputInvalid' : ''}`}
            type="password"
            value={settings.apiKey}
            placeholder={settings.apiKeyConfigured ? t('apiKeyConfiguredPlaceholder') : t('apiKeyPlaceholder')}
            onChange={(e) => props.edit('apiKey', e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="cc-hint">{t('apiKeyHint')}</p>
        </div>

        <div className="cc-field">
          <div className="cc-fieldHead">
            <label className="cc-label" htmlFor="cc-api-base">{t('apiBaseLabel')}</label>
            <button className="cc-reset" onClick={() => props.resetField('apiBase')} disabled={!settings.apiBase}>
              {t('reset')}
            </button>
          </div>
          <input
            id="cc-api-base"
            className={`cc-input ${settings.errors.apiBase ? 'cc-inputInvalid' : ''}`}
            type="url"
            value={settings.apiBase}
            placeholder={t('apiBasePlaceholder')}
            onChange={(e) => props.edit('apiBase', e.target.value)}
            spellCheck={false}
          />
          <p className="cc-hint">{t('apiBaseHint')}</p>
        </div>

        <div className="cc-field">
          <div className="cc-fieldHead">
            <span className="cc-label">{t('loginTitle')}</span>
          </div>
          <p className="cc-hint">{t('loginHint')}</p>
          {login.phase === 'idle' && (
            <button className="cc-input cc-loginBtn" onClick={() => props.beginLogin()}>
              {t('loginButton')}
            </button>
          )}
          {login.phase === 'pending' && (
            <div className="cc-loginPending">
              <span className="cc-loginBusy">{t('loginPending')}</span>
              <button className="cc-reset" onClick={() => props.cancelLogin()}>{t('loginCancel')}</button>
            </div>
          )}
          {login.phase === 'success' && (
            <p className="cc-loginDone">{t('loginSuccess')}</p>
          )}
          {login.phase === 'failed' && (
            <p className="cc-loginError">{t('loginFailed')}: {login.message ?? ''}</p>
          )}
        </div>
      </div>

      <div className="cc-usageCard">
        <div className="cc-usageHead">
          <span className="cc-usageTitle">{t('usageTitle')}</span>
          <span className="cc-usageMetaSpacer" />
          <UsageHeadMeta usage={usage} />
          <button
            className="cc-usageRefresh"
            onClick={() => props.refreshUsage()}
            disabled={usage.loading}
          >
            {usage.loading ? t('usageRefreshing') : t('usageRefresh')}
          </button>
        </div>
        <UsageDisplay usage={usage} onSelectAccount={props.selectUsageAccount} t={t} />
      </div>

      <div className="cc-card">
        <div className="cc-field">
          <div className="cc-fieldHead">
            <span className="cc-label">{t('accountsTitle')}</span>
            <button className="cc-reset" onClick={() => props.addAccount()}>
              + {t('addAccount')}
            </button>
          </div>
          <p className="cc-hint">{t('accountsIntro')}</p>
        </div>
        {settings.accounts.map((account) => (
          <div key={account.id} className="cc-field">
            <div className="cc-fieldHead">
              <input
                className="cc-input cc-accountLabel"
                value={account.label}
                placeholder={t('accountLabelPlaceholder')}
                onChange={(e) => props.editAccountLabel(account.id, e.target.value)}
              />
              <button className="cc-reset" onClick={() => props.removeAccount(account.id)}>
                {t('removeAccount')}
              </button>
            </div>
            <input
              className="cc-input"
              type={account.showKey ? 'text' : 'password'}
              value={account.apiKey}
              placeholder={t('accountKeyPlaceholder')}
              onChange={(e) => props.editAccountKey(account.id, e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ))}
      </div>

      <div className="cc-card">
        <details className="cc-advanced">
          <summary className="cc-advancedHead">
            <span className="cc-advancedTitle">{t('advancedTitle')}</span>
            <span className="cc-advancedSpacer" />
            <span className="cc-chevron" />
          </summary>
          <div className="cc-advancedBody">
            <div className="cc-field">
              <label className="cc-label" htmlFor="cc-req-timeout">{t('requestTimeoutLabel')}</label>
              <input
                id="cc-req-timeout"
                className={`cc-input ${settings.errors.requestTimeoutMs ? 'cc-inputInvalid' : ''}`}
                type="number"
                value={settings.requestTimeoutMs}
                placeholder="60000"
                onChange={(e) => props.edit('requestTimeoutMs', e.target.value)}
              />
              <p className="cc-hint">{t('requestTimeoutHint')}</p>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="cc-stream-timeout">{t('streamTimeoutLabel')}</label>
              <input
                id="cc-stream-timeout"
                className={`cc-input ${settings.errors.streamIdleTimeoutMs ? 'cc-inputInvalid' : ''}`}
                type="number"
                value={settings.streamIdleTimeoutMs}
                placeholder="300000"
                onChange={(e) => props.edit('streamIdleTimeoutMs', e.target.value)}
              />
              <p className="cc-hint">{t('streamTimeoutHint')}</p>
            </div>
            <div className="cc-field">
              <div className="cc-toggleRow">
                <input
                  type="checkbox"
                  className="cc-toggle"
                  checked={settings.filterModelsByPlan}
                  onChange={(e) => props.setFilterModels(e.target.checked)}
                />
                <span className="cc-label">{t('filterModelsLabel')}</span>
              </div>
              <p className="cc-hint">{t('filterModelsHint')}</p>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="cc-lang">{t('langLabel')}</label>
              <select
                id="cc-lang"
                className="cc-input"
                value={settings.lang}
                onChange={(e) => props.edit('lang', e.target.value)}
              >
                <option value="zh">{t('langZh')}</option>
                <option value="en">{t('langEn')}</option>
              </select>
            </div>
          </div>
        </details>
      </div>

      <div className="cc-footer">
        {settings.saved && <span className="cc-saved">{t('saved')}</span>}
        {settings.failed && <span className="cc-failed">{settings.errorMessage || 'Save failed'}</span>}
        <button className="cc-reset" onClick={() => props.discard()} disabled={!settings.dirty || settings.saving}>
          {t('discard')}
        </button>
        <button
          className="cc-input cc-saveBtn"
          onClick={() => props.save()}
          disabled={settings.saving || !settings.dirty}
        >
          {settings.saving ? t('saving') : t('save')}
        </button>
      </div>

      <p className="cc-version">
        {t('version')} {PLUGIN_VERSION}
      </p>
    </div>
  )
}

/** Right side of the usage card head: selected account chip + plan badge. */
function UsageHeadMeta({ usage }: { usage: UsagePageState }): React.ReactElement | null {
  const selected = usage.accounts.find((a) => a.id === usage.selectedAccountId) ?? usage.accounts[0]
  if (selected === undefined || !selected.configured) return null
  const name = selected.report.account?.userName || selected.report.account?.name || selected.label
  return (
    <>
      {name !== '' && <span className="cc-usageAccount">{name}</span>}
      {selected.report.plan !== undefined && <span className="cc-usagePlan">{selected.report.plan.name}</span>}
    </>
  )
}

function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function UsageWindow({ label, used, cap, exceeded, resetAt, t }: {
  label: string
  used: number
  cap: number
  exceeded: boolean
  resetAt: number
  t: (key: keyof ClientLocale) => string
}): React.ReactElement {
  const percent = cap > 0 ? Math.min(100, (used / cap) * 100) : 0
  return (
    <div className="cc-usageWindow">
      <div className="cc-usageWindowHead">
        <span className="cc-usageWindowLabel">{label}</span>
        {exceeded && <span className="cc-usageExceeded">{t('usageExceeded')}</span>}
        <span className="cc-usageMetaSpacer" />
        <span className="cc-usageWindowValue">{money(used)} / {money(cap)}</span>
      </div>
      <div className="cc-usageBar">
        <div
          className={`cc-usageBarFill ${exceeded ? 'cc-usageBarFillWarn' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* Show the reset time only while it is still ahead — a past stamp
          means the window already rolled over. */}
      {resetAt > Date.now() && (
        <p className="cc-usageResets">{t('usageResetsAt')} {new Date(resetAt).toLocaleString()}</p>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }): React.ReactElement {
  return (
    <div className="cc-stat">
      <span className="cc-statLabel">{label}</span>
      <span className="cc-statValue">{value}</span>
      {sub !== undefined && <span className="cc-statSub">{sub}</span>}
    </div>
  )
}

function UsageDisplay({ usage, onSelectAccount, t }: {
  usage: UsagePageState
  onSelectAccount: (id: string) => void
  t: (key: keyof ClientLocale) => string
}): React.ReactElement {
  if (usage.loading && usage.accounts.length === 0) {
    return <p className="cc-usageHint">{t('usageRefreshing')}</p>
  }
  if (usage.error !== undefined && usage.accounts.length === 0) {
    return <p className="cc-usageError">{usage.error}</p>
  }
  if (usage.accounts.length === 0) {
    return <p className="cc-usageHint">{t('usageNoAccounts')}</p>
  }

  const selected = usage.accounts.find((a) => a.id === usage.selectedAccountId) ?? usage.accounts[0]
  if (selected === undefined) {
    return <p className="cc-usageHint">{t('usageNoAccounts')}</p>
  }

  const report = selected.report
  const usageStats = report.usage
  const credits = report.credits
  const totalTokens = usageStats === undefined ? 0 : usageStats.totalTokensIn + usageStats.totalTokensOut

  return (
    <div className="cc-accountReport">
      {usage.accounts.length > 1 && (
        <div className="cc-tabs">
          {usage.accounts.map((account) => (
            <button
              key={account.id}
              className={`cc-tab ${account.id === selected.id ? 'cc-tabActive' : ''}`}
              onClick={() => onSelectAccount(account.id)}
            >
              {account.mark === 'rate-limit' && <span className="cc-tabDotWarn" />}
              {account.mark === 'invalid-credential' && <span className="cc-tabDotError" />}
              {account.active && <span className="cc-tabDotOk" />}
              {account.label}
            </button>
          ))}
        </div>
      )}

      {!selected.configured && (
        <p className="cc-usageHint">{t('usageNoAccounts')}</p>
      )}

      {selected.configured && report.blocked === 'invalid-key' && (
        <div className="cc-usageBlocked">
          <p className="cc-usageBlockedTitle">{t('usageBlockedInvalidKey')}</p>
        </div>
      )}
      {selected.configured && report.blocked === 'service-unavailable' && (
        <div className="cc-usageBlocked">
          <p className="cc-usageBlockedTitle">{t('usageBlockedService')}</p>
        </div>
      )}
      {selected.configured && report.blocked === 'network' && (
        <div className="cc-usageBlocked">
          <p className="cc-usageBlockedTitle">{t('usageBlockedNetwork')}</p>
        </div>
      )}

      {selected.configured && report.blocked === undefined && (
        <>
          {usageStats !== undefined && (
            <div className="cc-statGrid">
              <Stat
                label={t('totalRequests')}
                value={String(usageStats.totalCount)}
                sub={`${t('usageFailed')} ${usageStats.failedCount}`}
              />
              <Stat label={t('successRate')} value={`${Math.round(usageStats.successRate)}%`} />
              <Stat
                label={t('totalCost')}
                value={`$${usageStats.totalCost.toFixed(4)}`}
                sub={`$${usageStats.totalCredits.toFixed(2)} ${t('usageCreditsUnit')}`}
              />
              <Stat
                label={t('usageTokensLabel')}
                value={formatTokens(totalTokens)}
                sub={`${formatTokens(usageStats.totalTokensIn)} ${t('tokensIn')} / ${formatTokens(usageStats.totalTokensOut)} ${t('tokensOut')}`}
              />
            </div>
          )}

          {credits !== undefined && (
            <div className="cc-statGrid">
              <Stat label={t('usageMonthly')} value={money(credits.monthlyCredits)} />
              <Stat label={t('usagePurchased')} value={money(credits.purchasedCredits)} />
              <Stat label={t('usageFree')} value={money(credits.freeCredits)} />
            </div>
          )}

          {credits !== undefined && (
            <div className="cc-usageWindows">
              <UsageWindow
                label={t('usage5hWindow')}
                used={credits.fiveHour.used}
                cap={credits.fiveHour.cap}
                exceeded={credits.fiveHour.exceeded}
                resetAt={credits.fiveHour.resetAt}
                t={t}
              />
              <UsageWindow
                label={t('usageWeeklyWindow')}
                used={credits.weekly.used}
                cap={credits.weekly.cap}
                exceeded={credits.weekly.exceeded}
                resetAt={credits.weekly.resetAt}
                t={t}
              />
            </div>
          )}

          <div className="cc-usageFooter">
            {report.plan !== undefined && report.plan.currentPeriodEnd > 0 && (
              <span>{t('usagePeriodEnds')} {new Date(report.plan.currentPeriodEnd).toLocaleDateString()}</span>
            )}
            {usage.lastUpdated !== undefined && (
              <span>{t('usageUpdated')} {new Date(usage.lastUpdated).toLocaleTimeString()}</span>
            )}
          </div>

          {report.failures.length > 0 && (
            <p className="cc-usagePartial">{t('usagePartial')}: {report.failures.length}</p>
          )}
        </>
      )}
    </div>
  )
}
