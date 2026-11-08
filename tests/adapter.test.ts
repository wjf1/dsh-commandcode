import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'

import {
  CommandCodeAdapter,
  COMMAND_CODE_CLI_VERSION,
  resolveAuthFileApiKey,
  planLabel,
  compareByPlan,
  modelVisibleInPlan,
  formatContext,
  capabilityDescription,
  projectSlugFromPath,
  type CommandCodeConnectionOptions,
} from '../src/adapter.ts'
import { CommandCodeErrorCode } from '../src/errors.ts'

// ---------------------------------------------------------------------------
// 基础设施：临时目录、mock fetch、SSE 响应、消息构造
// ---------------------------------------------------------------------------

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cc-adapter-test-'))
  tempDirs.push(dir)
  return dir
}

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

const ev = (event: unknown): string => `data: ${JSON.stringify(event)}`

function sseResponse(
  lines: string[],
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n'))
      controller.close()
    },
  })
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => init.headers?.[name.toLowerCase()] ?? null },
    body,
    text: async () => lines.join('\n'),
  } as unknown as Response
}

function errorResponse(status: number, text: string, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    body: null,
    text: async () => text,
  } as unknown as Response
}

/** 预写磁盘模型目录缓存（每次独立文件，避免并行套件互写），让 catalog.find 不发网络请求。 */
function presetModelsCache(models: Array<{ id: string; name?: string; contextWindow: number; maxTokens?: number }>): string {
  const cachePath = join(makeTempDir(), 'models-cache.json')
  writeFileSync(
    cachePath,
    JSON.stringify({
      models: models.map((m) => ({ id: m.id, name: m.name ?? m.id, contextWindow: m.contextWindow, maxTokens: m.maxTokens ?? Math.min(m.contextWindow, 32768) })),
      fetchedAt: Date.now(),
      etag: 'preset',
    }),
    'utf-8',
  )
  return cachePath
}

const PRESET_CATALOG_MODELS = [
  { id: 'test-model', name: 'Test Model', contextWindow: 128000 },
  { id: 'gpt-5.5', name: 'GPT 5.5', contextWindow: 400000 },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', contextWindow: 200000 },
]

const ADAPTER_LIST_BODY = {
  object: 'list',
  data: [
    { id: 'z-model', name: 'Z', context_length: 100000 },
    { id: 'Qwen/Qwen3.8-Flash', name: 'Qwen Flash', context_length: 262144 },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', context_length: 200000 },
  ],
}

function connection(overrides: Partial<CommandCodeConnectionOptions> = {}): CommandCodeConnectionOptions {
  return {
    apiBase: 'https://api.test',
    workingDir: '/workspace',
    modelsCachePath: presetModelsCache(PRESET_CATALOG_MODELS),
    requestTimeoutMs: 200,
    streamIdleTimeoutMs: 500,
    ...overrides,
  }
}

function userMessage(text: string): Message {
  return {
    id: 'u1',
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  } as unknown as Message
}

function assistantToolCallMessage(callId: string, name: string): Message {
  return {
    id: 'a1',
    role: 'assistant',
    content: [{ type: 'tool-call', id: callId, name, arguments: '{"path":"a.ts"}' }],
    source: { kind: 'model', provider: 'commandcode', model: 'test-model' },
  } as unknown as Message
}

function toolResultMessage(callId: string, text: string, isError = false): Message {
  return {
    id: 't1',
    role: 'user',
    content: [{ type: 'tool-result', toolCallId: callId, content: text, isError }],
    source: { kind: 'tool', callId },
  } as unknown as Message
}

function genOptions(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'commandcode',
    model: 'test-model',
    messages: [userMessage('hi')],
    ...overrides,
  } as GenerateOptions
}

function makeAdapter(overrides: {
  fetchImpl?: typeof fetch
  rotateApiKey?: (rejectedKey: string, rejection: 'rate-limit' | 'invalid-credential', connection: CommandCodeConnectionOptions) => Promise<string | undefined>
  resolveApiKey?: () => Promise<string>
  options?: CommandCodeConnectionOptions
} = {}): CommandCodeAdapter {
  return new CommandCodeAdapter({
    options: () => overrides.options ?? connection(),
    resolveApiKey: overrides.resolveApiKey ?? (async () => 'sk-1'),
    rotateApiKey: overrides.rotateApiKey,
    fetchImpl: overrides.fetchImpl,
  })
}

