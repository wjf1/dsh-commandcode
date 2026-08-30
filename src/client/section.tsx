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
          <button
            className="cc-usageRefresh"
            onClick={() => props.refreshUsage()}
            disabled={usage.loading}
          >
            {usage.loading ? t('usageRefreshing') : t('usageRefresh')}
          </button>
        </div>
        <UsageDisplay usage={usage} t={t} />
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

function UsageDisplay({ usage, t }: { usage: UsagePageState; t: (key: keyof ClientLocale) => string }): React.ReactElement {
  if (usage.loading && usage.accounts.length === 0) {
    return <p className="cc-usageHint">{t('usageRefreshing')}</p>
  }
  if (usage.error && usage.accounts.length === 0) {
    return <p className="cc-usageError">{usage.error}</p>
  }
  if (usage.accounts.length === 0) {
    return <p className="cc-usageHint">{t('usageNoAccounts')}</p>
  }

  const selected = usage.accounts.find((a) => a.id === usage.selectedAccountId) ?? usage.accounts[0]

  return (
    <div className="cc-accountReport">
      <div className="cc-tabs">
        {usage.accounts.map((account) => (
          <button
            key={account.id}
            className={`cc-tab ${account.id === selected?.id ? 'cc-tabActive' : ''}`}
            onClick={() => { /* select handled by parent */ }}
          >
            {account.mark === 'rate-limit' && <span className="cc-tabDotWarn" />}
            {account.mark === 'invalid-credential' && <span className="cc-tabDotError" />}
            {account.active && <span className="cc-tabDotOk" />}
            {account.label}
          </button>
        ))}
      </div>

      {selected && (
        <div>
          {!selected.configured && (
            <p className="cc-usageHint">{t('usageNoAccounts')}</p>
          )}
          {selected.configured && selected.report.blocked === 'invalid-key' && (
            <div className="cc-usageBlocked">
              <p className="cc-usageBlockedTitle">{t('usageBlockedInvalidKey')}</p>
            </div>
          )}
          {selected.configured && selected.report.blocked === 'service-unavailable' && (
            <div className="cc-usageBlocked">
              <p className="cc-usageBlockedTitle">{t('usageBlockedService')}</p>
            </div>
          )}
          {selected.configured && selected.report.blocked === 'network' && (
            <div className="cc-usageBlocked">
              <p className="cc-usageBlockedTitle">{t('usageBlockedNetwork')}</p>
            </div>
          )}
          {selected.configured && !selected.report.blocked && (
            <>
              <div className="cc-usageMeta">
                {selected.report.account && (
                  <span className="cc-usageAccount">{selected.report.account.userName || selected.report.account.name}</span>
                )}
                {selected.report.plan && (
                  <span className="cc-usagePlan">{selected.report.plan.name}</span>
                )}
                <span className="cc-usageMetaSpacer" />
                {usage.lastUpdated && (
                  <span className="cc-usageUpdated">{t('usageUpdated')}: {new Date(usage.lastUpdated).toLocaleTimeString()}</span>
                )}
              </div>

              {selected.report.credits && (
                <div className="cc-usageWindows">
                  <div className="cc-usageWindow">
                    <div className="cc-usageWindowHead">
                      <span className="cc-usageWindowLabel">5-Hour Window</span>
                      <span className="cc-usageWindowValue">
                        {selected.report.credits.fiveHour.used} / {selected.report.credits.fiveHour.cap}
                      </span>
                      {selected.report.credits.fiveHour.exceeded && (
                        <span className="cc-usageExceeded">EXCEEDED</span>
                      )}
                    </div>
                    <div className="cc-usageBar">
                      <div
                        className={`cc-usageBarFill ${selected.report.credits.fiveHour.exceeded ? 'cc-usageBarFillWarn' : ''}`}
                        style={{ width: `${Math.min(100, (selected.report.credits.fiveHour.used / Math.max(1, selected.report.credits.fiveHour.cap)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {selected.report.usage && (
                <div className="cc-usageStats">
                  <div className="cc-usageStat">
                    <span className="cc-usageStatLabel">{t('totalRequests')}</span>
                    <span className="cc-usageStatValue">{selected.report.usage.totalCount}</span>
                  </div>
                  <div className="cc-usageStat">
                    <span className="cc-usageStatLabel">{t('successRate')}</span>
                    <span className="cc-usageStatValue">{(selected.report.usage.successRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="cc-usageStat">
                    <span className="cc-usageStatLabel">{t('totalCost')}</span>
                    <span className="cc-usageStatValue">{selected.report.usage.totalCost.toFixed(4)}</span>
                  </div>
                  <div className="cc-usageStat">
                    <span className="cc-usageStatLabel">{t('tokensIn')}</span>
                    <span className="cc-usageStatValue">{selected.report.usage.totalTokensIn.toLocaleString()}</span>
                  </div>
                  <div className="cc-usageStat">
                    <span className="cc-usageStatLabel">{t('tokensOut')}</span>
                    <span className="cc-usageStatValue">{selected.report.usage.totalTokensOut.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {selected.report.failures.length > 0 && (
                <p className="cc-usagePartial">{t('usagePartial')}: {selected.report.failures.length} endpoint(s) failed</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
