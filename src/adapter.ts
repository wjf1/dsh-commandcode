/**
 * DeepSeek Harness LLM adapter for the Command Code Provider API.
 *
 * Enhanced reimplementation of the reference adapter with:
 * - Stale-while-revalidate model catalog (via ModelCatalog)
 * - Configurable request/stream timeouts with idle watchdog
 * - Structured error diagnostics (via CommandCodeError)
 * - Multi-account rotation with pre-stream 429/401 handling
 * - Image input via the durable attachment service
 * - Usage/billing endpoints with per-endpoint degradation
 * - Retry policy with exponential backoff + jitter
 *
 * Wire protocol (reverse-engineered from command-code CLI):
 *   POST {apiBase}/alpha/generate
 *   body: { config, memory, taste, skills, params: { model, messages, tools,
 *          system, max_tokens, temperature, stream, reasoning_effort? }, threadId }
 *   SSE-ish JSONL events: text-delta | reasoning-start/delta/end | tool-call
 *                         | tool-result | finish | error
 *   Model catalog: GET {apiBase}/provider/v1/models -> { object: 'list', data: [...] }
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
  ToolCallId,
  type ContentBlock,
  type FinishReason,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmReasoningEffortInfo,
  type LlmResolvedModelInfo,
  type Message,
  type StreamChunk,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm'

import { ModelCatalog, type CommandCodeModel } from './catalog.ts'
import { buildRetryPolicy } from './retry.ts'
import {
  CommandCodeError,
  CommandCodeErrorCode,
  httpError,
  wrapError,
} from './errors.ts'
import { RETRY_MAX_DELAY_MS } from './accounts.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default API base for the Command Code Provider API. */
export const DEFAULT_API_BASE = 'https://api.commandcode.ai'
/** Default request timeout (first byte): 60s. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000
/** Default stream idle timeout: 300s. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default max output tokens (capped by context window). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_768
/** Hard cap on generate max_tokens. */
export const DEFAULT_GENERATE_MAX_TOKENS = 65_536
/** CLI version reported to the API (the endpoint rejects clients below its
 *  `minVersion` when the `x-command-code-version` header is missing). */
export const COMMAND_CODE_CLI_VERSION = '1.38.2'
/** Default models cache path. */
export const DEFAULT_MODELS_CACHE_PATH = join(homedir(), '.commandcode', 'models-cache.json')

// ---------------------------------------------------------------------------
// Static capability snapshots
// ---------------------------------------------------------------------------

/** Models with selectable reasoning effort (from command-code@1.37.0 registry). */
export const KNOWN_EFFORTS: Readonly<Record<string, readonly string[]>> = {
  'Qwen/Qwen3.8-Max': ['low', 'medium', 'xhigh'],
  'Qwen/Qwen3.8-27B': ['low', 'medium', 'xhigh'],
  'Qwen/Qwen3.8-Flash': ['low', 'medium', 'xhigh'],
  'claude-opus-4-7': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-opus-4-8': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-opus-5': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-sonnet-4-6': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-sonnet-5': ['low', 'medium', 'high', 'xhigh', 'max'],
  'deepseek/deepseek-v4-flash': ['high', 'max'],
  'deepseek/deepseek-v4-pro': ['high', 'max'],
  'google/gemini-3.5-flash': ['low', 'medium', 'high'],
  'google/gemini-3.5-flash-lite': ['low', 'medium', 'high'],
  'google/gemini-3.6-flash': ['low', 'medium', 'high'],
  'gpt-5.4': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.4-mini': ['low', 'medium', 'high'],
  'gpt-5.5': ['low', 'medium', 'high', 'xhigh'],
  'xai/grok-4.5': ['low', 'medium', 'high'],
  'xai/grok-4.6': ['low', 'medium', 'high', 'xhigh'],
  'z-ai/glm-5.3-flash': ['low', 'high', 'max'],
}

/** Vision-capable models (from command-code registry). */
export const KNOWN_IMAGE_MODELS: ReadonlySet<string> = new Set([
  'Qwen/Qwen3.6-Plus',
  'Qwen/Qwen3.7-Flash',
  'Qwen/Qwen3.8-Flash',
  'Qwen/Qwen3.8-Max',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'deepseek/deepseek-v4-flash-vision-exp',
  'google/gemini-3.5-flash',
  'google/gemini-3.6-flash',
  'gpt-5.4',
  'gpt-5.5',
])