async function collect(iter: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of iter) chunks.push(chunk)
  return chunks
}

// ---------------------------------------------------------------------------
// 纯函数（plan / 能力描述 / 上下文格式化）
// ---------------------------------------------------------------------------

describe('adapter pure helpers', () => {
  it('planLabel maps known go-tier models', () => {
    assert.equal(planLabel('Qwen/Qwen3.8-Flash'), 'Go')
    assert.equal(planLabel('claude-opus-5'), undefined)
  })

  it('compareByPlan sorts plan-tiered models first, then by id', () => {
    const sorted = [{ id: 'z-model' }, { id: 'Qwen/Qwen3.8-Flash' }, { id: 'claude-sonnet-5' }].sort(compareByPlan)
    assert.deepEqual(sorted.map((m) => m.id), ['Qwen/Qwen3.8-Flash', 'claude-sonnet-5', 'z-model'])
  })

  it('modelVisibleInPlan fails open', () => {
    const goModel = 'Qwen/Qwen3.8-Flash'
    assert.equal(modelVisibleInPlan(goModel, undefined), true, '无 billing access 时全部可见')
    assert.equal(modelVisibleInPlan('unmapped-model', { planId: 'go', onDemandCredits: 0, fetchedAt: 0 }), true, '未映射模型始终可见')
    assert.equal(modelVisibleInPlan(goModel, { planId: 'go', onDemandCredits: 3, fetchedAt: 0 }), true, '有按需点数时全部可见')
    assert.equal(modelVisibleInPlan(goModel, { planId: 'go', onDemandCredits: 0, fetchedAt: 0 }), true, '同层套餐可见')
    assert.equal(modelVisibleInPlan(goModel, { planId: undefined, onDemandCredits: 0, fetchedAt: 0 }), true, '未知套餐 fail open')
  })

  it('formatContext abbreviates context windows', () => {
    assert.equal(formatContext(1_000_000), '1.0M')
    assert.equal(formatContext(262_144), '262K')
    assert.equal(formatContext(999), '999')
  })

  it('capabilityDescription joins plan, vision, reasoning and context', () => {
    assert.equal(capabilityDescription('claude-sonnet-5', 200000), 'Vision · Reasoning · 200K ctx')
    assert.equal(capabilityDescription('Qwen/Qwen3.8-Flash', 262144), 'Go · Vision · Reasoning · 262K ctx')
    assert.equal(capabilityDescription('unknown-model'), '')
  })

  it('projectSlugFromPath takes the last path segment', () => {
    assert.equal(projectSlugFromPath('F:\\AI\\Zcode\\my-project'), 'my-project')
    assert.equal(projectSlugFromPath('/home/user/repo'), 'repo')
    assert.equal(projectSlugFromPath(''), 'unknown')
  })
})

// ---------------------------------------------------------------------------
// resolveAuthFileApiKey（凭证解析链的一环）
// ---------------------------------------------------------------------------

describe('resolveAuthFileApiKey', () => {
  const originalUserProfile = process.env.USERPROFILE
  const originalHome = process.env.HOME

  afterEach(() => {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalUserProfile
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
  })

  function withAuthFile(content: string | undefined): string | undefined {
    const home = makeTempDir()
    process.env.USERPROFILE = home
    process.env.HOME = home // POSIX（CI Linux）上 os.homedir() 读 HOME，两个都要指到临时目录
    if (content !== undefined) {
      mkdirSync(join(home, '.commandcode'), { recursive: true })
      writeFileSync(join(home, '.commandcode', 'auth.json'), content, 'utf-8')
    }
    return resolveAuthFileApiKey()
  }

  it('reads the direct key shapes', () => {
    assert.equal(withAuthFile(JSON.stringify({ key: 'sk-a' })), 'sk-a')
    assert.equal(withAuthFile(JSON.stringify({ apiKey: 'sk-b' })), 'sk-b')
    assert.equal(withAuthFile(JSON.stringify({ access_token: 'sk-c' })), 'sk-c')
  })

  it('reads nested credentials and commandcode shapes', () => {
    assert.equal(withAuthFile(JSON.stringify({ credentials: { key: 'sk-d' } })), 'sk-d')
    assert.equal(withAuthFile(JSON.stringify({ commandcode: { apiKey: 'sk-e' } })), 'sk-e')
  })

  it('returns undefined for missing, malformed, or empty files', () => {
    assert.equal(withAuthFile(undefined), undefined, '文件不存在')
    assert.equal(withAuthFile('not-json{'), undefined, '坏 JSON')
    assert.equal(withAuthFile(JSON.stringify({ unrelated: true })), undefined, '无已知字段')
  })
})

