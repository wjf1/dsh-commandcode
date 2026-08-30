/**
 * Browser half of the dsh-commandcode bundle.
 *
 * Two responsibilities:
 * 1. A "Command Code" settings page (settings.section slot) with API key,
 *    endpoint, timeouts, multi-account, usage display, and quick login.
 * 2. The Models-page provider card (settings.models.provider-card slot)
 *    for the `commandcode` provider.
 *
 * Enhancement over the reference: unified CSS design system, real-time form
 * validation, per-account usage tabs, and DSH-Desktop 0.7.1 design token
 * alignment.
 */

import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

import { installFriendlyImageError, type ConnectionLike } from './sessions.ts'
import { CommandCodeSettingsController, COMMANDCODE_NS, type SettingsPageState } from './settings.ts'
import { CommandCodeUsageController, type UsagePageState, type UsageRemote } from './usage.ts'
import { CommandCodeLoginController, type LoginPageState, type LoginRemote } from './login.ts'
import { USAGE_REMOTE_CONTRIBUTION } from '../usage-wire.ts'
import { LOGIN_REMOTE_CONTRIBUTION } from '../login-wire.ts'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { CommandCodeSettingsPage } from './section.tsx'
import { CommandCodeProviderCard } from './card.tsx'
import { zh, en } from './locales.ts'

export { isImageSessionRejection, withFriendlyImageError } from './sessions.ts'

