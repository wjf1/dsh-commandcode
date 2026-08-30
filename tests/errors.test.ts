import { describe, it, assert } from 'node:test'
import {
  CommandCodeError,
  CommandCodeErrorCode,
  errorCodeFromStatus,
  httpError,
  wrapError,
} from '../src/errors.ts'

describe('CommandCodeError', () => {
  it('creates error with code and context', () => {
    const err = new CommandCodeError(
      CommandCodeErrorCode.MISSING_CREDENTIAL,
      'No API key',
      { model: 'test-model' },
    )
    assert.equal(err.code, CommandCodeErrorCode.MISSING_CREDENTIAL)
    assert.equal(err.message, 'No API key')
    assert.equal(err.context.model, 'test-model')
    assert.equal(err.context.provider, 'commandcode')
    assert.ok(err.context.timestamp > 0)
    assert.ok(err.hint.message.length > 0)
  })

  it('serializes to JSON without secrets', () => {
    const err = new CommandCodeError(CommandCodeErrorCode.RATE_LIMIT, 'rate limited')
    const json = err.toJSON()
    assert.equal(json.code, 'RATE_LIMIT')
    assert.ok('hint' in json)
    assert.ok('context' in json)
  })

  it('produces diagnostic string', () => {
    const err = new CommandCodeError(
      CommandCodeErrorCode.SERVER_ERROR,
      '500',
      { status: 500, model: 'gpt-4', attempts: 3 },
    )
    const diag = err.diagnostic
    assert.ok(diag.includes('SERVER_ERROR'))
    assert.ok(diag.includes('status=500'))
    assert.ok(diag.includes('model=gpt-4'))
    assert.ok(diag.includes('attempts=3'))
  })
})

describe('errorCodeFromStatus', () => {
  it('maps 401 to INVALID_CREDENTIAL', () => {
    assert.equal(errorCodeFromStatus(401), CommandCodeErrorCode.INVALID_CREDENTIAL)
  })
  it('maps 403 to MODEL_NOT_IN_PLAN', () => {
    assert.equal(errorCodeFromStatus(403), CommandCodeErrorCode.MODEL_NOT_IN_PLAN)
  })
  it('maps 404 to MODEL_NOT_FOUND', () => {
    assert.equal(errorCodeFromStatus(404), CommandCodeErrorCode.MODEL_NOT_FOUND)
  })
  it('maps 429 to RATE_LIMIT', () => {
    assert.equal(errorCodeFromStatus(429), CommandCodeErrorCode.RATE_LIMIT)
  })
  it('maps 5xx to SERVER_ERROR', () => {
    assert.equal(errorCodeFromStatus(500), CommandCodeErrorCode.SERVER_ERROR)
    assert.equal(errorCodeFromStatus(503), CommandCodeErrorCode.SERVER_ERROR)
  })
  it('maps unknown to PROVIDER_PROTOCOL_ERROR', () => {
    assert.equal(errorCodeFromStatus(418), CommandCodeErrorCode.PROVIDER_PROTOCOL_ERROR)
  })
})

describe('httpError', () => {
  it('creates error from HTTP status and body', () => {
    const err = httpError(429, 'Too many requests', { model: 'test' }, 30000, 'req-123')
    assert.equal(err.code, CommandCodeErrorCode.RATE_LIMIT)
    assert.equal(err.context.status, 429)
    assert.equal(err.context.retryAfterMs, 30000)
    assert.equal(err.context.requestId, 'req-123')
  })

  it('truncates long body', () => {
    const longBody = 'x'.repeat(1000)
    const err = httpError(500, longBody)
    assert.ok(err.message.length < 600)
  })
})

describe('wrapError', () => {
  it('returns CommandCodeError unchanged', () => {
    const original = new CommandCodeError(CommandCodeErrorCode.TIMEOUT, 'timeout')
    const wrapped = wrapError(original, CommandCodeErrorCode.NETWORK_ERROR)
    assert.equal(wrapped, original)
  })

  it('wraps plain Error', () => {
    const original = new Error('fetch failed')
    const wrapped = wrapError(original, CommandCodeErrorCode.NETWORK_ERROR)
    assert.equal(wrapped.code, CommandCodeErrorCode.NETWORK_ERROR)
    assert.equal(wrapped.message, 'fetch failed')
    assert.equal(wrapped.cause, original)
  })

  it('wraps non-Error value', () => {
    const wrapped = wrapError('string error', CommandCodeErrorCode.INTERNAL_ERROR)
    assert.equal(wrapped.message, 'string error')
  })
})
