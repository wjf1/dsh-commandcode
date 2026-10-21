/**
 * CircuitBreaker 回归测试。
 *
 * 缺陷（评审 P0-3）：`recordFailure` 用 `failures === threshold` 判断是否
 * 开启熔断。半开状态下放行的探测请求失败后 `failures` 已经超过阈值，
 * 严格相等不再成立，`openedAt` 不会刷新 → 熔断器从此永久放行。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CircuitBreaker } from '../src/retry.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
