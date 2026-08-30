import { describe, it, assert } from 'node:test'
import {
  CommandCodeAccountPool,
  buildSlots,
  accountUsable,
  selectActiveAccount,
  type CommandCodeAccountSlot,
  type ResolvedAccount,
} from '../src/accounts.ts'

describe('buildSlots', () => {
  it('creates default slot from apiKeyEnv', () => {
    const slots = buildSlots({ apiKeyEnv: 'MY_KEY' }, 'COMMANDCODE_API_KEY')
    assert.equal(slots.length, 1)
    assert.equal(slots[0].id, 'default')
    assert.equal(slots[0].allowAuthFile, true)
  })

  it('uses default env when apiKeyEnv is unset', () => {
    const slots = buildSlots({}, 'COMMANDCODE_API_KEY')
    assert.equal(slots[0].ref?.name, 'COMMANDCODE_API_KEY')
  })

  it('adds extra accounts with stable ids from env var', () => {
    const slots = buildSlots({
      accounts: [
        { label: 'Work', apiKeyEnv: 'WORK_KEY' },
        { label: 'Personal', apiKey: 'sk-literal' },
      ],
    }, 'COMMANDCODE_API_KEY')
    assert.equal(slots.length, 3)
    assert.equal(slots[1].id, 'WORK_KEY')
    assert.equal(slots[1].label, 'Work')
    assert.equal(slots[2].id, 'account-3')
    assert.equal(slots[2].literal, 'sk-literal')
  })

  it('ignores accounts with no key and no env', () => {
    const slots = buildSlots({
      accounts: [{ label: 'Empty' }],
    }, 'COMMANDCODE_API_KEY')
    assert.equal(slots.length, 1)
  })
})

describe('accountUsable', () => {
  it('returns true for ok state', () => {
    assert.equal(accountUsable({ kind: 'ok' }), true)
  })
  it('returns true for cooldown that has passed', () => {
    assert.equal(accountUsable({ kind: 'cooldown', rejection: 'rate-limit', until: Date.now() - 1000 }), true)
  })
  it('returns false for active cooldown', () => {
    assert.equal(accountUsable({ kind: 'cooldown', rejection: 'rate-limit', until: Date.now() + 60000 }), false)
  })
  it('returns false for disabled', () => {
    assert.equal(accountUsable({ kind: 'disabled', rejection: 'invalid-credential' }), false)
  })
  it('returns true for undefined', () => {
    assert.equal(accountUsable(undefined), true)
  })
})

describe('selectActiveAccount', () => {
  const accounts: ResolvedAccount[] = [
    { slot: { id: 'default', label: 'Default', allowAuthFile: false }, key: 'key1', state: { kind: 'ok' } },
    { slot: { id: 'WORK', label: 'Work', allowAuthFile: false }, key: 'key2', state: { kind: 'ok' } },
  ]

  it('selects preferred account when usable', () => {
    const selected = selectActiveAccount(accounts, 'WORK')
    assert.equal(selected?.slot.id, 'WORK')
  })

  it('falls back to first usable when preferred not found', () => {
    const selected = selectActiveAccount(accounts, 'NONEXISTENT')
    assert.equal(selected?.slot.id, 'default')
  })

  it('returns undefined when no accounts', () => {
    assert.equal(selectActiveAccount([], 'default'), undefined)
  })
})

describe('CommandCodeAccountPool', () => {
  function makePool(slots: CommandCodeAccountSlot[], keys: Map<string, string>) {
    return new CommandCodeAccountPool({
      slots: () => slots,
      resolveRef: async (ref) => keys.get(ref.name),
      authFileKey: async () => undefined,
      probeWindow: async () => undefined,
      preferredId: () => undefined,
    })
  }

  it('resolves the first usable key', async () => {
    const slots = buildSlots({ apiKeyEnv: 'KEY1' }, 'COMMANDCODE_API_KEY')
    const keys = new Map([['KEY1', 'sk-key1']])
    const pool = makePool(slots, keys)
    const result = await pool.resolveKey()
    assert.equal(result?.key, 'sk-key1')
  })

  it('returns undefined when no key configured', async () => {
    const slots = buildSlots({}, 'COMMANDCODE_API_KEY')
    const pool = makePool(slots, new Map())
    const result = await pool.resolveKey()
    assert.equal(result, undefined)
  })

  it('rotates to next account after rejection', async () => {
    const slots = buildSlots({
      apiKeyEnv: 'KEY1',
      accounts: [{ apiKeyEnv: 'KEY2' }],
    }, 'COMMANDCODE_API_KEY')
    const keys = new Map([['KEY1', 'sk-key1'], ['KEY2', 'sk-key2']])
    const pool = makePool(slots, keys)

    pool.markRejected('sk-key1', 'rate-limit')
    const result = await pool.resolveKey({ exclude: 'sk-key1' })
    assert.equal(result?.key, 'sk-key2')
  })
})
