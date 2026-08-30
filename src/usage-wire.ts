/**
 * Usage wire protocol types — shared between Host and Client.
 *
 * The Host exposes a `GET /api/commandcode/report` Fetch route that returns
 * per-account usage, billing, and plan data for the settings page. The
 * payloads travel as plain JSON (no generated Remote codec), so the Client
 * side validates defensively through `parseAccountsReport`.
 */

/** Fetch route path (mounted on the shared `/api` channel). */
export const USAGE_REPORT_PATH = '/api/commandcode/report'

/** One account's usage entry in the report. */
export interface CommandCodeAccountUsage {
  id: string
  label: string
  configured: boolean
  active: boolean
  mark: '' | 'rate-limit' | 'invalid-credential'
  cooldownUntil: number
  report: {
    account?: { id: string; name: string; userName: string }
    usage?: {
      totalCount: number
      totalCost: number
      successRate: number
      completedCount: number
      failedCount: number
      totalTokensIn: number
      totalTokensOut: number
      totalCredits: number
      periodBasis: string
    }
    credits?: {
      monthlyCredits: number
      purchasedCredits: number
      freeCredits: number
      fiveHour: { used: number; cap: number; exceeded: boolean; resetAt: number }
      weekly: { used: number; cap: number; exceeded: boolean; resetAt: number }
    }
    plan?: {
      planId: string
      name: string
      status: string
      monthlyCredits: number | null
      currentPeriodEnd: number
    }
    failures: string[]
    blocked?: 'invalid-key' | 'service-unavailable' | 'network'
  }
}

/** Full usage report returned by the endpoint. */
export interface CommandCodeAccountsReport {
  accounts: CommandCodeAccountUsage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function parseMark(value: unknown): CommandCodeAccountUsage['mark'] {
  return value === 'rate-limit' || value === 'invalid-credential' ? value : ''
}

function parseBlocked(value: unknown): CommandCodeAccountUsage['report']['blocked'] {
  return value === 'invalid-key' || value === 'service-unavailable' || value === 'network'
    ? value
    : undefined
}

function parseReport(value: unknown): CommandCodeAccountUsage['report'] {
  const report = isRecord(value) ? value : {}
  const out: CommandCodeAccountUsage['report'] = { failures: [] }
  if (isRecord(report.account)) {
    out.account = {
      id: str(report.account.id, ''),
      name: str(report.account.name, ''),
      userName: str(report.account.userName, ''),
    }
  }
  if (isRecord(report.usage)) {
    out.usage = {
      totalCount: num(report.usage.totalCount, 0),
      totalCost: num(report.usage.totalCost, 0),
      successRate: num(report.usage.successRate, 0),
      completedCount: num(report.usage.completedCount, 0),
      failedCount: num(report.usage.failedCount, 0),
      totalTokensIn: num(report.usage.totalTokensIn, 0),
      totalTokensOut: num(report.usage.totalTokensOut, 0),
      totalCredits: num(report.usage.totalCredits, 0),
      periodBasis: str(report.usage.periodBasis, ''),
    }
  }
  if (isRecord(report.credits)) {
    const fh = isRecord(report.credits.fiveHour) ? report.credits.fiveHour : {}
    const wk = isRecord(report.credits.weekly) ? report.credits.weekly : {}
    out.credits = {
      monthlyCredits: num(report.credits.monthlyCredits, 0),
      purchasedCredits: num(report.credits.purchasedCredits, 0),
      freeCredits: num(report.credits.freeCredits, 0),
      fiveHour: {
        used: num(fh.used, 0),
        cap: num(fh.cap, 0),
        exceeded: fh.exceeded === true,
        resetAt: num(fh.resetAt, 0),
      },
      weekly: {
        used: num(wk.used, 0),
        cap: num(wk.cap, 0),
        exceeded: wk.exceeded === true,
        resetAt: num(wk.resetAt, 0),
      },
    }
  }
  if (isRecord(report.plan)) {
    out.plan = {
      planId: str(report.plan.planId, ''),
      name: str(report.plan.name, ''),
      status: str(report.plan.status, ''),
      monthlyCredits: typeof report.plan.monthlyCredits === 'number' ? report.plan.monthlyCredits : null,
      currentPeriodEnd: num(report.plan.currentPeriodEnd, 0),
    }
  }
  out.failures = Array.isArray(report.failures)
    ? report.failures.filter((f): f is string => typeof f === 'string')
    : []
  out.blocked = parseBlocked(report.blocked)
  return out
}

/**
 * Parse a raw report response (defensive: drops malformed entries instead of
 * throwing, so a partial Host report still renders).
 */
export function parseAccountsReport(value: unknown): CommandCodeAccountsReport {
  if (!isRecord(value) || !Array.isArray(value.accounts)) return { accounts: [] }
  const accounts: CommandCodeAccountUsage[] = []
  for (const entry of value.accounts) {
    if (!isRecord(entry)) continue
    accounts.push({
      id: str(entry.id, ''),
      label: str(entry.label, ''),
      configured: bool(entry.configured, false),
      active: bool(entry.active, false),
      mark: parseMark(entry.mark),
      cooldownUntil: num(entry.cooldownUntil, 0),
      report: parseReport(entry.report),
    })
  }
  return { accounts }
}
