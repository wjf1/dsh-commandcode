/**
 * Model catalog manager with stale-while-revalidate, on-disk cache,
 * background refresh, and a circuit breaker.
 *
 * Enhancement over the reference plugin:
 * - Stale-while-revalidate: return cached catalog immediately, refresh in
 *   the background so the picker never blocks on a slow network.
 * - Explicit cache TTL with stale-accept window.
 * - Circuit breaker: after N consecutive failures, stop hammering the
 *   endpoint and serve cache immediately.
 * - Atomic cache writes (write-temp + rename) to avoid corrupt cache files.
 * - ETag / If-Modified-Since support to reduce bandwidth when the API
 *   supports it.
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { CircuitBreaker } from './retry.ts'
import { CommandCodeError, CommandCodeErrorCode, wrapError } from './errors.ts'

/** One model entry from the Command Code Provider API. */
export interface CommandCodeModel {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
}

/** Catalog cache file format (on-disk). */
interface CatalogCache {
  models: CommandCodeModel[]
  fetchedAt: number
  etag?: string
}

/** Default cache TTL: 1 hour before a background refresh is triggered. */
export const DEFAULT_CATALOG_TTL_MS = 60 * 60 * 1000
/** Stale-accept window: serve cache up to 24h old even when refresh fails. */
export const DEFAULT_CATALOG_STALE_MS = 24 * 60 * 60 * 1000
/** Timeout for the catalog HTTP request. */
export const CATALOG_TIMEOUT_MS = 15_000
/** Circuit breaker threshold for catalog failures. */
export const CATALOG_CIRCUIT_THRESHOLD = 5
/** Catalog refresh cooldown when the breaker is open. */
export const CATALOG_CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Parse the `/provider/v1/models` response into model entries. */
export function parseCatalogResponse(value: unknown): CommandCodeModel[] {
  if (!isRecord(value) || value.object !== 'list' || !Array.isArray(value.data)) {
    throw new CommandCodeError(
      CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR,
      'Unexpected Command Code models response shape: expected { object: "list", data: [...] }',
    )
  }
  const models: CommandCodeModel[] = []
  for (const entry of value.data) {
    if (!isRecord(entry)) continue
    const id = stringValue(entry.id)
    const name = stringValue(entry.name) ?? stringValue(entry.id) ?? 'Unknown'
    const contextLength = numberValue(entry.context_length) ?? numberValue(entry.contextWindow)
    if (!id || !contextLength || contextLength <= 0) continue
    models.push({
      id,
      name,
      contextWindow: contextLength,
      maxTokens: Math.min(contextLength, 32_768),
    })
  }
  if (models.length === 0) {
    throw new CommandCodeError(
      CommandCodeErrorCode.CATALOG_UNAVAILABLE,
      'Command Code models endpoint returned an empty catalog',
    )
  }
  return models
}

/** Read the catalog cache from disk. */
async function readModelsCache(cachePath: string): Promise<CatalogCache | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, 'utf-8'))
    if (!isRecord(parsed) || !Array.isArray(parsed.models)) return undefined
    return {
      models: parsed.models as CommandCodeModel[],
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
      etag: typeof parsed.etag === 'string' ? parsed.etag : undefined,
    }
  } catch {
    return undefined
  }
}

