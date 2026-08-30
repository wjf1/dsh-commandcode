/**
 * Command Code provider card — rendered on the Models page for the
 * `commandcode` provider. Shows connection status, a quick API key field,
 * and a login button.
 */

import React from 'react'
import type { SettingsPageState } from './settings.ts'
import type { LoginPageState } from './login.ts'
import type { ClientLocale } from './locales.ts'

/** Props injected by the slot registration. */
export interface CommandCodeProviderCardProps {
  hooks: {
    commandCodeSettings: { get: () => SettingsPageState }
    commandCodeLogin: { get: () => LoginPageState }
  }
  edit: (field: string, text: string) => void
  save: () => void
  beginLogin: () => void
  cancelLogin: () => void
  t: (key: keyof ClientLocale) => string
}

export function CommandCodeProviderCard(props: CommandCodeProviderCardProps): React.ReactElement {
  const { hooks, t } = props
  const settings = hooks.commandCodeSettings.get()
  const login = hooks.commandCodeLogin.get()

  return (
    <div className="cc-card">
      <div className="cc-field">
        <div className="cc-fieldHead">
          <span className="cc-label">{t('cardTitle')}</span>
          {settings.anyAccountConfigured ? (
            <span className="cc-badge">{t('cardConfigured')}</span>
          ) : (
            <span className="cc-badgeMuted">{t('cardNotConfigured')}</span>
          )}
        </div>
        <p className="cc-hint">{t('apiKeyHint')}</p>
      </div>

      <div className="cc-field">
        <div className="cc-fieldHead">
          <label className="cc-label" htmlFor="cc-card-api-key">{t('apiKeyLabel')}</label>
        </div>
        <input
          id="cc-card-api-key"
          className="cc-input"
          type="password"
          value={settings.apiKey}
          placeholder={t('apiKeyPlaceholder')}
          onChange={(e) => props.edit('apiKey', e.target.value)}
          onBlur={() => { if (settings.dirty) props.save() }}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="cc-field">
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

      {settings.saved && (
        <p className="cc-saved">{t('saved')}</p>
      )}
    </div>
  )
}
