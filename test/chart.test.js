import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChart, parseBirth } from '../server/chart.js'

test('1990-05-20 10:00 排盘结果为固定值', () => {
  const chart = buildChart({ mode: 'birth', date: '1990-05-20', time: '10:00' })
  assert.deepEqual(
    chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
  assert.equal(chart.dayMaster, '乙')
  assert.deepEqual(chart.elements, { 木: 1, 火: 3, 土: 0, 金: 4, 水: 0 })
  assert.equal(chart.pillars[3].tenGod, '七杀')
  assert.equal(chart.pillars[0].tenGod, '正官')
  assert.equal(chart.pillars[0].naYin, '路旁土')
  assert.equal(chart.pillars[2].naYin, '泉中水')
  assert.equal(chart.pillars[1].hidden, '丙·伤官 / 庚·正官 / 戊·正财')
})

test('五行计数恒为八，且干支均属六十甲子', () => {
  for (const [date, time] of [
    ['1900-01-01', '00:00'],
    ['1980-09-12', '12:00'],
    ['2003-09-03', '07:45'],
    ['2100-12-31', '22:10'],
  ]) {
    const chart = buildChart({ mode: 'birth', date, time })
    const total = Object.values(chart.elements).reduce((sum, value) => sum + value, 0)
    assert.equal(total, 8, `${date} 的五行计数应为 8`)
    assert.equal(chart.pillars.length, 4)
    assert.deepEqual(
      chart.pillars.map((pillar) => pillar.label),
      ['年柱', '月柱', '日柱', '时柱'],
    )
    assert.equal(chart.pillars[2].tenGod, '日主')
    assert.ok(chart.pillars.every((pillar) => pillar.hidden.length > 0 && pillar.naYin !== '—'))
  }
})

test('立春换年：2000-02-04 立春（20:40）前后年柱与月柱不同', () => {
  const before = buildChart({ mode: 'birth', date: '2000-02-04', time: '19:30' })
  const after = buildChart({ mode: 'birth', date: '2000-02-04', time: '23:30' })
  assert.deepEqual(
    before.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['己卯', '丁丑', '壬辰', '庚戌'],
  )
  assert.deepEqual(
    after.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚辰', '戊寅', '壬辰', '壬子'],
  )
  assert.equal(before.pillars[0].gan + before.pillars[0].zhi !== after.pillars[0].gan + after.pillars[0].zhi, true)
})

test('晚子时：日柱算当天，时柱按次日日干起', () => {
  const chart = buildChart({ mode: 'birth', date: '2000-02-04', time: '23:30' })
  const dayPillar = chart.pillars[2].gan + chart.pillars[2].zhi
  assert.equal(dayPillar, '壬辰')
  assert.equal(chart.pillars[3].gan + chart.pillars[3].zhi, '壬子')
  // 23:00 起算当天：与次日（2000-02-05）日柱不同，说明没有提前换日
  const nextDay = buildChart({ mode: 'birth', date: '2000-02-05', time: '23:30' })
  assert.notEqual(nextDay.pillars[2].gan + nextDay.pillars[2].zhi, dayPillar)
})

test('非法出生信息被拒绝', () => {
  assert.throws(() => buildChart({ mode: 'birth', date: '2100-02-30', time: '10:00' }), /出生日期或时间无效/)
  assert.throws(() => buildChart({ mode: 'birth', date: '1899-12-31', time: '10:00' }), /出生日期或时间无效/)
  assert.throws(() => buildChart({ mode: 'birth', date: '1990-05-20', time: '25:00' }), /出生日期或时间无效/)
  assert.throws(() => buildChart({ mode: 'birth', date: '1990-05-20' }), /请输入完整的出生日期与时间/)
  assert.throws(() => parseBirth('1990-5-2', '10:00'), /请输入完整的出生日期与时间/)
})

test('手动四柱通过五虎遁与五鼠遁校验', () => {
  const chart = buildChart({ mode: 'manual', pillars: ['庚午', '辛巳', '乙酉', '辛巳'] })
  assert.deepEqual(chart.pillars.map((pillar) => pillar.gan + pillar.zhi), ['庚午', '辛巳', '乙酉', '辛巳'])
  assert.equal(chart.dayMaster, '乙')
  assert.deepEqual(chart.elements, { 木: 1, 火: 3, 土: 0, 金: 4, 水: 0 })
  assert.equal(chart.solar, '未提供公历出生信息')

  // 月柱不符合五虎遁（庚年申月应为甲申）
  assert.throws(() => buildChart({ mode: 'manual', pillars: ['庚午', '丙申', '乙酉', '辛巳'] }), /五虎遁/)
  // 时柱不符合五鼠遁（乙日午时应为壬午）
  assert.throws(() => buildChart({ mode: 'manual', pillars: ['庚午', '辛巳', '乙酉', '庚午'] }), /五鼠遁/)
  // 干支不合法
  assert.throws(() => buildChart({ mode: 'manual', pillars: ['庚午', '辛巳', '乙酉', '甲丑'] }), /有效干支组合/)
})

test('子时接受早子时与晚子时两种合法组合', () => {
  // 乙酉日：子时按当日日干起为丙子（早子时）；按次日日干起为戊子（晚子时）
  const early = buildChart({ mode: 'manual', pillars: ['庚午', '辛巳', '乙酉', '丙子'] })
  const late = buildChart({ mode: 'manual', pillars: ['庚午', '辛巳', '乙酉', '戊子'] })
  assert.equal(early.pillars[3].gan + early.pillars[3].zhi, '丙子')
  assert.equal(late.pillars[3].gan + late.pillars[3].zhi, '戊子')
})