/** CSS for the settings page and provider card, injected once. */
const PAGE_CSS = `
.cc-section{max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex;padding:8px 0}
.cc-title{margin:0;font-size:20px;font-weight:600;letter-spacing:-0.01em}
.cc-intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.6}
.cc-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:14px;padding:4px 18px;transition:border-color .15s ease}
.cc-card:hover{border-color:var(--dsw-alias-border-l1)}
.cc-field{flex-direction:column;gap:6px;padding:14px 0;display:flex}
.cc-field+.cc-field{border-top:1px solid var(--dsw-alias-border-l2)}
.cc-fieldHead{align-items:center;gap:8px;display:flex}
.cc-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}
.cc-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;line-height:18px}
.cc-badgeMuted{white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:2px 10px;font-size:11px;line-height:18px}
.cc-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5;transition:color .15s ease}
.cc-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.cc-reset:disabled{cursor:default;opacity:.4}
.cc-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);height:36px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:10px;padding:0 14px;font-size:13px;line-height:1.5;transition:border-color .15s ease,box-shadow .15s ease;width:100%;box-sizing:border-box}
.cc-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none;box-shadow:0 0 0 3px var(--dsw-alias-brand-primary, rgba(59,130,246,.15))}
.cc-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
select.cc-input{appearance:none;-webkit-appearance:none;-moz-appearance:none;box-sizing:border-box;padding-right:36px;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23888f98' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.cc-inputInvalid{border-color:var(--dsw-alias-label-error)}
.cc-invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}
.cc-advanced{padding:0}
.cc-advancedHead{align-items:center;gap:8px;display:flex;width:100%;padding:14px 0;background:0 0;border:none;cursor:pointer;font:inherit;text-align:left;list-style:none}
.cc-advancedHead::-webkit-details-marker{display:none}
.cc-advancedTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
.cc-advancedSpacer{flex:1}
.cc-chevron{flex-shrink:0;border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);width:8px;height:8px;margin-right:4px;margin-bottom:2px;transform:rotate(45deg);transition:transform .15s ease}
.cc-advanced[open] .cc-chevron{transform:rotate(-135deg);margin-bottom:-3px}
.cc-advancedBody{flex-direction:column;display:flex}
.cc-advancedBody>.cc-field:first-of-type{border-top:1px solid var(--dsw-alias-border-l2)}
.cc-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.6}
.cc-footer{justify-content:flex-end;align-items:center;gap:10px;display:flex;padding:8px 0}
.cc-toggleRow{align-items:center;gap:10px;cursor:pointer;display:flex}
.cc-toggle{appearance:none;flex-shrink:0;background:var(--dsw-alias-border-l2);border-radius:999px;width:34px;height:20px;margin:0;cursor:pointer;position:relative;transition:background .15s ease}
.cc-toggle:checked{background:var(--dsw-alias-brand-primary)}
.cc-toggle::after{content:'';background:#fff;border-radius:50%;width:16px;height:16px;position:absolute;top:2px;left:2px;transition:left .15s ease}
.cc-toggle:checked::after{left:16px}
.cc-toggle:disabled{cursor:default;opacity:.4}
.cc-failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
.cc-saveBtn{width:auto;padding:0 20px;font-weight:600;background:var(--dsw-alias-brand-primary);color:#fff;border-color:var(--dsw-alias-brand-primary);cursor:pointer}
.cc-saveBtn:hover:not(:disabled){opacity:.9}
.cc-saveBtn:disabled{opacity:.5;cursor:default}
.cc-loginBtn{width:auto;padding:0 16px;font-weight:500;background:var(--dsw-alias-bg-layer-1);cursor:pointer}
.cc-loginBtn:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.cc-loginPending{align-items:center;gap:10px;display:flex}
.cc-loginBusy{color:var(--dsw-alias-label-tertiary);font-size:12px}
.cc-loginDone{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));margin:0;font-size:12px;font-weight:500}
.cc-loginError{color:var(--dsw-alias-label-error);margin:0;font-size:12px}
.cc-saved{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));margin:0;font-size:12px;font-weight:500}
.cc-accountLabel{max-width:200px}
.cc-usageCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:14px;padding:16px 18px;flex-direction:column;gap:14px;display:flex}
.cc-usageHead{align-items:center;gap:8px;display:flex}
.cc-usageTitle{color:var(--dsw-alias-label-primary);flex:1;margin:0;font-size:14px;font-weight:600;line-height:1.5}
.cc-usageAccount{max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:500;line-height:18px}
.cc-usagePlan{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-brand-primary);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;line-height:18px}
.cc-usageRefresh{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5;transition:color .15s ease}
.cc-usageRefresh:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.cc-usageRefresh:disabled{cursor:default;opacity:.4}
.cc-usageHint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.cc-usageError{align-items:center;gap:8px;color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5;display:flex}
.cc-usageStats{grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;display:grid}
.cc-usageStat{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:10px 12px;flex-direction:column;gap:2px;display:flex}
.cc-usageStatLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}
.cc-usageStatValue{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:1.4}
.cc-usageWindows{flex-direction:column;gap:14px;display:flex}
.cc-usageWindow{flex-direction:column;gap:6px;display:flex}
.cc-usageWindowHead{align-items:baseline;gap:8px;display:flex}
.cc-usageWindowLabel{color:var(--dsw-alias-label-secondary);flex:1;font-size:12px;font-weight:500;line-height:1.5}
.cc-usageWindowValue{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500;line-height:1.5}
.cc-usageExceeded{color:var(--dsw-alias-label-error);font-size:11px;font-weight:600;line-height:1.5}
.cc-usageBar{overflow:hidden;background:var(--dsw-alias-bg-layer-1);border-radius:999px;height:6px}
.cc-usageBarFill{background:var(--dsw-alias-brand-primary);border-radius:999px;height:100%;transition:width .3s ease}
.cc-usageBarFillWarn{background:var(--dsw-alias-label-error)}
.cc-usageMeta{align-items:center;gap:8px;display:flex;flex-wrap:wrap}
.cc-usageMetaSpacer{flex:1}
.cc-usageUpdated{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11px;line-height:1.5}
.cc-usagePartial{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));margin:0;font-size:11px;line-height:1.5}
.cc-usageBlocked{border:1px solid var(--dsw-alias-label-error);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.cc-usageBlockedTitle{color:var(--dsw-alias-label-error);margin:0;font-size:13px;font-weight:600;line-height:1.5}
.cc-accountReport{flex-direction:column;gap:12px;display:flex}
.cc-tabs{flex-wrap:wrap;gap:6px;display:flex}
.cc-tab{align-items:center;font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:4px 12px;font-size:12px;line-height:18px;display:inline-flex;gap:6px;transition:all .15s ease}
.cc-tab:hover:not(.cc-tabActive){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.cc-tabActive{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-3)}
.cc-tabDotOk{background:var(--dsw-alias-brand-primary);border-radius:50%;width:6px;height:6px}
.cc-tabDotWarn{background:#d97706;border-radius:50%;width:6px;height:6px}
.cc-tabDotError{background:var(--dsw-alias-label-error);border-radius:50%;width:6px;height:6px}
.cc-version{margin:4px 0 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
`

function injectPageCss(): void {
  if (typeof document === 'undefined') return
  const id = 'dsh-commandcode/settings.css'
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-commandcode'
  tag.dataset.pluginCss = id
  tag.textContent = PAGE_CSS
  document.head.appendChild(tag)
}