// ---------------------------------------------------------------------------
// listModels：目录 + 排序 + 计划过滤链路
// ---------------------------------------------------------------------------

describe('CommandCodeAdapter.listModels', () => {
  function listFetch(calls: { url: string }[]): typeof fetch {
    return async (url, init) => {
      calls.push({ url: String(url) })
      void init
      const path = new URL(String(url)).pathname
      if (path === '/provider/v1/models') return jsonResponse(ADAPTER_LIST_BODY)
      if (path === '/alpha/whoami') return jsonResponse({ success: true, user: { id: 'u1', name: 'Alice', userName: 'alice' } })
      if (path === '/alpha/usage/summary') return jsonResponse({ totalCount: 1 })
      if (path === '/alpha/billing/credits') return jsonResponse({ credits: { purchasedCredits: 0 }, windowLimits: {} })
      if (path === '/alpha/billing/subscriptions') return jsonResponse({ success: true, data: { planId: 'provider', status: 'active', currentPeriodEnd: 0 } })
      throw new Error(`unexpected path: ${path}`)
    }
  }

  it('maps catalog entries with (CC) suffix, vision modality, and plan-first ordering', async () => {
    const calls: { url: string }[] = []
    // 空缓存路径 → catalog 必须走网络拉取，fetch mock 才能介入。
    const adapter = makeAdapter({
      fetchImpl: listFetch(calls),
      options: connection({ filterModelsByPlan: false, modelsCachePath: join(makeTempDir(), 'cache', 'models.json') }),
    })

    const models = await adapter.listModels('commandcode')
    assert.deepEqual(
      models.map((m) => m.id),
      ['Qwen/Qwen3.8-Flash', 'claude-sonnet-5', 'z-model'],
      'go 层模型排最前，其余按 id 字典序',
    )
    const qwen = models[0]
    assert.equal(qwen.name, 'Qwen Flash (CC)')
    assert.equal(qwen.provider, 'commandcode')
    assert.equal(qwen.description, 'Go · Vision · Reasoning · 262K ctx')
    const sonnet = models.find((m) => m.id === 'claude-sonnet-5')
    assert.deepEqual(sonnet?.inputModalities, ['text', 'image'], '已知视觉模型应声明 image 输入')
    const plain = models.find((m) => m.id === 'z-model')
    assert.deepEqual(plain?.inputModalities, ['text'])
    assert.equal(calls.filter((c) => c.url.includes('/alpha/')).length, 0, '关闭计划过滤时不应探测用量端点')
  })

  it('probes billing access when plan filtering is enabled', async () => {
    const calls: { url: string }[] = []
    const adapter = makeAdapter({
      fetchImpl: listFetch(calls),
      options: connection({ modelsCachePath: join(makeTempDir(), 'cache', 'models.json') }),
    })

    const models = await adapter.listModels('commandcode')
    assert.equal(models.length, 3)
    assert.ok(calls.some((c) => c.url.includes('/alpha/billing/subscriptions')), '开启计划过滤时应拉取 billing access')
    assert.ok(calls.some((c) => c.url.includes('/provider/v1/models')))
  })

  it('providerInfo returns the display name', () => {
    const adapter = makeAdapter()
    assert.deepEqual(adapter.providerInfo('commandcode'), { id: 'commandcode', name: 'Command Code' })
  })
})

// ---------------------------------------------------------------------------
// resolveModel
// ---------------------------------------------------------------------------

describe('CommandCodeAdapter.resolveModel', () => {
  it('returns catalog metadata and reasoning efforts for known models', async () => {
    const adapter = makeAdapter()
    const resolved = await adapter.resolveModel('commandcode', 'gpt-5.5')
    assert.equal(resolved.name, 'GPT 5.5 (CC)')
    assert.deepEqual(resolved.inputModalities, ['text', 'image'])
    assert.equal((resolved as { context?: { contextWindow: number } }).context?.contextWindow, 400000)
    assert.equal((resolved as { defaultMaxTokens?: number }).defaultMaxTokens, 32768)
    const reasoning = (resolved as { reasoning?: { efforts: Array<{ id: string }> } }).reasoning
    assert.deepEqual(reasoning?.efforts.map((e) => e.id), ['low', 'medium', 'high', 'xhigh'])
  })

  it('falls back to the raw model id for unknown models', async () => {
    const adapter = makeAdapter()
    const resolved = await adapter.resolveModel('commandcode', 'never-heard-of')
    assert.equal(resolved.name, 'never-heard-of')
    assert.equal((resolved as { defaultMaxTokens?: number }).defaultMaxTokens, undefined)
    assert.equal((resolved as { reasoning?: unknown }).reasoning, undefined)
  })
})

