import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseCatalogResponse, ModelCatalog } from '../src/catalog.ts'
import { CommandCodeErrorCode } from '../src/errors.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cc-catalog-test-'))
  tempDirs.push(dir)
  return dir
}

function jsonResponse(body: unknown, init: { status?: number; etag?: string } = {}): Response {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'etag' ? (init.etag ?? null) : null,
    },
    json: async () => body,
  } as unknown as Response
}

const LIST_BODY = {
  object: 'list',
  data: [
    { id: 'model-a', name: 'Model A', context_length: 128000 },
    { id: 'model-b', contextWindow: 8192 },
  ],
}

/** 可编程 mock：`respond` 由用例随时替换，`calls` 记录全部请求。 */
function makeRecordingFetch(initial: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  let respond = initial
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return respond(String(url), init)
  }
  return {
    fetchImpl,
    calls,
    setRespond(next: (url: string, init?: RequestInit) => Response) {
      respond = next
    },
  }
}

function makeCatalog(overrides: {
  fetchImpl?: typeof fetch
  cachePath?: string
  ttlMs?: number
  staleMs?: number
} = {}) {
  const cachePath = overrides.cachePath ?? join(makeTempDir(), 'cache', 'models-cache.json')
  const catalog = new ModelCatalog({
    apiBase: () => 'https://api.test',
    cachePath: () => cachePath,
    fetchImpl: overrides.fetchImpl ?? (() => jsonResponse(LIST_BODY, { etag: 'v1' })),
    ttlMs: overrides.ttlMs ?? 60 * 60 * 1000,
    staleMs: overrides.staleMs ?? 24 * 60 * 60 * 1000,
  })
  return { catalog, cachePath }
}

describe('parseCatalogResponse', () => {
  it('parses list entries with both field spellings', () => {
    const models = parseCatalogResponse(LIST_BODY)
    assert.equal(models.length, 2)
    assert.deepEqual(models[0], {
      id: 'model-a',
      name: 'Model A',
      contextWindow: 128000,
      maxTokens: 32768,
    })
    assert.equal(models[1].name, 'model-b', 'name 缺省时回退到 id')
    assert.equal(models[1].contextWindow, 8192)
    assert.equal(models[1].maxTokens, 8192, 'maxTokens 不超过 contextWindow')
  })

  it('rejects a non-list shape', () => {
    assert.throws(
      () => parseCatalogResponse({ object: 'other', data: [] }),
      (error: { code?: string }) => error.code === CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR,
    )
  })

  it('rejects an empty catalog', () => {
    assert.throws(
      () => parseCatalogResponse({ object: 'list', data: [] }),
      (error: { code?: string }) => error.code === CommandCodeErrorCode.CATALOG_UNAVAILABLE,
    )
  })

  it('skips invalid entries', () => {
    const models = parseCatalogResponse({
      object: 'list',
      data: [
        null,
        'not-an-object',
        { id: '', context_length: 100 },
        { id: 'no-context' },
        { id: 'bad-window', context_length: 0 },
        { id: 'model-ok', context_length: 4096 },
      ],
    })
    assert.equal(models.length, 1)
    assert.equal(models[0].id, 'model-ok')
  })
})