export function apply(ctx: Context): void {
  injectPageCss()

  const connection = ctx.get('connection') as ConnectionLike | undefined
  if (connection !== undefined) {
    installFriendlyImageError(connection, () => ctx.locale.getLocale().active)
  }

  ctx.effect(
    () => ctx.locale.register('settings.commandcode', { zh, en }),
    'dsh-commandcode: page copy',
  )

  const api = ctx.get('connection').api
  const hostDescription = ctx.get('connection').hostDescription
  const scope = ctx.settingsScope.bind<Record<string, unknown>>({ namespace: COMMANDCODE_NS })
  const controller = new CommandCodeSettingsController(scope, { credentials: api.credentials, hostDescription })
  ctx.effect(() => () => controller.dispose(), 'dsh-commandcode: settings controller')
  const store = createSnapshotStore<SettingsPageState>(controller.state())
  controller.subscribe(() => store.set(controller.state()))

  let usageNamespace: (typeof ctx.remote)['commandcode'] | undefined
  let usageMountError: string | undefined

  const contribution: TypertRemoteContribution = {
    package: USAGE_REMOTE_CONTRIBUTION.package,
    descriptors: [...USAGE_REMOTE_CONTRIBUTION.descriptors, ...LOGIN_REMOTE_CONTRIBUTION.descriptors],
  }

  ctx.effect(() => {
    let unmount: (() => Promise<void>) | undefined
    void ctx.remote.$mount(contribution).then((dispose) => {
      unmount = dispose
      ctx.inject(['remote.commandcode'], (namespaceCtx) => {
        usageNamespace = namespaceCtx.remote.commandcode
        namespaceCtx.effect(() => () => { usageNamespace = undefined }, 'dsh-commandcode: usage namespace')
      })
    }, (error: unknown) => {
      usageMountError = error instanceof Error ? error.message : String(error)
    })
    return () => { void unmount?.() }
  }, 'dsh-commandcode: usage remote')

  const usageRemote: UsageRemote = {
    report: async () => {
      const namespace = usageNamespace
      if (namespace === undefined) {
        return { ok: false, error: { message: usageMountError ?? 'Usage service not available' } }
      }
      try {
        const data = await namespace.report()
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
      }
    },
  }

  const usageController = new CommandCodeUsageController(usageRemote)
  ctx.effect(() => () => usageController.dispose(), 'dsh-commandcode: usage controller')
  const usageStore = createSnapshotStore<UsagePageState>(usageController.state())
  usageController.subscribe(() => usageStore.set(usageController.state()))

  const loginRemote: LoginRemote = {
    begin: async () => {
      const namespace = usageNamespace
      if (namespace === undefined) return { ok: false, error: { message: 'Login service not available' } }
      try {
        const data = await namespace['login/begin']()
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
      }
    },
    status: async () => {
      const namespace = usageNamespace
      if (namespace === undefined) return { ok: false, error: { message: 'Login service not available' } }
      try {
        const data = await namespace['login/status']()
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
      }
    },
    cancel: async () => {
      const namespace = usageNamespace
      if (namespace === undefined) return { ok: false, error: { message: 'Login service not available' } }
      try {
        const data = await namespace['login/cancel']()
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
      }
    },
  }

  const loginController = new CommandCodeLoginController(loginRemote)
  ctx.effect(() => () => loginController.dispose(), 'dsh-commandcode: login controller')
  const loginStore = createSnapshotStore<LoginPageState>(loginController.state())
  loginController.subscribe(() => loginStore.set(loginController.state()))

  const injected = () => ({
    hooks: { commandCodeSettings: store, commandCodeUsage: usageStore, commandCodeLogin: loginStore },
    edit: (field: string, text: string) => controller.edit(field, text),
    resetField: (field: string) => controller.resetField(field),
    save: () => void controller.save().then(() => {
      const settled = controller.state()
      if (!settled.failed && settled.anyAccountConfigured) void usageController.refresh()
    }),
    discard: () => controller.discard(),
    refreshUsage: () => void usageController.refresh(),
    beginLogin: () => void loginController.begin(),
    cancelLogin: () => void loginController.cancel(),
    addAccount: () => controller.addAccount(),
    removeAccount: (id: string) => controller.removeAccount(id),
    editAccountLabel: (id: string, text: string) => controller.editAccountLabel(id, text),
    editAccountKey: (id: string, text: string) => controller.editAccountKey(id, text),
    toggleKeyClear: (id: string) => controller.toggleKeyClear(id),
    t: (key: string) => ctx.locale.bind('settings.commandcode')(key),
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'commandcode',
    order: 12,
    label: () => ctx.locale.bind('settings.commandcode')('nav'),
    locale: 'settings.commandcode',
    inject: injected,
  }, CommandCodeSettingsPage))

  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: 'llm-commandcode',
    locale: 'settings.commandcode',
    inject: () => ({
      hooks: { commandCodeSettings: store, commandCodeLogin: loginStore },
      edit: (field: string, text: string) => controller.edit(field, text),
      save: () => void controller.save().then(() => {
        const settled = controller.state()
        if (!settled.failed && settled.anyAccountConfigured) void usageController.refresh()
      }),
      beginLogin: () => void loginController.begin(),
      cancelLogin: () => void loginController.cancel(),
      t: (key: string) => ctx.locale.bind('settings.commandcode')(key),
    }),
  }, CommandCodeProviderCard))
}

export const inject: readonly string[] = [
  'slots',
  'locale',
  'connection',
  'remote',
  'settingsScope',
]