// ---------------------------------------------------------------------------
// stream：SSE 解析、块组装、finish 守卫、轮换与错误路径
// ---------------------------------------------------------------------------

describe('CommandCodeAdapter.stream', () => {
  it('streams text, reasoning, tool-call, usage and finish chunks', async () => {
    let capturedBody: string | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = String(init?.body)
      return sseResponse([
        ev({ type: 'text-delta', text: 'Hello' }),
        ev({ type: 'reasoning-delta', text: 'thinking' }),
        ev({ type: 'reasoning-end' }),
        ev({ type: 'text-delta', text: ' world' }),
        ev({ type: 'tool-call', toolCallId: 'call-1', toolName: 'read_file', input: { path: 'a.ts' } }),
        ev({
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 10, outputTokens: 5, inputTokenDetails: { noCacheTokens: 7, cacheReadTokens: 3 } },
        }),
      ])
    }
    const adapter = makeAdapter({ fetchImpl })
    const chunks = await collect(adapter.stream(genOptions()))

    assert.equal(chunks[0].type, 'block-start')
    assert.equal((chunks[0] as { blockType: string }).blockType, 'text')
    const deltas = chunks.filter((c) => c.type === 'text-delta') as Array<{ index: number; text: string }>
    assert.deepEqual(deltas.map((d) => d.text), ['Hello', ' world'])
    assert.ok(deltas.every((d) => d.index === 0))

    const reasoningDeltas = chunks.filter((c) => c.type === 'reasoning-delta') as Array<{ index: number; text: string }>
    assert.equal(reasoningDeltas.length, 1)
    assert.equal(reasoningDeltas[0].text, 'thinking')

    const toolCalls = chunks.filter((c) => c.type === 'tool-call-delta') as Array<{ id: string; name: string; argumentsDelta: string }>
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].id, 'call-1')
    assert.equal(toolCalls[0].name, 'read_file')
    assert.equal(toolCalls[0].argumentsDelta, '{"path":"a.ts"}')

    const usages = chunks.filter((c) => c.type === 'usage') as Array<{ usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } }>
    assert.equal(usages.length, 1)
    assert.equal(usages[0].usage.inputTokens, 7, 'noCacheTokens 优先于 inputTokens')
    assert.equal(usages[0].usage.outputTokens, 5)
    assert.equal(usages[0].usage.cacheReadTokens, 3)

    const finishes = chunks.filter((c) => c.type === 'finish') as Array<{ reason: { kind: string } }>
    assert.equal(finishes.length, 1, '上游已发 finish 时兜底不应追加第二个')
    assert.equal(finishes[0].reason.kind, 'stop')

    const body = JSON.parse(capturedBody ?? '{}') as { params: { model: string } }
    assert.equal(body.params.model, 'test-model')
  })

  it('emits a fallback finish when the upstream stream ends without one', async () => {
    const fetchImpl: typeof fetch = async () =>
      sseResponse([ev({ type: 'text-delta', text: 'partial' })])
    const adapter = makeAdapter({ fetchImpl })
    const chunks = await collect(adapter.stream(genOptions()))
    const finishes = chunks.filter((c) => c.type === 'finish') as Array<{ reason: { kind: string } }>
    assert.equal(finishes.length, 1, '流自然结束且无 finish 事件时应补一个兜底 finish')
    assert.equal(finishes[0].reason.kind, 'stop')
  })

  it('parses a trailing line without a newline', async () => {
    const encoder = new TextEncoder()
    const fetchImpl: typeof fetch = async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ev({ type: 'text-delta', text: 'tail' }))) // 无换行
          controller.close()
        },
      })
      return { ok: true, status: 200, headers: { get: () => null }, body, text: async () => '' } as unknown as Response
    }
    const adapter = makeAdapter({ fetchImpl })
    const chunks = await collect(adapter.stream(genOptions()))
    const deltas = chunks.filter((c) => c.type === 'text-delta') as Array<{ text: string }>
    assert.deepEqual(deltas.map((d) => d.text), ['tail'], '末尾无换行的残行必须被 flush 解析')
  })

  it('ignores SSE comment, event and [DONE] lines', async () => {
    const fetchImpl: typeof fetch = async () =>
      sseResponse([
        ': keep-alive comment',
        'event: ping',
        'data: [DONE]',
        ev({ type: 'text-delta', text: 'only' }),
      ])
    const adapter = makeAdapter({ fetchImpl })
    const chunks = await collect(adapter.stream(genOptions()))
    const deltas = chunks.filter((c) => c.type === 'text-delta') as Array<{ text: string }>
    assert.deepEqual(deltas.map((d) => d.text), ['only'])
  })

  it('maps finish reasons: length, tool_calls and unknown', async () => {
    for (const [finishReason, kind] of [
      ['length', 'max-tokens'],
      ['tool_calls', 'tool-calls'],
      ['end_turn', 'stop'],
      ['mystery', 'stop'],
    ] as const) {
      const fetchImpl: typeof fetch = async () => sseResponse([ev({ type: 'finish', finishReason })])
      const adapter = makeAdapter({ fetchImpl })
      const chunks = await collect(adapter.stream(genOptions()))
      const finish = chunks.find((c) => c.type === 'finish') as { reason: { kind: string } }
      assert.equal(finish.reason.kind, kind, `finishReason=${finishReason}`)
    }
  })

  it('rejects stop sequences', async () => {
    const adapter = makeAdapter({ fetchImpl: async () => sseResponse([]) })
    await assert.rejects(
      () => collect(adapter.stream(genOptions({ stop: ['END'] }))),
      (error: { code?: string }) => error.code === CommandCodeErrorCode.UNSUPPORTED_OPTION,
    )
  })

  it('maps stream error events to PROVIDER_PROTOCOL_ERROR', async () => {
    const fetchImpl: typeof fetch = async () => sseResponse([ev({ type: 'error', message: 'boom' })])
    const adapter = makeAdapter({ fetchImpl })
    await assert.rejects(
      () => collect(adapter.stream(genOptions())),
      (error: { code?: string; message?: string }) =>
        error.code === CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR && error.message === 'boom',
    )
  })

  it('rotates to the next account on 429 and retries with the new key', async () => {
    const calls: { auth?: string }[] = []
    let n = 0
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push({ auth: (init?.headers as Record<string, string>).authorization })
      n += 1
      if (n === 1) return errorResponse(429, 'rate limited')
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({
      fetchImpl,
      rotateApiKey: async (key) => (key === 'sk-1' ? 'sk-2' : undefined),
    })
    const chunks = await collect(adapter.stream(genOptions()))
    assert.equal(calls.length, 2)
    assert.equal(calls[0].auth, 'Bearer sk-1')
    assert.equal(calls[1].auth, 'Bearer sk-2')
    assert.equal(chunks.filter((c) => c.type === 'finish').length, 1)
  })

  it('does not reuse a key that was already tried', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return errorResponse(429, 'rate limited')
    }
    const adapter = makeAdapter({ fetchImpl, rotateApiKey: async () => 'sk-1' })
    await assert.rejects(
      () => collect(adapter.stream(genOptions())),
      (error: { code?: string; context?: { status?: number } }) =>
        error.code === CommandCodeErrorCode.RATE_LIMIT && error.context?.status === 429,
    )
    assert.equal(calls, 1, '轮换给出的 key 已试过时应直接抛错，不再重试')
  })

  it('throws INVALID_CREDENTIAL on 401 without rotation', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return errorResponse(401, 'bad key')
    }
    const adapter = makeAdapter({ fetchImpl })
    await assert.rejects(
      () => collect(adapter.stream(genOptions())),
      (error: { code?: string; context?: { status?: number } }) =>
        error.code === CommandCodeErrorCode.INVALID_CREDENTIAL && error.context?.status === 401,
    )
    assert.equal(calls, 1)
  })

  it('maps fetch timeouts to REQUEST_TIMEOUT', async () => {
    const fetchImpl: typeof fetch = async () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      throw error
    }
    const adapter = makeAdapter({ fetchImpl })
    await assert.rejects(
      () => collect(adapter.stream(genOptions())),
      (error: { code?: string; message?: string }) =>
        error.code === CommandCodeErrorCode.REQUEST_TIMEOUT && (error.message ?? '').includes('timed out'),
    )
  })

  it('maps network failures to NETWORK_ERROR', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNRESET')
    }
    const adapter = makeAdapter({ fetchImpl })
    await assert.rejects(
      () => collect(adapter.stream(genOptions())),
      (error: { code?: string; cause?: unknown }) =>
        error.code === CommandCodeErrorCode.NETWORK_ERROR && (error.cause as Error)?.message === 'ECONNRESET',
    )
  })

  it('sends CLI version and authorization headers', async () => {
    let captured: Record<string, string> | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      captured = init?.headers as Record<string, string>
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({ fetchImpl })
    await collect(adapter.stream(genOptions()))
    assert.equal(captured?.authorization, 'Bearer sk-1')
    assert.equal(captured?.['x-command-code-version'], COMMAND_CODE_CLI_VERSION)
    assert.equal(captured?.accept, 'text/event-stream')
  })

  it('folds system prompts, clamps max_tokens and applies temperature', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({ fetchImpl })
    await collect(
      adapter.stream(
        genOptions({
          system: 'base prompt',
          messages: [userMessage('hi'), { id: 's1', role: 'system', content: [{ type: 'text', text: 'extra rules' }], source: { kind: 'user' } } as unknown as Message],
          maxTokens: 1000,
          temperature: 0.7,
        }),
      ),
    )
    const params = capturedBody?.params as { system: string; max_tokens: number; temperature: number }
    assert.equal(params.system, 'base prompt\n\nextra rules', 'system 消息折入 params.system')
    assert.equal(params.max_tokens, 1000)
    assert.equal(params.temperature, 0.7)
  })

  it('caps max_tokens by the catalog entry and the hard cap', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({ fetchImpl })
    await collect(adapter.stream(genOptions({ maxTokens: 999_999 })))
    const params = capturedBody?.params as { max_tokens: number }
    assert.equal(params.max_tokens, 32768, 'catalog maxTokens 与硬上限取最小')
  })

  it('sends reasoning_effort only when the model supports it', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({ fetchImpl })
    await collect(adapter.stream(genOptions({ model: 'gpt-5.5', reasoningEffort: 'xhigh' as never })))
    await collect(adapter.stream(genOptions({ model: 'gpt-5.5', reasoningEffort: 'max' as never })))
    await collect(adapter.stream(genOptions({ reasoningEffort: 'off' as never })))
    assert.equal((bodies[0].params as { reasoning_effort?: string }).reasoning_effort, 'xhigh')
    assert.equal((bodies[1].params as { reasoning_effort?: string }).reasoning_effort, undefined, '模型不支持的档位不透传')
    assert.equal((bodies[2].params as { reasoning_effort?: string }).reasoning_effort, undefined, 'off 档不透传')
  })

  it('converts tool schemas to function definitions', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({ fetchImpl })
    await collect(
      adapter.stream(
        genOptions({
          tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object' } }],
        } as Partial<GenerateOptions>),
      ),
    )
    const tools = (capturedBody?.params as { tools: Array<Record<string, unknown>> }).tools
    assert.equal(tools.length, 1)
    assert.equal(tools[0].type, 'function')
    assert.equal(tools[0].name, 'read_file')
    assert.deepEqual(tools[0].input_schema, { type: 'object' })
  })

  it('correlates tool results with prior assistant tool calls', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({ fetchImpl })
    await collect(
      adapter.stream(
        genOptions({
          messages: [
            userMessage('run the tool'),
            assistantToolCallMessage('call-1', 'read_file'),
            toolResultMessage('call-1', 'file contents'),
          ],
        }),
      ),
    )
    const messages = (capturedBody?.params as { messages: Array<{ role: string; content: Array<Record<string, unknown>> }> }).messages
    const toolMessage = messages.find((m) => m.role === 'tool')
    assert.ok(toolMessage, '配对的 tool-result 应转换为 role=tool 消息')
    const block = toolMessage.content[0]
    assert.equal(block.type, 'tool-result')
    assert.equal(block.toolCallId, 'call-1')
    assert.deepEqual((block.output as { type: string }).type, 'text', '非错误结果用 text 输出')
    // 未配对的 tool-result 应被丢弃
    await collect(
      adapter.stream(
        genOptions({
          messages: [userMessage('hi'), toolResultMessage('orphan-call', 'stray')],
        }),
      ),
    )
    const orphaned = (capturedBody?.params as { messages: Array<{ role: string }> }).messages
    assert.ok(orphaned.every((m) => m.role !== 'tool'), '没有配对 tool-call 的 tool-result 不应出现在请求里')
  })

  it('marks error tool results as error-text output', async () => {
    let capturedBody: Record<string, unknown> | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return sseResponse([ev({ type: 'finish', finishReason: 'stop' })])
    }
    const adapter = makeAdapter({ fetchImpl })
    await collect(
      adapter.stream(
        genOptions({
          messages: [
            userMessage('run'),
            assistantToolCallMessage('call-9', 'shell'),
            toolResultMessage('call-9', 'permission denied', true),
          ],
        }),
      ),
    )
    const messages = (capturedBody?.params as { messages: Array<{ role: string; content: Array<Record<string, unknown>> }> }).messages
    const block = messages.find((m) => m.role === 'tool')?.content[0]
    assert.deepEqual((block?.output as { type: string }).type, 'error-text')
  })
})

