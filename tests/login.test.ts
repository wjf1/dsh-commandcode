/**
 * 登录回调的 CORS 判定回归测试。
 *
 * 缺陷（评审 P0-1）：回调服务器对任意来源回 `Access-Control-Allow-Origin: *`，
 * 任何网页都能跨域读取回调响应（并把攻击者自己的 API key 通过简单 POST
 * 注入进去）。修法是把来源收敛到白名单：浏览器顶级导航（无 Origin）不需要
 * CORS；脚本请求（有 Origin）必须精确匹配。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LOGIN_ALLOWED_ORIGINS, resolveOriginDecision } from '../src/login.ts'

const PORT = 18700

test('a top-level navigation (no Origin) needs no CORS headers', () => {
  assert.equal(resolveOriginDecision(undefined, PORT), 'none')
  assert.equal(resolveOriginDecision('', PORT), 'none')
})

test('the bound loopback origin is echoed back', () => {
  assert.equal(resolveOriginDecision(`http://127.0.0.1:${PORT}`, PORT), `http://127.0.0.1:${PORT}`)
  assert.equal(resolveOriginDecision(`http://localhost:${PORT}`, PORT), `http://localhost:${PORT}`)
  assert.equal(resolveOriginDecision(`http://[::1]:${PORT}`, PORT), `http://[::1]:${PORT}`)
})

test('an allowlisted upstream origin is echoed back', () => {
  for (const origin of LOGIN_ALLOWED_ORIGINS) {
    assert.equal(resolveOriginDecision(origin, PORT), origin)
  }
})

test('any other origin is rejected', () => {
  // 关键回归：旧实现无条件回 '*'，这些来源全都能读走回调内容。
  assert.equal(resolveOriginDecision('https://evil.example', PORT), 'reject')
  assert.equal(resolveOriginDecision('http://127.0.0.1:9999', PORT), 'reject', '别的端口不是我们的服务')
  assert.equal(resolveOriginDecision('null', PORT), 'reject')
  assert.equal(resolveOriginDecision('http://localhost.evil.example', PORT), 'reject')
})

test('repeated Origin headers take the first value, never a wildcard', () => {
  assert.equal(resolveOriginDecision([`http://127.0.0.1:${PORT}`, 'https://evil.example'], PORT), `http://127.0.0.1:${PORT}`)
  assert.equal(resolveOriginDecision(['https://evil.example', `http://127.0.0.1:${PORT}`], PORT), 'reject')
})
