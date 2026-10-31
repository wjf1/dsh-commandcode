/**
 * CircuitBreaker 回归测试。
 *
 * 缺陷（评审 P0-3）：`recordFailure` 用 `failures === threshold` 判断是否
 * 开启熔断。半开状态下放行的探测请求失败后 `failures` 已经超过阈值，
 * 严格相等不再成立，`openedAt` 不会刷新 → 熔断器从此永久放行。
 */
import assert from 'node:assert/strict'
import { describe, it, test } from 'node:test'
import type { ResolvedNormalRetryPolicy } from '@deepseek-ai/dsh-llm'

import {
  CircuitBreaker,
  DEFAULT_RETRY_CONFIG,
  NON_RETRYABLE_CODES,
  RETRYABLE_CODES,
  backoffDelay,
  buildRetryPolicy,
  sleep,
} from '../src/retry.ts'

test('opens after reaching the threshold, not before', () => {
  const breaker = new CircuitBreaker(2, 60)
  assert.equal(breaker.isOpen, false)
  breaker.recordFailure()
  assert.equal(breaker.isOpen, false, '一次失败不应熔断')
  breaker.recordFailure()
  assert.equal(breaker.isOpen, true, '达到阈值应熔断')
  assert.equal(breaker.state, 'open')
})

test('a failed half-open probe re-opens the breaker instead of disabling it', async () => {
  const breaker = new CircuitBreaker(2, 60)
  breaker.recordFailure()
  breaker.recordFailure()
  assert.equal(breaker.state, 'open')

  await sleep(80)
  // 冷却结束：放行一个探测请求。
  assert.equal(breaker.isOpen, false)
  assert.equal(breaker.state, 'half-open')

  // 探测失败必须重新计时。旧实现里 failures 已经超过阈值，
  // 严格相等判断不成立，openedAt 保持旧值 → 熔断器永久放行。
  breaker.recordFailure()
  assert.equal(breaker.isOpen, true, '半开探测失败后必须重新熔断')
  assert.equal(breaker.state, 'open')

  // 再等一个冷却期，行为应保持一致（而不是永久关闭）。
  await sleep(80)
  assert.equal(breaker.state, 'half-open')
})

test('a successful probe closes the breaker again', async () => {
  const breaker = new CircuitBreaker(1, 40)
  breaker.recordFailure()
  assert.equal(breaker.state, 'open')
  await sleep(60)
  breaker.recordSuccess()
  assert.equal(breaker.state, 'closed')
  assert.equal(breaker.isOpen, false)
})

describe('buildRetryPolicy', () => {
  it('resolves the default normal policy with the transient code set', () => {
    const policy = buildRetryPolicy() as ResolvedNormalRetryPolicy
    assert.equal(policy.mode, 'normal')
    assert.equal(policy.maxRetries, DEFAULT_RETRY_CONFIG.maxRetries)
    assert.equal(policy.initialDelayMs, DEFAULT_RETRY_CONFIG.initialDelayMs)
    assert.equal(policy.maxDelayMs, DEFAULT_RETRY_CONFIG.maxDelayMs)
    assert.equal(policy.jitterRatio, DEFAULT_RETRY_CONFIG.jitterRatio)
    assert.deepEqual(
      [...policy.retryableCodes].sort(),
      [...RETRYABLE_CODES].sort(),
      '可重试码与常量集合一致',
    )
    for (const code of NON_RETRYABLE_CODES) {
      assert.ok(!policy.retryableCodes.includes(code), `${code} 永不重试`)
    }
  })

  it('merges per-provider overrides', () => {
    const policy = buildRetryPolicy({ maxRetries: 3, initialDelayMs: 100 }) as ResolvedNormalRetryPolicy
    assert.equal(policy.mode, 'normal')
    assert.equal(policy.maxRetries, 3)
    assert.equal(policy.initialDelayMs, 100)
    assert.equal(policy.maxDelayMs, DEFAULT_RETRY_CONFIG.maxDelayMs, '未覆盖项保持默认')
  })
})

describe('retry code constants', () => {
  it('partition error codes into retryable and permanent', () => {
    const retryable = new Set<string>(RETRYABLE_CODES)
    for (const code of NON_RETRYABLE_CODES) {
      assert.ok(!retryable.has(code), `${code} 不应同时出现在两个集合里`)
    }
    assert.ok(RETRYABLE_CODES.includes('RATE_LIMIT'))
    assert.ok(RETRYABLE_CODES.includes('TIMEOUT'))
    assert.ok(NON_RETRYABLE_CODES.includes('INVALID_CREDENTIAL'))
    assert.ok(NON_RETRYABLE_CODES.includes('MISSING_CREDENTIAL'))
  })
})

describe('backoffDelay', () => {
  it('stays within [0, initialMs] on the first retry', () => {
    for (let i = 0; i < 20; i += 1) {
      const delay = backoffDelay(0, 500, 15 * 60 * 1000)
      assert.ok(delay >= 0 && delay <= 500, `delay=${delay}`)
    }
  })

  it('grows exponentially but is capped at maxMs', () => {
    const maxMs = 10_000
    for (let i = 0; i < 20; i += 1) {
      const delay = backoffDelay(40, 500, maxMs)
      assert.ok(delay >= 0 && delay <= maxMs, `delay=${delay}`)
    }
  })

  it('can exceed the initial delay on later attempts (full jitter)', () => {
    const maxMs = 100_000
    let sawAboveInitial = false
    for (let i = 0; i < 200; i += 1) {
      if (backoffDelay(4, 500, maxMs) > 500) {
        sawAboveInitial = true
        break
      }
    }
    assert.ok(sawAboveInitial, 'attempt 4 的指数延迟上界为 8s，200 次内应出现过超过 500ms 的取值')
  })
})

describe('sleep', () => {
  it('resolves after the requested delay', async () => {
    const start = Date.now()
    await sleep(30)
    assert.ok(Date.now() - start >= 25, '至少等待了请求的时长')
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(() => sleep(10, controller.signal))
  })

  it('rejects promptly when the signal aborts mid-sleep', async () => {
    const controller = new AbortController()
    const pending = sleep(5_000, controller.signal)
    setTimeout(() => controller.abort(), 20)
    const start = Date.now()
    await assert.rejects(() => pending)
    assert.ok(Date.now() - start < 1_000, 'abort 后应及时返回，而不是等满 5 秒')
  })
})