// ---------------------------------------------------------------------------
// getUsage / probeFiveHourWindow
// ---------------------------------------------------------------------------

describe('CommandCodeAdapter.getUsage', () => {
  const USAGE_ROUTES = {
    '/alpha/whoami': { success: true, user: { id: 'u1', name: 'Alice', userName: 'alice' } },
    '/alpha/usage/summary': {
      totalCount: 10, totalCost: 1.5, successRate: 99.5, completedCount: 9, failedCount: 1,
      totalTokensIn: 100, totalTokensOut: 50, totalCredits: 2, periodBasis: 'monthly',
    },
    '/alpha/billing/credits': {
      credits: { monthlyCredits: 5, purchasedCredits: 2, freeCredits: 1 },
      windowLimits: {
        fiveHour: { used: 1, cap: 5, exceeded: false, resetAt: 111 },
        weekly: { used: 2, cap: 10, exceeded: false, resetAt: 222 },
      },
    },
    '/alpha/billing/subscriptions': {
      success: true,
      data: { planId: 'individual-go', status: 'active', currentPeriodEnd: '2026-12-01T00:00:00.000Z' },
    },
  }

  function usageFetch(routes: Record<string, Response | Error>): typeof fetch {
    return async (url, init) => {
      void init
      const path = new URL(String(url)).pathname
      const route = routes[path]
      if (route === undefined) throw new Error(`unexpected path: ${path}`)
      if (route instanceof Error) throw route
      return route
    }
  }

  it('aggregates all four endpoints and parses plan timestamps', async () => {
    const fetchImpl = usageFetch({
      '/alpha/whoami': jsonResponse(USAGE_ROUTES['/alpha/whoami']),
      '/alpha/usage/summary': jsonResponse(USAGE_ROUTES['/alpha/usage/summary']),
      '/alpha/billing/credits': jsonResponse(USAGE_ROUTES['/alpha/billing/credits']),
      '/alpha/billing/subscriptions': jsonResponse(USAGE_ROUTES['/alpha/billing/subscriptions']),
    })
    const adapter = makeAdapter({ fetchImpl })
    const report = await adapter.getUsage('sk-1')

    assert.deepEqual(report.account, { id: 'u1', name: 'Alice', userName: 'alice' })
    assert.equal(report.usage?.totalCount, 10)
    assert.equal(report.usage?.successRate, 99.5)
    assert.equal(report.credits?.monthlyCredits, 5)
    assert.equal(report.credits?.purchasedCredits, 2)
    assert.equal(report.credits?.fiveHour.cap, 5)
    assert.equal(report.credits?.weekly.resetAt, 222)
    assert.equal(report.plan?.planId, 'individual-go')
    assert.equal(report.plan?.name, 'Go', '已知套餐映射展示名')
    assert.equal(report.plan?.monthlyCredits, 5)
    assert.ok((report.plan?.currentPeriodEnd ?? 0) > 1_700_000_000_000, 'ISO 时间应解析为毫秒时间戳')
    assert.deepEqual(report.failures, [])
    assert.equal(report.blocked, undefined)
  })

  it('blocks as invalid-key only when every endpoint returns 401', async () => {
    const adapter = makeAdapter({
      fetchImpl: usageFetch({
        '/alpha/whoami': errorResponse(401, 'no'),
        '/alpha/usage/summary': errorResponse(401, 'no'),
        '/alpha/billing/credits': errorResponse(401, 'no'),
        '/alpha/billing/subscriptions': errorResponse(401, 'no'),
      }),
    })
    const report = await adapter.getUsage('sk-1')
    assert.equal(report.blocked, 'invalid-key')
    assert.equal(report.failures.length, 4)
  })

  it('blocks as service-unavailable when every endpoint 5xx', async () => {
    const adapter = makeAdapter({
      fetchImpl: usageFetch({
        '/alpha/whoami': errorResponse(503, 'down'),
        '/alpha/usage/summary': errorResponse(500, 'down'),
        '/alpha/billing/credits': errorResponse(502, 'down'),
        '/alpha/billing/subscriptions': errorResponse(503, 'down'),
      }),
    })
    const report = await adapter.getUsage('sk-1')
    assert.equal(report.blocked, 'service-unavailable')
  })

  it('blocks as network when every endpoint throws', async () => {
    const down = new Error('ECONNREFUSED')
    const adapter = makeAdapter({
      fetchImpl: usageFetch({
        '/alpha/whoami': down,
        '/alpha/usage/summary': down,
        '/alpha/billing/credits': down,
        '/alpha/billing/subscriptions': down,
      }),
    })
    const report = await adapter.getUsage('sk-1')
    assert.equal(report.blocked, 'network')
    assert.equal(report.failures.length, 4)
  })

  it('keeps blocked undefined when at least one endpoint succeeds', async () => {
    const adapter = makeAdapter({
      fetchImpl: usageFetch({
        '/alpha/whoami': errorResponse(401, 'no'),
        '/alpha/usage/summary': jsonResponse(USAGE_ROUTES['/alpha/usage/summary']),
        '/alpha/billing/credits': jsonResponse(USAGE_ROUTES['/alpha/billing/credits']),
        '/alpha/billing/subscriptions': errorResponse(500, 'down'),
      }),
    })
    const report = await adapter.getUsage('sk-1')
    assert.equal(report.blocked, undefined, '只要有一个端点成功就不显示 blocked 横幅')
    assert.equal(report.usage?.totalCount, 10)
    assert.equal(report.account, undefined)
    assert.equal(report.failures.length, 2)
  })
})