describe('ModelCatalog', () => {
  it('fetches, caches to disk, and serves from memory while fresh', async () => {
    const mock = makeRecordingFetch(() => jsonResponse(LIST_BODY, { etag: 'v1' }))
    const { catalog, cachePath } = makeCatalog({ fetchImpl: mock.fetchImpl })

    const first = await catalog.list()
    assert.equal(first.length, 2)
    assert.equal(mock.calls.length, 1)
    assert.ok(existsSync(cachePath), '应把目录写入磁盘缓存')
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8')) as { models: unknown[]; etag?: string }
    assert.equal(cached.models.length, 2)
    assert.equal(cached.etag, 'v1')

    const second = await catalog.list()
    assert.equal(second.length, 2)
    assert.equal(mock.calls.length, 1, '内存新鲜期内不应再次请求')
  })

  it('serves stale memory and refreshes in the background (SWR)', async () => {
    const mock = makeRecordingFetch(() => jsonResponse(LIST_BODY))
    const { catalog } = makeCatalog({ fetchImpl: mock.fetchImpl, ttlMs: 40, staleMs: 10_000 })
    await catalog.list()
    assert.equal(mock.calls.length, 1)

    await sleep(60) // 超过 TTL，但仍在 stale-accept 窗口内
    const stale = await catalog.list()
    assert.equal(stale.length, 2, '过期但可接受的缓存应立即返回')
    assert.ok(mock.calls.length >= 2, 'list 返回时后台刷新已触发（非阻塞）')

    await sleep(30) // 等后台刷新落定
    assert.equal(catalog.state.fresh, true, '后台刷新后恢复新鲜')
  })

  it('sends If-None-Match and honors 304 Not Modified', async () => {
    const mock = makeRecordingFetch(() => jsonResponse(LIST_BODY, { etag: 'v1' }))
    const { catalog } = makeCatalog({ fetchImpl: mock.fetchImpl, ttlMs: 40, staleMs: 10_000 })
    await catalog.list()
    await sleep(60)

    mock.setRespond(() => jsonResponse(undefined, { status: 304 }))
    await catalog.list() // 触发后台条件刷新

    await sleep(30)
    assert.ok(mock.calls.length >= 2)
    const headers = mock.calls[1].init?.headers as Record<string, string>
    assert.equal(headers['If-None-Match'], 'v1', '非强制刷新应携带 If-None-Match')
    assert.equal(catalog.state.count, 2, '304 后保留旧目录')
    assert.equal(catalog.state.fresh, true, '304 视为刷新成功')
  })

  it('throws when blocking refresh fails with no cache at all', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('network down')
    }
    const { catalog } = makeCatalog({ fetchImpl })
    await assert.rejects(
      () => catalog.list(),
      (error: { code?: string }) => error.code === CommandCodeErrorCode.CATALOG_UNAVAILABLE,
    )
  })

  it('degrades to the in-memory catalog when a forced refresh fails', async () => {
    let fail = false
    const fetchImpl: typeof fetch = async () => {
      if (fail) throw new Error('network down')
      return jsonResponse(LIST_BODY)
    }
    const { catalog } = makeCatalog({ fetchImpl })
    await catalog.list()

    fail = true
    const fetchedAtBefore = catalog.state.fetchedAt
    const degraded = await catalog.refreshNow()
    assert.equal(degraded.length, 2, '刷新失败时返回内存里的旧目录')
    assert.equal(catalog.state.fetchedAt, fetchedAtBefore, '刷新失败不应更新 fetchedAt')
  })

  it('serves a fresh on-disk cache without touching the network', async () => {
    const cachePath = join(makeTempDir(), 'models-cache.json')
    writeFileSync(
      cachePath,
      JSON.stringify({ models: LIST_BODY.data, fetchedAt: Date.now(), etag: 'v0' }),
      'utf-8',
    )
    const mock = makeRecordingFetch(() => {
      throw new Error('should not be called')
    })
    const { catalog } = makeCatalog({ fetchImpl: mock.fetchImpl, cachePath })

    const models = await catalog.list()
    assert.equal(models.length, 2, '磁盘缓存命中时不应请求网络')
    assert.equal(mock.calls.length, 0)
    assert.equal(catalog.state.count, 2)
  })

  it('opens the circuit breaker after repeated failures and refuses to fetch', async () => {
    let fetchCount = 0
    const fetchImpl: typeof fetch = async () => {
      fetchCount += 1
      throw new Error('network down')
    }
    const { catalog } = makeCatalog({ fetchImpl, ttlMs: 1, staleMs: 1 })
    // CATALOG_CIRCUIT_THRESHOLD = 5：前 5 次真的发起请求并计失败。
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => catalog.list())
    }
    assert.equal(fetchCount, 5)

    // 第 6 次：熔断已打开，无缓存可服务 → 直接抛错，不再发请求。
    await assert.rejects(
      () => catalog.list(),
      (error: { message?: string }) =>
        (error.message ?? '').includes('circuit breaker is open'),
    )
    assert.equal(fetchCount, 5, '熔断打开后不应再请求网络')
    assert.equal(catalog.state.circuit, 'open')
  })

  it('lets refreshNow bypass an open breaker when forced', async () => {
    let fail = true
    const fetchImpl: typeof fetch = async () => {
      if (fail) throw new Error('network down')
      return jsonResponse(LIST_BODY)
    }
    const { catalog } = makeCatalog({ fetchImpl })
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => catalog.list())
    }
    assert.equal(catalog.state.circuit, 'open')

    fail = false
    const recovered = await catalog.refreshNow() // force: true
    assert.equal(recovered.length, 2, '强制刷新成功后恢复')
    assert.equal(catalog.state.circuit, 'closed')
  })

  it('find resolves from memory and via a blocking list', async () => {
    const mock = makeRecordingFetch(() => jsonResponse(LIST_BODY))
    const { catalog } = makeCatalog({ fetchImpl: mock.fetchImpl })

    const found = await catalog.find('model-b')
    assert.equal(found?.name, 'model-b')
    assert.equal(mock.calls.length, 1, '内存未命中时触发一次拉取')

    const again = await catalog.find('model-b')
    assert.equal(again?.id, 'model-b')
    assert.equal(mock.calls.length, 1, '命中内存后不再请求')

    const missing = await catalog.find('nope')
    assert.equal(missing, undefined)
  })

  it('exposes diagnostics via state', async () => {
    const { catalog } = makeCatalog()
    const before = catalog.state
    assert.equal(before.count, 0)
    assert.equal(before.fresh, false)
    assert.equal(before.circuit, 'closed')

    await catalog.list()
    const after = catalog.state
    assert.equal(after.count, 2)
    assert.equal(after.fresh, true)
    assert.ok(after.fetchedAt > 0)
  })
})
