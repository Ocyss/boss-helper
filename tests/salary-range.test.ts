import assert from 'node:assert/strict'
import test from 'node:test'

import type { FormSalaryRangeInput } from '../src/types/formData.ts'
import { matchSalaryRange, matchSalaryUnit, rangeMatch } from '../src/utils/salary.ts'

function config(): Pick<FormSalaryRangeInput, 'value' | 'advancedValue'> {
  return {
    value: [8, 13, false],
    advancedValue: {
      H: [0, 999999, false],
      D: [0, 999999, false],
      M: [0, 999999, false],
    },
  }
}

void test('识别日薪常见写法', () => {
  assert.equal(matchSalaryUnit('150-200/天')?.key, 'D')
  assert.equal(matchSalaryUnit('100-150/日')?.key, 'D')
  assert.equal(matchSalaryUnit('200元/天')?.key, 'D')
})

void test('默认配置放行日薪和未知薪资', () => {
  const conf = config()
  assert.equal(matchSalaryRange('150-200/天', conf).matched, true)
  assert.equal(matchSalaryRange('面议', conf).matched, true)
})

void test('配置日薪后按天过滤', () => {
  const conf = config()
  conf.advancedValue.D = [200, 300, true]
  assert.equal(matchSalaryRange('250元/天', conf).matched, true)
  assert.equal(matchSalaryRange('150-200/天', conf).matched, false)
})

void test('薪资范围支持宽松与严格模式', () => {
  assert.equal(rangeMatch('15-25K', [10, 20, false]), true)
  assert.equal(rangeMatch('15-25K', [10, 20, true]), false)
})