describe('CommandCodeAdapter.probeFiveHourWindow', () => {
  function probeFetch(routes: Record<string, Response | Error>): typeof fetch {
    return async (url, init) => {
      void init
      const path = new URL(String(url)).pathname
      const route = routes[path]
      if (route === undefined) throw new Error(`unexpected path: ${path}`)
      if (route instanceof Error) throw route
      return route
    }
  }

  it('reads the nested windowLimits shape', async () => {
    const adapter = makeAdapter({
      fetchImpl: probeFetch({
        '/alpha/billing/credits': jsonResponse({
          credits: {},
          windowLimits: { fiveHour: { exceeded: true, resetAt: 555 } },
        }),
      }),
    })
    assert.deepEqual(await adapter.probeFiveHourWindow('sk-1'), { exceeded: true, resetAt: 555 })
  })

  it('supports the legacy flat shape', async () => {
    const adapter = makeAdapter({
      fetchImpl: probeFetch({
        '/alpha/billing/credits': jsonResponse({ fiveHour: { exceeded: false, resetAt: 777 } }),
      }),
    })
    assert.deepEqual(await adapter.probeFiveHourWindow('sk-1'), { exceeded: false, resetAt: 777 })
  })

  it('returns undefined on HTTP failure, missing window, or network error', async () => {
    const httpFail = makeAdapter({
      fetchImpl: probeFetch({ '/alpha/billing/credits': errorResponse(500, 'down') }),
    })
    const missing = makeAdapter({
      fetchImpl: probeFetch({ '/alpha/billing/credits': jsonResponse({ credits: {} }) }),
    })
    const broken = makeAdapter({
      fetchImpl: probeFetch({ '/alpha/billing/credits': new Error('ECONNRESET') }),
    })
    assert.equal(await httpFail.probeFiveHourWindow('sk-1'), undefined, 'HTTP 失败')
    assert.equal(await missing.probeFiveHourWindow('sk-1'), undefined, '响应缺 fiveHour 窗口')
    assert.equal(await broken.probeFiveHourWindow('sk-1'), undefined, '网络异常')
  })
})
