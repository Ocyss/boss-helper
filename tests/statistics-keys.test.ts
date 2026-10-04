import assert from 'node:assert/strict'
import test from 'node:test'

import { getStatisticsKeys } from '../src/utils/statisticsKeys.ts'

void test('统计存储键按账号隔离', () => {
  const keys = getStatisticsKeys('account-a')
  assert.equal(keys.today, 'local:web-geek-job-Today:account-a')
  assert.equal(keys.history, 'local:web-geek-job-Statistics:account-a')
})

void test('空账号保持基础键，兼容未初始化页面', () => {
  assert.deepEqual(getStatisticsKeys(''), {
    today: 'local:web-geek-job-Today',
    history: 'local:web-geek-job-Statistics',
  })
})