/** Subscription plan tiers (lower index = more accessible). */
export const KNOWN_PLANS: Readonly<Record<string, string>> = {
  'Qwen/Qwen3.8-Flash': 'go',
  'Qwen/Qwen3.8-27B': 'go',
  'deepseek/deepseek-v4-flash': 'go',
  'minimax/minimax-m3-free': 'go',
  'moonshotai/Kimi-K2.5': 'go',
}

export const PLAN_LABELS: Readonly<Record<string, string>> = {
  go: 'Go',
  pro: 'Pro',
  provider: 'Provider',
}

export const PLAN_ORDER: Readonly<Record<string, number>> = {
  go: 0,
  pro: 1,
  provider: 2,
}

/** Known subscription plans with monthly credit totals. */
export const KNOWN_SUBSCRIPTION_PLANS: Readonly<Record<string, { name: string; monthlyCredits: number }>> = {
  'individual-free': { name: 'Free', monthlyCredits: 0 },
  'individual-go': { name: 'Go', monthlyCredits: 5 },
  'individual-pro': { name: 'Pro', monthlyCredits: 50 },
  'individual-pro-annual': { name: 'Pro (Annual)', monthlyCredits: 50 },
}

/** Billing access TTL (5 minutes). */
export const BILLING_ACCESS_TTL_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Connection facts resolved fresh per request. */
export interface CommandCodeConnectionOptions {
  apiBase: string
  workingDir: string
  modelsCachePath: string
  requestTimeoutMs: number
  streamIdleTimeoutMs: number
  filterModelsByPlan?: boolean
}

/** Resolve the durable attachment service, or undefined. */
export type ResolveAttachments = () => AttachmentStore | undefined

/** Everything the adapter needs. */
export interface CommandCodeAdapterDeps<C extends CommandCodeConnectionOptions = CommandCodeConnectionOptions> {
  options: () => C
  resolveApiKey: (connection: C) => Promise<string>
  rotateApiKey?: (rejectedKey: string, rejection: 'rate-limit' | 'invalid-credential', connection: C) => Promise<string | undefined>
  fetchImpl?: typeof fetch
  resolveAttachments?: ResolveAttachments
}

/** Account identity from /alpha/whoami. */
export interface CommandCodeAccount {
  id: string
  name: string
  userName: string
}