/** Atomically write the catalog cache (write temp + rename). */
async function writeModelsCache(cachePath: string, cache: CatalogCache): Promise<void> {
  const dir = dirname(cachePath)
  await mkdir(dir, { recursive: true })
  const tmp = `${cachePath}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf-8')
  await rename(tmp, cachePath).catch(async () => {
    // rename may fail cross-device; fall back to direct write
    await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
    await rm(tmp, { force: true })
  })
}

/**
 * Model catalog manager.
 *
 * Usage:
 * ```ts
 * const catalog = new ModelCatalog({ apiBase: () => opts.apiBase, cachePath, fetchImpl })
 * const models = await catalog.list() // SWR: returns cache immediately, refreshes in background
 * ```
 */
export class ModelCatalog {
  private memory: CommandCodeModel[] = []
  private memoryFetchedAt = 0
  private memoryEtag?: string
  private readonly breaker = new CircuitBreaker(CATALOG_CIRCUIT_THRESHOLD, CATALOG_CIRCUIT_COOLDOWN_MS)
  private refreshInFlight: Promise<void> | undefined
  private readonly ttlMs: number
  private readonly staleMs: number

  constructor(
    private readonly deps: {
      /** Resolve the current API base (settings-aware). */
      apiBase: () => string
      /** Path to the on-disk cache file. */
      cachePath: () => string
      /** HTTP transport override (tests). */
      fetchImpl?: typeof fetch
      /** Cache TTL in ms (default 1h). */
      ttlMs?: number
      /** Stale-accept window in ms (default 24h). */
      staleMs?: number
    },
  ) {
    this.ttlMs = deps.ttlMs ?? DEFAULT_CATALOG_TTL_MS
    this.staleMs = deps.staleMs ?? DEFAULT_CATALOG_STALE_MS
  }

  /** Whether the in-memory catalog is fresh enough to serve. */
  private get isFresh(): boolean {
    return this.memory.length > 0 && Date.now() - this.memoryFetchedAt < this.ttlMs
  }

  /** Whether the in-memory catalog is within the stale-accept window. */
  private get isStaleAcceptable(): boolean {
    return this.memory.length > 0 && Date.now() - this.memoryFetchedAt < this.staleMs
  }

  /**
   * List models with stale-while-revalidate.
   *
   * - If the in-memory catalog is fresh, return it immediately.
   * - If stale but within the accept window, return it and trigger a
   *   background refresh (non-blocking).
   * - If no memory or too stale, try to load from disk cache; if that
   *   fails and the breaker is closed, do a blocking fetch.
   */
  async list(): Promise<CommandCodeModel[]> {
    // Fast path: fresh in-memory catalog
    if (this.isFresh) return this.memory

    // Stale-while-revalidate: serve stale, refresh in background
    if (this.isStaleAcceptable) {
      this.scheduleBackgroundRefresh()
      return this.memory
    }

    // Try disk cache
    const disk = await readModelsCache(this.deps.cachePath())
    if (disk !== undefined && disk.models.length > 0) {
      this.memory = disk.models
      this.memoryFetchedAt = disk.fetchedAt
      this.memoryEtag = disk.etag
      if (Date.now() - disk.fetchedAt < this.ttlMs) {
        return this.memory
      }
      // Stale disk cache: serve it, refresh in background
      this.scheduleBackgroundRefresh()
      return this.memory
    }

    // No cache at all: blocking fetch (breaker-gated)
    return this.refresh({ blocking: true })
  }

  /**
   * Force a refresh (bypasses cache). Used by the "Refresh models" button.
   */
  async refreshNow(): Promise<CommandCodeModel[]> {
    return this.refresh({ blocking: true, force: true })
  }

  /** Find a model by id (checks memory first, then triggers refresh). */
  async find(modelId: string): Promise<CommandCodeModel | undefined> {
    const hit = this.memory.find((m) => m.id === modelId)
    if (hit !== undefined) return hit
    await this.list()
    return this.memory.find((m) => m.id === modelId)
  }

  /** Current catalog state for diagnostics. */
  get state(): {
    count: number
    fetchedAt: number
    fresh: boolean
    circuit: 'closed' | 'open' | 'half-open'
  } {
    return {
      count: this.memory.length,
      fetchedAt: this.memoryFetchedAt,
      fresh: this.isFresh,
      circuit: this.breaker.state,
    }
  }

  /** Trigger a non-blocking background refresh (deduped). */
  private scheduleBackgroundRefresh(): void {
    if (this.refreshInFlight !== undefined) return
    this.refreshInFlight = this.refresh({ blocking: false })
      .catch(() => undefined)
      .finally(() => {
        this.refreshInFlight = undefined
      })
  }

  /**
   * Perform a catalog refresh.
   * @param blocking If true, throw on failure; if false, log and keep stale.
   * @param force If true, bypass the circuit breaker.
   */
  private async refresh(opts: { blocking: boolean; force?: boolean }): Promise<CommandCodeModel[]> {
    const fetchImpl = this.deps.fetchImpl ?? fetch
    const apiBase = this.deps.apiBase()
    const cachePath = this.deps.cachePath()

    // Circuit breaker check (non-forced refreshes only)
    if (!opts.force && this.breaker.isOpen) {
      if (this.memory.length > 0) return this.memory
      if (opts.blocking) {
        throw new CommandCodeError(
          CommandCodeErrorCode.CATALOG_UNAVAILABLE,
          `Model catalog circuit breaker is open (${this.breaker.state}); last refresh failed and no cache is available`,
          { endpoint: `${apiBase}/provider/v1/models` },
        )
      }
      return this.memory
    }

    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
      }
      // ETag conditional request when we have a cached copy
      if (this.memoryEtag && !opts.force) {
        headers['If-None-Match'] = this.memoryEtag
      }

      const response = await fetchImpl(`${apiBase}/provider/v1/models`, {
        headers,
        signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
      })

      // 304 Not Modified: cache is still fresh
      if (response.status === 304) {
        this.memoryFetchedAt = Date.now()
        this.breaker.recordSuccess()
        return this.memory
      }

      if (!response.ok) {
        throw new CommandCodeError(
          CommandCodeErrorCode.CATALOG_UNAVAILABLE,
          `Models endpoint returned ${response.status}`,
          { endpoint: `${apiBase}/provider/v1/models`, status: response.status },
        )
      }

      const etag = response.headers.get('etag') ?? undefined
      const models = parseCatalogResponse(await response.json())

      // Update memory and disk cache
      this.memory = models
      this.memoryFetchedAt = Date.now()
      this.memoryEtag = etag
      this.breaker.recordSuccess()

      await writeModelsCache(cachePath, {
        models,
        fetchedAt: this.memoryFetchedAt,
        etag,
      }).catch(() => undefined)

      return models
    } catch (error) {
      this.breaker.recordFailure()
      const wrapped = wrapError(error, CommandCodeErrorCode.CATALOG_UNAVAILABLE, {
        endpoint: `${apiBase}/provider/v1/models`,
      })
      // On failure: if we have any cached catalog, serve it (degradation)
      if (this.memory.length > 0) {
        return this.memory
      }
      // Try disk cache as last resort
      const disk = await readModelsCache(cachePath).catch(() => undefined)
      if (disk !== undefined && disk.models.length > 0) {
        this.memory = disk.models
        this.memoryFetchedAt = disk.fetchedAt
        return disk.models
      }
      if (opts.blocking) throw wrapped
      return this.memory
    }
  }
}
