import lunar from 'lunar-javascript'
import { z } from 'zod'

const { Solar, LunarUtil } = lunar
const STEMS = LunarUtil.GAN.slice(1) // ["甲", ... "癸"]
const BRANCHES = LunarUtil.ZHI.slice(1) // ["子", ... "亥"]
const CYCLE = LunarUtil.JIA_ZI // 60 甲子
const ELEMENT_KEYS = ['木', '火', '土', '金', '水']
const LABELS = ['年柱', '月柱', '日柱', '时柱']

export const inputSchema = z.object({
  mode: z.enum(['birth', 'manual']).default('birth'),
  name: z.string().trim().max(40).optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  pillars: z.array(z.string()).length(4).optional(),
})

/** 五鼠遁起时干：日干 → 子时天干序号 */
const ratStart = (dayStem) => ((STEMS.indexOf(dayStem) % 5) * 2) % 10

export function parseBirth(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    throw new Error('请输入完整的出生日期与时间')
  }
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day))
  const valid =
    year >= 1900 &&
    year <= 2100 &&
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59
  if (!valid) throw new Error('出生日期或时间无效（支持 1900—2100 年的公历日期）')
  return { year, month, day, hour, minute }
}

function assertManualPillars(pillars) {
  if (!Array.isArray(pillars) || pillars.some((p) => !CYCLE.includes(p))) {
    throw new Error('四柱须为有效干支组合，例如甲子、乙丑')
  }
  const yearStem = STEMS.indexOf(pillars[0][0])
  const monthOffset = (BRANCHES.indexOf(pillars[1][1]) - BRANCHES.indexOf('寅') + 12) % 12
  // 五虎遁：甲己之年丙作首
  if (STEMS.indexOf(pillars[1][0]) !== ((yearStem % 5) * 2 + 2 + monthOffset) % 10) {
    throw new Error('年柱与月柱不符合五虎遁规则，请核对干支')
  }
  const dayStem = STEMS.indexOf(pillars[2][0])
  const hourBranch = BRANCHES.indexOf(pillars[3][1])
  const own = (ratStart(pillars[2][0]) + hourBranch) % 10
  // 晚子时流派差异：四柱本身无法区分早/晚子时，次日日干起时的组合同样合法
  const next = (ratStart(STEMS[(dayStem + 1) % 10]) + hourBranch) % 10
  if (STEMS.indexOf(pillars[3][0]) !== own && !(hourBranch === 0 && STEMS.indexOf(pillars[3][0]) === next)) {
    throw new Error('日柱与时柱不符合五鼠遁规则，请核对干支')
  }
}

function shiShen(dayStem, stem) {
  return LunarUtil.SHI_SHEN[dayStem + stem] || '—'
}

export function buildChart(raw) {
  const input = inputSchema.parse(raw)
  let values
  let lunarText = '未提供公历生日，直接使用输入的四柱'
  let solarText = '未提供公历出生信息'

  if (input.mode === 'birth') {
    const { year, month, day, hour, minute } = parseBirth(input.date, input.time)
    const calendar = Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar()
    const eight = calendar.getEightChar()
    eight.setSect(2) // 晚子时日柱算当天（lunar-javascript 默认流派）
    values = [eight.getYear(), eight.getMonth(), eight.getDay(), eight.getTime()]
    lunarText = calendar.toString()
    solarText = `${input.date} ${input.time} · 北京时间（未校正真太阳时）`
  } else {
    assertManualPillars(input.pillars)
    values = [...input.pillars]
  }

  const dayStem = values[2][0]
  const elements = Object.fromEntries(ELEMENT_KEYS.map((key) => [key, 0]))
  const pillars = values.map((pillar, index) => {
    const [gan, zhi] = [pillar[0], pillar[1]]
    const element = LunarUtil.WU_XING_GAN[gan]
    const branchElement = LunarUtil.WU_XING_ZHI[zhi]
    elements[element] += 1
    elements[branchElement] += 1
    return {
      label: LABELS[index],
      gan,
      zhi,
      element,
      branchElement,
      tenGod: index === 2 ? '日主' : shiShen(dayStem, gan),
      naYin: LunarUtil.NAYIN[pillar] || '—',
      hidden: LunarUtil.ZHI_HIDE_GAN[zhi].map((stem) => `${stem}·${shiShen(dayStem, stem)}`).join(' / '),
    }
  })

  return {
    pillars,
    dayMaster: dayStem,
    lunar: lunarText,
    solar: solarText,
    elements,
    notes: [
      '四柱、纳音、藏干与十神均由 lunar-javascript 计算：立春换年、节气换月。',
      '晚子时（23:00—23:59）采用流通规则“日柱算当天、时柱按次日日干起”，因此 23 点后的四柱不满足五鼠遁，属不同流派的差异。',
      '出生时间按北京时间输入，未校正真太阳时；直接输入四柱时不会反推出生日期。',
      '五行图为八个表层干支的计数，未计入藏干、月令与旺衰，不能据此直接判定喜用神。',
    ],
  }
}