/** Usage summary from /alpha/usage/summary. */
export interface CommandCodeUsage {
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

/** Credit/limit state from /alpha/billing/credits. */
export interface CommandCodeCredits {
  monthlyCredits: number
  purchasedCredits: number
  freeCredits: number
  fiveHour: { used: number; cap: number; exceeded: boolean; resetAt: number }
  weekly: { used: number; cap: number; exceeded: boolean; resetAt: number }
}

/** Subscription plan state. */
export interface CommandCodePlan {
  planId: string
  name: string
  status: string
  monthlyCredits: number | null
  currentPeriodEnd: number
}

/** Why every usage endpoint failed at once. */
export type UsageBlockReason = 'invalid-key' | 'service-unavailable' | 'network'

/** Full usage report (degrades per-endpoint). */
export interface CommandCodeUsageReport {
  account?: CommandCodeAccount
  usage?: CommandCodeUsage
  credits?: CommandCodeCredits
  plan?: CommandCodePlan
  failures: string[]
  blocked?: UsageBlockReason
}

/** Billing access snapshot (for plan-based model filtering). */
export interface CommandCodeBillingAccess {
  planId?: string
  planName?: string
  onDemandCredits: number
  fetchedAt: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function blockText(block: ContentBlock): string {
  return block.type === 'text' ? block.text : ''
}

function hasImageContent(message: Message): boolean {
  return message.content.some((block) => block.type === 'image')
}

/** Extract the API key from the CLI auth file (~/.commandcode/auth.json). */
export function resolveAuthFileApiKey(): string | undefined {
  const authPath = join(homedir(), '.commandcode', 'auth.json')
  if (!existsSync(authPath)) return undefined
  try {
    const raw = readFileSync(authPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return undefined
    const direct = stringValue(parsed.key) ?? stringValue(parsed.apiKey) ?? stringValue(parsed.access_token)
    if (direct !== undefined) return direct
    if (isRecord(parsed.credentials)) {
      return stringValue(parsed.credentials.key) ?? stringValue(parsed.credentials.apiKey)
    }
    if (isRecord(parsed.commandcode)) {
      return stringValue(parsed.commandcode.key) ?? stringValue(parsed.commandcode.apiKey)
    }
    return undefined
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Plan / capability helpers
// ---------------------------------------------------------------------------

export function planLabel(modelId: string): string | undefined {
  const plan = KNOWN_PLANS[modelId]
  return plan === undefined ? undefined : PLAN_LABELS[plan]
}

export function compareByPlan(a: { id: string }, b: { id: string }): number {
  const pa = PLAN_ORDER[KNOWN_PLANS[a.id] ?? ''] ?? 99
  const pb = PLAN_ORDER[KNOWN_PLANS[b.id] ?? ''] ?? 99
  if (pa !== pb) return pa - pb
  return a.id.localeCompare(b.id)
}

export function modelVisibleInPlan(modelId: string, access: CommandCodeBillingAccess | undefined): boolean {
  if (access === undefined) return true // fail open
  const modelPlan = KNOWN_PLANS[modelId]
  if (modelPlan === undefined) return true // unmapped models always visible
  if (access.onDemandCredits > 0) return true // on-demand credits unlock everything
  const userPlanOrder = access.planId === undefined ? 99 : (PLAN_ORDER[access.planId] ?? 99)
  const modelPlanOrder = PLAN_ORDER[modelPlan] ?? 0
  return userPlanOrder >= modelPlanOrder
}

export function formatContext(contextWindow: number): string {
  if (contextWindow >= 1_000_000) return `${(contextWindow / 1_000_000).toFixed(1)}M`
  if (contextWindow >= 1_000) return `${Math.round(contextWindow / 1_000)}K`
  return String(contextWindow)
}

export function capabilityDescription(modelId: string, contextWindow?: number): string {
  const parts: string[] = []
  const plan = planLabel(modelId)
  if (plan !== undefined) parts.push(plan)
  if (KNOWN_IMAGE_MODELS.has(modelId)) parts.push('Vision')
  if (KNOWN_EFFORTS[modelId] !== undefined) parts.push('Reasoning')
  if (contextWindow !== undefined && contextWindow > 0) {
    parts.push(`${formatContext(contextWindow)} ctx`)
  }
  return parts.join(' · ')
}

export function projectSlugFromPath(pathName: string): string {
  const parts = pathName.split(/[\\/]/)
  return parts[parts.length - 1] || 'unknown'
}

// ---------------------------------------------------------------------------
// Stream event parsing
// ---------------------------------------------------------------------------

function parseStreamEventLine(line: string): unknown | undefined {
  let trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) return undefined
  if (trimmed.startsWith('data:')) trimmed = trimmed.slice(5).trim()
  if (!trimmed || trimmed === '[DONE]') return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

function mapFinishReason(reason: unknown): FinishReason {
  if (typeof reason === 'string') {
    switch (reason) {
      case 'stop':
      case 'end_turn':
        return { kind: 'stop' }
      case 'length':
        return { kind: 'max-tokens' }
      case 'tool_calls':
      case 'tool_call':
        return { kind: 'tool-calls' }
    }
  }
  return { kind: 'stop' }
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

function pairedToolCalls(messages: readonly Message[]): {
  ids: Set<string>
  names: Map<string, string>
} {
  const ids = new Set<string>()
  const names = new Map<string, string>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.content) {
      if (block.type === 'tool-call') {
        ids.add(block.id)
        names.set(block.id, block.name)
      }
    }
  }
  return { ids, names }
}

function toolResultText(block: ContentBlock): string {
  if (block.type !== 'tool-result') return ''
  if (typeof block.content === 'string') return block.content
  return JSON.stringify(block.content)
}

async function imageToCommandCode(
  ref: ImageAttachmentRef,
  readImage: (ref: ImageAttachmentRef) => Promise<Uint8Array>,
): Promise<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> {
  const data = await readImage(ref)
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: ref.mediaType,
      data: Buffer.from(data).toString('base64'),
    },
  }
}

async function messagesToCC(
  messages: readonly Message[],
  readImage?: (ref: ImageAttachmentRef) => Promise<Uint8Array>,
): Promise<unknown[]> {
  const out: unknown[] = []
  const { ids: paired, names: toolNames } = pairedToolCalls(messages)

  for (const message of messages) {
    if (message.role === 'system') continue // folded into params.system

    if (message.role === 'user' && message.source.kind !== 'tool') {
      const parts: unknown[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'image') {
          if (!readImage) {
            throw new CommandCodeError(
              CommandCodeErrorCode.UNSUPPORTED_CONTENT,
              'Image input requires the durable attachment service',
            )
          }
          parts.push(await imageToCommandCode(block.attachment, readImage))
        }
      }
      out.push({ role: 'user', content: parts })
      continue
    }

    if (message.role === 'assistant') {
      const parts: unknown[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool-call' && paired.has(block.id)) {
          parts.push({
            type: 'tool-call',
            toolCallId: block.id,
            toolName: block.name,
            input: recordOrEmpty(block.arguments),
          })
        }
      }
      if (parts.length > 0) out.push({ role: 'assistant', content: parts })
      continue
    }

