/**
 * Command locale strings for the /commandcode Host-side command.
 *
 * Host commands cannot read the client's locale service, so language is
 * resolved from the explicit `lang` config or the launching shell's
 * LC_ALL/LANG. Two surfaces, two independent locales.
 */

export type LocaleId = 'zh' | 'en'

/** All translatable strings for the /commandcode command. */
export interface CommandLocale {
  commandName: string
  commandDescription: string
  usageTitle: string
  accountLabel: string
  planLabel: string
  creditsLabel: string
  monthlyCredits: string
  purchasedCredits: string
  freeCredits: string
  fiveHourWindow: string
  weeklyWindow: string
  used: string
  cap: string
  exceeded: string
  resetsAt: string
  totalRequests: string
  successRate: string
  totalCost: string
  tokensIn: string
  tokensOut: string
  noAccountsConfigured: string
  noKeyFound: string
  fetchingUsage: string
  usageFetchFailed: string
  activeAccount: string
  rateLimited: string
  invalidCredential: string
  refreshHint: string
}

/** Chinese strings. */
export const zh: CommandLocale = {
  commandName: 'commandcode',
  commandDescription: '查看 Command Code 账户用量与订阅状态',
  usageTitle: 'Command Code 用量概览',
  accountLabel: '账户',
  planLabel: '套餐',
  creditsLabel: '额度',
  monthlyCredits: '月度额度',
  purchasedCredits: '按需额度',
  freeCredits: '免费额度',
  fiveHourWindow: '5 小时窗口',
  weeklyWindow: '每周窗口',
  used: '已用',
  cap: '上限',
  exceeded: '已超限',
  resetsAt: '重置时间',
  totalRequests: '总请求数',
  successRate: '成功率',
  totalCost: '总费用',
  tokensIn: '输入 Tokens',
  tokensOut: '输出 Tokens',
  noAccountsConfigured: '未配置任何账户，请在设置页面配置 API Key',
  noKeyFound: '未找到 API Key',
  fetchingUsage: '正在获取用量数据…',
  usageFetchFailed: '用量数据获取失败',
  activeAccount: '当前账户',
  rateLimited: '已限流',
  invalidCredential: '凭证无效',
  refreshHint: '运行 /commandcode 刷新数据',
}

/** English strings. */
export const en: CommandLocale = {
  commandName: 'commandcode',
  commandDescription: 'View Command Code account usage and subscription status',
  usageTitle: 'Command Code Usage Overview',
  accountLabel: 'Account',
  planLabel: 'Plan',
  creditsLabel: 'Credits',
  monthlyCredits: 'Monthly Credits',
  purchasedCredits: 'On-demand Credits',
  freeCredits: 'Free Credits',
  fiveHourWindow: '5-Hour Window',
  weeklyWindow: 'Weekly Window',
  used: 'Used',
  cap: 'Cap',
  exceeded: 'Exceeded',
  resetsAt: 'Resets At',
  totalRequests: 'Total Requests',
  successRate: 'Success Rate',
  totalCost: 'Total Cost',
  tokensIn: 'Input Tokens',
  tokensOut: 'Output Tokens',
  noAccountsConfigured: 'No accounts configured. Set an API key in the settings page.',
  noKeyFound: 'No API key found',
  fetchingUsage: 'Fetching usage data…',
  usageFetchFailed: 'Failed to fetch usage data',
  activeAccount: 'Active Account',
  rateLimited: 'Rate Limited',
  invalidCredential: 'Invalid Credential',
  refreshHint: 'Run /commandcode to refresh',
}

/**
 * Pick the command locale from the explicit config or shell environment.
 * An unknown value is treated as "unset" → falls back to shell → 'zh'.
 */
export function pickCommandLocale(lang?: string): LocaleId {
  if (lang === 'zh' || lang === 'en') return lang
  // Try shell environment
  const shellLang = process.env.LC_ALL ?? process.env.LANG ?? ''
  if (shellLang.toLowerCase().startsWith('en')) return 'en'
  return 'zh'
}
