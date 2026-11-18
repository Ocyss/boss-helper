import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkVersion } from './check-version.mjs'

test('普通提交不发版，同步递增才发版', () => {
  assert.deepEqual(checkVersion(['0.5.5', '0.5.5'], ['0.5.5', '0.5.5']), {
    version: '0.5.5',
    release: false,
  })
  assert.equal(checkVersion(['0.5.6', '0.5.6'], ['0.5.5', '0.5.5']).release, true)
  assert.equal(checkVersion(['0.10.0', '0.10.0'], ['0.9.9', '0.9.9']).release, true)
})

test('拒绝不一致、只改一个版本、回退及非法版本', () => {
  for (const [current, previous] of [
    [
      ['0.5.6', '0.5.5'],
      ['0.5.5', '0.5.5'],
    ],
    [
      ['0.5.6', '0.5.6'],
      ['0.5.6', '0.5.5'],
    ],
    [
      ['0.5.4', '0.5.4'],
      ['0.5.5', '0.5.5'],
    ],
    [
      ['0.5.6-beta', '0.5.6-beta'],
      ['0.5.5', '0.5.5'],
    ],
    [['0.05.6', '0.05.6'], undefined],
    [['65536.0.0', '65536.0.0'], undefined],
  ])
    assert.throws(() => checkVersion(current, previous))
})
