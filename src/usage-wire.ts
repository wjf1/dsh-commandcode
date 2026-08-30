/**
 * Usage wire protocol types — shared between Host and Client.
 *
 * The Host exposes the `commandcode/report` Typert Gateway endpoint that
 * returns per-account usage, billing, and plan data for the settings page.
 */

import z from '@deepseek-ai/schemastery'

/** Endpoint path (mounted under the `commandcode` Typert namespace). */
export const USAGE_REPORT_ENDPOINT = 'commandcode/report'

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

/** Schema for the report endpoint response. */
export const usageReportSchema = z.object({
  accounts: z.array(z.object({
    id: z.string(),
    label: z.string(),
    configured: z.boolean(),
    active: z.boolean(),
    mark: z.union([z.literal(''), z.literal('rate-limit'), z.literal('invalid-credential')]),
    cooldownUntil: z.number(),
    report: z.object({
      failures: z.array(z.string()),
      blocked: z.union([
        z.literal('invalid-key'),
        z.literal('service-unavailable'),
        z.literal('network'),
      ]).optional(),
    }).passthrough(),
  })),
})

/** Typert Remote contribution descriptor for the usage endpoint. */
export const USAGE_REMOTE_CONTRIBUTION = {
  package: 'dsh-commandcode',
  descriptors: [
    { name: USAGE_REPORT_ENDPOINT, input: z.object({}), output: usageReportSchema },
  ],
} as const