    // tool-result message
    if (message.role === 'user' && message.source.kind === 'tool') {
      const block = message.content[0]
      if (!block || block.type !== 'tool-result' || !paired.has(block.toolCallId)) continue
      out.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: block.toolCallId,
          toolName: toolNames.get(block.toolCallId) || 'unknown',
          output: block.isError
            ? { type: 'error-text', value: toolResultText(block) }
            : { type: 'text', value: toolResultText(block) },
        }],
      })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class CommandCodeAdapter<C extends CommandCodeConnectionOptions = CommandCodeConnectionOptions> extends LlmAdapter {
  private readonly catalog: ModelCatalog
  private readonly fetchImpl: typeof fetch
  private readonly resolveAttachments: ResolveAttachments | undefined
  private readonly billingAccess = new Map<string, { value: CommandCodeBillingAccess | undefined; at: number }>()
  private readonly billingAccessInflight = new Map<string, Promise<CommandCodeBillingAccess | undefined>>()

  constructor(private readonly deps: CommandCodeAdapterDeps<C>) {
    super()
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.resolveAttachments = deps.resolveAttachments
    this.catalog = new ModelCatalog({
      apiBase: () => this.deps.options().apiBase,
      cachePath: () => this.deps.options().modelsCachePath,
      fetchImpl: this.fetchImpl,
    })
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Command Code' }
  }

  override providerRetryPolicy(_provider: string) {
    return buildRetryPolicy()
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const catalog = await this.catalog.list()
    const access = this.deps.options().filterModelsByPlan === false
      ? undefined
      : await this.loadBillingAccess()

    return catalog
      .filter((model) => modelVisibleInPlan(model.id, access))
      .map((model) => {
        const vision = KNOWN_IMAGE_MODELS.has(model.id)
        return {
          provider,
          id: model.id,
          name: `${model.name} (CC)`,
          description: capabilityDescription(model.id, model.contextWindow),
          inputModalities: vision ? (['text', 'image'] as const) : (['text'] as const),
        }
      })
      .sort(compareByPlan)
  }

  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const entry = await this.catalog.find(model)
    const efforts = KNOWN_EFFORTS[model]
    const vision = KNOWN_IMAGE_MODELS.has(model)
    return {
      provider,
      id: model,
      name: entry ? `${entry.name} (CC)` : model,
      description: capabilityDescription(model, entry?.contextWindow),
      inputModalities: vision ? (['text', 'image'] as const) : (['text'] as const),
      ...(entry
        ? {
            context: { contextWindow: entry.contextWindow },
            defaultMaxTokens: Math.min(entry.maxTokens, DEFAULT_GENERATE_MAX_TOKENS),
          }
        : {}),
      ...(efforts
        ? {
            reasoning: {
              efforts: efforts.map((id): LlmReasoningEffortInfo => ({ id: ReasoningEffortId(id), name: id })),
            },
          }
        : {}),
    }
  }

  /**
   * Probe one account's five-hour window (for the multi-account pool).
   */
  async probeFiveHourWindow(apiKey: string): Promise<{ exceeded: boolean; resetAt: number } | undefined> {
    try {
      const connection = this.deps.options()
      const response = await this.fetchImpl(`${connection.apiBase}/alpha/billing/credits`, {
        headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) return undefined
      const parsed = await response.json() as Record<string, unknown>
      // The endpoint nests the window under `windowLimits`; older flat shapes stay supported.
      const windowLimits = isRecord(parsed.windowLimits) ? parsed.windowLimits : parsed
      const fiveHour = isRecord(windowLimits.fiveHour) ? windowLimits.fiveHour : undefined
      if (fiveHour === undefined) return undefined
      return {
        exceeded: fiveHour.exceeded === true,
        resetAt: numberValue(fiveHour.resetAt) ?? 0,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Fetch the full usage report for one API key (4 endpoints, degraded).
   */
  async getUsage(apiKey: string): Promise<CommandCodeUsageReport> {
    const connection = this.deps.options()
    const report: CommandCodeUsageReport = { failures: [] }
    const failedStatuses: (number | undefined)[] = []
    let networkFailures = 0

    const endpoints = [
      { path: '/alpha/whoami', key: 'account' as const },
      { path: '/alpha/usage/summary', key: 'usage' as const },
      { path: '/alpha/billing/credits', key: 'credits' as const },
      { path: '/alpha/billing/subscriptions', key: 'plan' as const },
    ]

    await Promise.all(endpoints.map(async ({ path, key }) => {
      try {
        const response = await this.fetchImpl(`${connection.apiBase}${path}`, {
          headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
          failedStatuses.push(response.status)
          report.failures.push(`${path}: HTTP ${response.status}`)
          return
        }
        const body = await response.json() as Record<string, unknown>
        failedStatuses.push(undefined)
        if (key === 'account') {
          // Real shape: { success, user: { id, name, userName, email } }.
          const user = isRecord(body.user) ? body.user : body
          report.account = {
            id: stringValue(user.id) ?? '',
            name: stringValue(user.name) ?? '',
            userName: stringValue(user.userName) ?? '',
          }
        } else if (key === 'usage') {
          report.usage = {
            totalCount: numberValue(body.totalCount) ?? 0,
            totalCost: numberValue(body.totalCost) ?? 0,
            successRate: numberValue(body.successRate) ?? 0,
            completedCount: numberValue(body.completedCount) ?? 0,
            failedCount: numberValue(body.failedCount) ?? 0,
            totalTokensIn: numberValue(body.totalTokensIn) ?? 0,
            totalTokensOut: numberValue(body.totalTokensOut) ?? 0,
            totalCredits: numberValue(body.totalCredits) ?? 0,
            periodBasis: stringValue(body.periodBasis) ?? '',
          }
        } else if (key === 'credits') {
          // Real shape: { credits: { monthlyCredits, ... }, windowLimits: { fiveHour, weekly } }.
          const creditFields = isRecord(body.credits) ? body.credits : body
          const windowLimits = isRecord(body.windowLimits) ? body.windowLimits : body
          const fh = isRecord(windowLimits.fiveHour) ? windowLimits.fiveHour : isRecord(body.fiveHour) ? body.fiveHour : {}
          const wk = isRecord(windowLimits.weekly) ? windowLimits.weekly : isRecord(body.weekly) ? body.weekly : {}
          report.credits = {
            monthlyCredits: numberValue(creditFields.monthlyCredits) ?? 0,
            purchasedCredits: numberValue(creditFields.purchasedCredits) ?? 0,
            freeCredits: numberValue(creditFields.freeCredits) ?? 0,
            fiveHour: {
              used: numberValue(fh.used) ?? 0,
              cap: numberValue(fh.cap) ?? 0,
              exceeded: fh.exceeded === true,
              resetAt: numberValue(fh.resetAt) ?? 0,
            },
            weekly: {
              used: numberValue(wk.used) ?? 0,
              cap: numberValue(wk.cap) ?? 0,
              exceeded: wk.exceeded === true,
              resetAt: numberValue(wk.resetAt) ?? 0,
            },
          }
        } else if (key === 'plan') {
          // Real shape: { success, data: { planId, status, currentPeriodEnd, ... } }.
          const planSource = isRecord(body.data) ? body.data : body
          const planId = stringValue(planSource.planId) ?? stringValue(planSource.id) ?? ''
          const known = KNOWN_SUBSCRIPTION_PLANS[planId]
          // currentPeriodEnd arrives as an ISO timestamp string.
          const rawPeriodEnd = planSource.currentPeriodEnd
          report.plan = {
            planId,
            name: known?.name ?? stringValue(planSource.name) ?? planId,
            status: stringValue(planSource.status) ?? '',
            monthlyCredits: known?.monthlyCredits ?? null,
            currentPeriodEnd: numberValue(rawPeriodEnd)
              ?? (typeof rawPeriodEnd === 'string' ? Date.parse(rawPeriodEnd) || 0 : 0),
          }
        }
      } catch (error) {
        failedStatuses.push(undefined)
        networkFailures += 1
        report.failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }))

    // Classify total failure: `blocked` stays undefined when at least one
    // endpoint succeeded, so a healthy report never shows a blocked banner.
    const codes = failedStatuses.filter((s): s is number => s !== undefined)
    if (codes.length === endpoints.length && codes.every((c) => c === 401)) {
      report.blocked = 'invalid-key'
    } else if (codes.length === endpoints.length && codes.every((c) => c >= 500)) {
      report.blocked = 'service-unavailable'
    } else if (networkFailures === endpoints.length) {
      report.blocked = 'network'
    }

    return report
  }

  /** Load billing access (cached per API key, TTL-gated). */
  private async loadBillingAccess(): Promise<CommandCodeBillingAccess | undefined> {
    let apiKey: string
    try {
      apiKey = await this.deps.resolveApiKey(this.deps.options())
    } catch {
      return undefined
    }

    const cached = this.billingAccess.get(apiKey)
    if (cached !== undefined && Date.now() - cached.at < BILLING_ACCESS_TTL_MS) {
      return cached.value
    }

    let inflight = this.billingAccessInflight.get(apiKey)
    if (inflight === undefined) {
      inflight = (async (): Promise<CommandCodeBillingAccess | undefined> => {
        try {
          const report = await this.getUsage(apiKey)
          const access: CommandCodeBillingAccess = {
            planId: report.plan?.planId,
            planName: report.plan?.name,
            onDemandCredits: report.credits?.purchasedCredits ?? 0,
            fetchedAt: Date.now(),
          }
          this.billingAccess.set(apiKey, { value: access, at: Date.now() })
          return access
        } catch {
          this.billingAccess.set(apiKey, { value: undefined, at: Date.now() })
          return undefined
        } finally {
          this.billingAccessInflight.delete(apiKey)
        }
      })()
      this.billingAccessInflight.set(apiKey, inflight)
    }
    return inflight
  }

  // -------------------------------------------------------------------------
  // Streaming generation
  // -------------------------------------------------------------------------

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.stop?.length) {
      throw new CommandCodeError(
        CommandCodeErrorCode.UNSUPPORTED_OPTION,
        'Command Code adapter does not support stop sequences',
        { model: options.model },
      )
    }

    const connection = this.deps.options()
    const hasImages = options.messages.some(hasImageContent)

    // Image input handling
    let readImage: ((ref: ImageAttachmentRef) => Promise<Uint8Array>) | undefined
    if (hasImages) {
      if (!KNOWN_IMAGE_MODELS.has(options.model)) {
        throw new CommandCodeError(
          CommandCodeErrorCode.UNSUPPORTED_CONTENT,
          `Model "${options.model}" does not support image input; use a Vision-capable model`,
          { model: options.model },
        )
      }
      const attachments = this.resolveAttachments?.()
      if (attachments === undefined) {
        throw new CommandCodeError(
          CommandCodeErrorCode.UNSUPPORTED_CONTENT,
          'Image input requires the durable attachment service',
          { model: options.model },
        )
      }
      readImage = (ref) => attachments.readImage(ref).then((stored) => stored.data)
    }

    // Resolve API key (with multi-account rotation)
    let apiKey = await this.deps.resolveApiKey(connection)
    const tried = new Set<string>()

    // Resolve model metadata
    const entry = await this.catalog.find(options.model)
    const modelMax = entry?.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
    const maxTokens = Math.min(
      options.maxTokens ?? modelMax,
      modelMax,
      DEFAULT_GENERATE_MAX_TOKENS,
    )

    // Reasoning effort
    const effort = options.reasoningEffort as string | undefined
    const supported = KNOWN_EFFORTS[options.model]
    const reasoningEffort =
      effort && effort !== 'off' && supported?.includes(effort) ? effort : undefined

    // System text (fold system messages into params.system)
    const systemText = [
      options.system ?? '',
      ...options.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content.map(blockText).filter(Boolean).join('\n')),
    ].filter(Boolean).join('\n\n')

    // Build request body
    const body = {
      config: {
        workingDir: connection.workingDir,
        date: new Date().toISOString().split('T')[0],
        environment: `${process.platform}-${process.arch}, Node.js ${process.version}, dsh-commandcode`,
        structure: [] as string[],
        isGitRepo: false,
        currentBranch: '',
        mainBranch: '',
        gitStatus: '',
        recentCommits: [] as string[],
      },
      memory: null,
      taste: null,
      skills: null,
      params: {
        model: options.model,
        messages: await messagesToCC(options.messages, readImage),
        tools: (options.tools ?? []).map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })),
        system: systemText,
        max_tokens: maxTokens,
        temperature: options.temperature ?? 0.3,
        stream: true,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      },
      threadId: randomUUID(),
    }

    // --- Connection with pre-stream rotation ---
    const rotate = this.deps.rotateApiKey
    let response: Response
    let cleanup: (() => void) | undefined

    while (true) {
      tried.add(apiKey)
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), connection.requestTimeoutMs)
        cleanup = () => clearTimeout(timeout)

        response = await this.fetchImpl(`${connection.apiBase}/alpha/generate`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            accept: 'text/event-stream',
            'x-command-code-version': COMMAND_CODE_CLI_VERSION,
            ...attributionHeaders(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        cleanup()

        if (response.ok) break

        // Pre-stream error: check if rotatable
        const status = response.status
        const errText = await response.text().catch(() => '')
        const retryAfter = response.headers.get('retry-after')
        const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined

        if ((status === 429 || status === 401) && rotate !== undefined) {
          const rejection: 'rate-limit' | 'invalid-credential' = status === 429 ? 'rate-limit' : 'invalid-credential'
          const next = await rotate(apiKey, rejection, connection)
          if (next !== undefined && !tried.has(next)) {
            apiKey = next
            continue
          }
        }

        throw httpError(status, errText, { model: options.model, endpoint: '/alpha/generate' }, retryAfterMs)
      } catch (error) {
        cleanup?.()
        if (error instanceof CommandCodeError) throw error
        // AbortError = timeout
        if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
          throw new CommandCodeError(
            CommandCodeErrorCode.REQUEST_TIMEOUT,
            `Request timed out after ${connection.requestTimeoutMs}ms`,
            { model: options.model, endpoint: '/alpha/generate' },
            error,
          )
        }
        throw wrapError(error, CommandCodeErrorCode.NETWORK_ERROR, {
          model: options.model,
          endpoint: '/alpha/generate',
        })
      }
    }

    if (!response.body) {
      throw new CommandCodeError(
        CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR,
        'Command Code API returned no response body',
        { model: options.model },
      )
    }

    // --- Stream parsing ---
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let streamIdleTimer: ReturnType<typeof setTimeout> | undefined

    // Block assembly state
    let textIndex = -1
    let textContent = ''
    let reasoningIndex = -1
    let reasoningContent = ''

    const resetIdleTimer = () => {
      if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer)
      streamIdleTimer = setTimeout(() => {
        reader.cancel().catch(() => undefined)
      }, connection.streamIdleTimeoutMs)
    }
    resetIdleTimer()

    const closeText = function* (): Generator<StreamChunk> {
      if (textIndex >= 0) {
        yield { type: 'block-end', index: textIndex, block: { type: 'text', text: textContent } }
        textIndex = -1
        textContent = ''
      }
    }

    const closeReasoning = function* (): Generator<StreamChunk> {
      if (reasoningIndex >= 0) {
        yield { type: 'block-end', index: reasoningIndex, block: { type: 'reasoning', text: reasoningContent } }
        reasoningIndex = -1
        reasoningContent = ''
      }
    }

    const handleEvent = (event: unknown): StreamChunk[] => {
      const chunks: StreamChunk[] = []
      if (!isRecord(event)) return chunks

      switch (event.type) {
        case 'text-delta': {
          chunks.push(...closeReasoning())
          if (textIndex < 0) {
            textIndex = 0
            chunks.push({ type: 'block-start', index: textIndex, blockType: 'text' })
          }
          const delta = stringValue(event.text) ?? ''
          textContent += delta
          chunks.push({ type: 'text-delta', index: textIndex, text: delta })
          break
        }
        case 'reasoning-start': {
          chunks.push(...closeText())
          if (reasoningIndex < 0) {
            reasoningIndex = 1
            chunks.push({ type: 'block-start', index: reasoningIndex, blockType: 'reasoning' })
          }
          break
        }
        case 'reasoning-delta': {
          if (reasoningIndex < 0) {
            reasoningIndex = 1
            chunks.push({ type: 'block-start', index: reasoningIndex, blockType: 'reasoning' })
          }
          const delta = stringValue(event.text) ?? ''
          reasoningContent += delta
          chunks.push({ type: 'reasoning-delta', index: reasoningIndex, text: delta })
          break
        }
        case 'reasoning-end': {
          chunks.push(...closeReasoning())
          break
        }
        case 'tool-call': {
          chunks.push(...closeText(), ...closeReasoning())
          const id = stringValue(event.toolCallId) ?? randomUUID()
          const name = stringValue(event.toolName) ?? ''
          const args = JSON.stringify(recordOrEmpty(event.input ?? event.args ?? event.arguments))
          const index = 2
          chunks.push(
            { type: 'block-start', index, blockType: 'tool-call' },
            { type: 'tool-call-delta', index, id: ToolCallId(id), name, argumentsDelta: args },
            { type: 'block-end', index, block: { type: 'tool-call', id: ToolCallId(id), name, arguments: args } },
          )
          break
        }
        case 'finish': {
          chunks.push(...closeText(), ...closeReasoning())
          const usage = isRecord(event.totalUsage) ? event.totalUsage : undefined
          if (usage) {
            const details = isRecord(usage.inputTokenDetails) ? usage.inputTokenDetails : undefined
            const tokenUsage: TokenUsage = {
              inputTokens: numberValue(details?.noCacheTokens) ?? numberValue(usage.inputTokens) ?? 0,
              outputTokens: numberValue(usage.outputTokens) ?? 0,
              cacheReadTokens: numberValue(details?.cacheReadTokens) ?? 0,
            }
            chunks.push({ type: 'usage', usage: tokenUsage })
          }
          chunks.push({ type: 'finish', reason: mapFinishReason(event.finishReason) })
          break
        }
        case 'error': {
          const message = stringValue(event.message) ?? 'Command Code stream error'
          throw new CommandCodeError(
            CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR,
            message,
            { model: options.model, endpoint: '/alpha/generate' },
          )
        }
      }
      return chunks
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resetIdleTimer()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const event = parseStreamEventLine(line)
          if (event === undefined) continue
          for (const chunk of handleEvent(event)) {
            yield chunk
          }
        }
      }
      // Flush remaining buffer
      if (buffer.trim()) {
        const event = parseStreamEventLine(buffer)
        if (event !== undefined) {
          for (const chunk of handleEvent(event)) {
            yield chunk
          }
        }
      }
    } catch (error) {
      if (error instanceof CommandCodeError) throw error
      if (error instanceof Error && (error.name === 'AbortError')) {
        throw new CommandCodeError(
          CommandCodeErrorCode.STREAM_IDLE_TIMEOUT,
          `Stream idle for more than ${connection.streamIdleTimeoutMs}ms`,
          { model: options.model },
          error,
        )
      }
      throw wrapError(error, CommandCodeErrorCode.NETWORK_ERROR, { model: options.model })
    } finally {
      if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer)
      reader.cancel().catch(() => undefined)
    }

    // If no finish event was emitted, emit a default one
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
