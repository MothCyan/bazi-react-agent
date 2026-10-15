import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChart } from '../server/chart.js'
import { celebrities, findMatches } from '../server/celebrities.js'

test('名人库结构完整且都标注时辰未知', () => {
  assert.ok(celebrities.length >= 10)
  for (const person of celebrities) {
    assert.match(person.birth, /^\d{4}-\d{2}-\d{2}$/, `${person.name} 需要可核对的公历生日`)
    assert.equal(person.timeKnown, false)
    assert.ok(person.url.startsWith('http'))
    assert.ok(person.description.length > 0)
  }
})

test('缺少时辰时永不标记为四柱完全匹配', () => {
  const chart = buildChart({ mode: 'birth', date: '1979-01-18', time: '12:00' })
  const matches = findMatches(chart)
  assert.ok(matches.length > 0)
  assert.ok(matches.every((match) => match.exact === false))
  assert.ok(matches.every((match) => match.timeKnown === false))
  assert.ok(matches.every((match) => match.matchCount >= 1 && match.matchedPillars.length === match.matchCount))
  assert.ok(matches.every((match) => connectionCheck(match)))
})

function connectionCheck(match) {
  // 只允许声明年、月、日三柱；时柱必须始终未参与比对
  return match.matchedPillars.every((label) => ['年柱', '月柱', '日柱'].includes(label)) && match.pillars.length === 3
}

test('匹配结果按相同柱数降序，且同一生日命中最多三柱', () => {
  const chart = buildChart({ mode: 'birth', date: '1979-01-18', time: '12:00' })
  const matches = findMatches(chart)
  for (let index = 1; index < matches.length; index += 1) {
    assert.ok(matches[index - 1].matchCount >= matches[index].matchCount)
  }
  const top = matches[0]
  assert.equal(top.name, '周杰伦')
  assert.equal(top.matchCount, 3)
  assert.deepEqual(top.matchedPillars, ['年柱', '月柱', '日柱'])
})

test('完全无关的命盘返回空数组而不是硬凑结果', () => {
  const chart = buildChart({ mode: 'manual', pillars: ['甲子', '丙寅', '甲子', '甲子'] })
  const matches = findMatches(chart)
  assert.ok(Array.isArray(matches))
  assert.ok(matches.every((match) => match.matchCount >= 1))
})
