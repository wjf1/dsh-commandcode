/**
 * /commandcode Host-side command — displays per-account usage, plan, and
 * billing information in the terminal.
 *
 * Rides the optional `commands` service; the fiber never activates when
 * the profile does not mount dsh-commands.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandCodeAdapter, CommandCodeUsageReport } from './adapter.ts'
import type { CommandCodeAccountsReport } from './usage-wire.ts'
import type { CommandLocale, LocaleId } from './command-locales.ts'

/** Dependencies for the command. */
export interface CommandCodeCommandDeps {
  adapter: CommandCodeAdapter
  reports: () => Promise<CommandCodeAccountsReport>
  getLocale: () => LocaleId
}

/** Command definition (for registration with the commands service). */
export const commandDefinition = {
  name: 'commandcode',
  description: {
    zh: '查看 Command Code 账户用量与订阅状态',
    en: 'View Command Code account usage and subscription status',
  },
}

/**
 * Apply the /commandcode command to the commands context.
 */
export function applyCommands(ctx: Context, deps: CommandCodeCommandDeps): void {
  const commands = ctx.get('commands')
  if (commands === undefined) return

  commands.register({
    name: 'commandcode',
    description: 'View Command Code account usage and subscription status',
    execute: async () => {
      const locale = deps.getLocale()
      const t = getLocaleStrings(locale)
      const report = await deps.reports()
      return renderUsageReport(report, t)
    },
  })
}

/** Get locale strings by id. */
function getLocaleStrings(locale: LocaleId): CommandLocale {
  // Dynamic import to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { zh, en } = require('./command-locales.ts') as { zh: CommandLocale; en: CommandLocale }
  return locale === 'en' ? en : zh
}

/**
 * Render the usage report as a human-readable string.
 */
function renderUsageReport(report: CommandCodeAccountsReport, t: CommandLocale): string {
  const lines: string[] = []
  lines.push(`=== ${t.usageTitle} ===`)
  lines.push('')

  if (report.accounts.length === 0) {
    lines.push(t.noAccountsConfigured)
    return lines.join('\n')
  }

  for (const account of report.accounts) {
    const badge = account.active ? `[${t.activeAccount}]` : ''
    const markBadge = account.mark === 'rate-limit'
      ? `[${t.rateLimited}]`
      : account.mark === 'invalid-credential'
        ? `[${t.invalidCredential}]`
        : ''

    lines.push(`--- ${account.label} ${badge} ${markBadge} ---`)

    if (!account.configured) {
      lines.push(`  ${t.noApiKey}`)
      lines.push('')
      continue
    }

    const r = account.report

    if (r.blocked) {
      lines.push(`  ${t.usageFetchFailed}: ${r.blocked}`)
      lines.push('')
      continue
    }

    if (r.account) {
      lines.push(`  ${t.accountLabel}: ${r.account.userName || r.account.name || r.account.id}`)
    }
    if (r.plan) {
      lines.push(`  ${t.planLabel}: ${r.plan.name} (${r.plan.status})`)
    }
    if (r.credits) {
      lines.push(`  ${t.monthlyCredits}: ${r.credits.monthlyCredits}`)
      lines.push(`  ${t.purchasedCredits}: ${r.credits.purchasedCredits}`)
      lines.push(`  ${t.freeCredits}: ${r.credits.freeCredits}`)
      lines.push('')
      lines.push(`  ${t.fiveHourWindow}:`)
      lines.push(`    ${t.used}: ${r.credits.fiveHour.used} / ${r.credits.fiveHour.cap}`)
      if (r.credits.fiveHour.exceeded) {
        lines.push(`    ${t.exceeded}! ${t.resetsAt}: ${new Date(r.credits.fiveHour.resetAt).toLocaleString()}`)
      }
      lines.push(`  ${t.weeklyWindow}:`)
      lines.push(`    ${t.used}: ${r.credits.weekly.used} / ${r.credits.weekly.cap}`)
      if (r.credits.weekly.exceeded) {
        lines.push(`    ${t.exceeded}! ${t.resetsAt}: ${new Date(r.credits.weekly.resetAt).toLocaleString()}`)
      }
    }
    if (r.usage) {
      lines.push('')
      lines.push(`  ${t.totalRequests}: ${r.usage.totalCount}`)
      lines.push(`  ${t.successRate}: ${(r.usage.successRate * 100).toFixed(1)}%`)
      lines.push(`  ${t.totalCost}: ${r.usage.totalCost.toFixed(4)}`)
      lines.push(`  ${t.tokensIn}: ${r.usage.totalTokensIn}`)
      lines.push(`  ${t.tokensOut}: ${r.usage.totalTokensOut}`)
    }
    if (r.failures.length > 0) {
      lines.push('')
      lines.push(`  ${t.usageFetchFailed}:`)
      for (const failure of r.failures) {
        lines.push(`    - ${failure}`)
      }
    }
    lines.push('')
  }

  lines.push(t.refreshHint)
  return lines.join('\n')
}
