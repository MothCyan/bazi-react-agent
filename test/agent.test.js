import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyze, knowledge } from '../server/agent.js'

const input = { mode: 'birth', date: '1990-05-20', time: '10:00' }
const baseConfig = {
  baseUrl: 'https://example.invalid/v1',
  model: 'test-model',
  apiKey: 'test-key',
  temperature: 0.6,
  maxSteps: 5,
}

const openaiToolCall = (name, args = {}) => ({
  id: `${name}-${Math.random().toString(16).slice(2)}`,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
})

/** 依次返回脚本化的模型响应，用完后重复最后一条 */
function scriptedCompletion(responses) {
  const queue = [...responses]
  const calls = []
  const completion = async (config, messages, extra) => {
    calls.push({ config, messages: [...messages], extra })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  completion.calls = calls
  return completion
}

test('完整 ReAct 循环：调用工具后生成报告并记录轨迹', async () => {
  const completion = scriptedCompletion([
    {
      role: 'assistant',
      content: null,
      tool_calls: [openaiToolCall('calculate_bazi'), openaiToolCall('search_celebrities')],
    },
    { role: 'assistant', content: '## 命盘概览\n依据工具结果撰写。' },
  ])

  const result = await analyze(input, baseConfig, completion)

  assert.equal(result.mode, 'llm')
  assert.match(result.report, /命盘概览/)
  assert.deepEqual(
    result.chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
  assert.ok(result.trace.some((item) => item.type === 'action' && item.tool === 'calculate_bazi'))
  assert.ok(result.trace.some((item) => item.type === 'observation' && item.tool === 'search_celebrities'))
  assert.equal(result.trace.at(-1).type, 'final')
  assert.equal(completion.calls.length, 2)

  const toolMessages = completion.calls.at(-1).messages.filter((message) => message.role === 'tool')
  assert.equal(toolMessages.length, 2)
  assert.ok(toolMessages.every((message) => message.tool_call_id))
  const chartReport = JSON.parse(toolMessages[0].content)
  assert.deepEqual(
    chartReport.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
  const matchReport = JSON.parse(toolMessages[1].content)
  assert.equal(matchReport.exactCount, 0)
  assert.ok(matchReport.matches.every((match) => match.exact === false))
})

test('模型无法通过工具参数改写排盘结果', async () => {
  const completion = scriptedCompletion([
    {
      tool_calls: [
        openaiToolCall('calculate_bazi', {
          date: '2000-01-01',
          time: '00:00',
          pillars: ['甲子', '甲子', '甲子', '甲子'],
        }),
      ],
    },
    { tool_calls: [openaiToolCall('search_celebrities')] },
    { content: '报告内容' },
  ])

  const result = await analyze(input, baseConfig, completion)
  assert.deepEqual(
    result.chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
  // 工具观察结果来自服务端实际排盘，模型伪造的日期与四柱不会生效
  const observation = completion.calls.at(-1).messages.find((message) => message.role === 'tool')
  const reported = JSON.parse(observation.content)
  assert.deepEqual(
    reported.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
  assert.equal(reported.solar, '1990-05-20 10:00 · 北京时间（未校正真太阳时）')
})

test('模型跳过工具时会被要求先取事实', async () => {
  const completion = scriptedCompletion([
    { role: 'assistant', content: '我直接给出结论。' },
    { tool_calls: [openaiToolCall('calculate_bazi'), openaiToolCall('search_celebrities')] },
    { content: '补足工具后的报告' },
  ])

  const result = await analyze(input, baseConfig, completion)
  assert.equal(result.mode, 'llm')
  assert.match(result.report, /补足工具后的报告/)
  const secondCall = completion.calls[1].messages
  assert.ok(secondCall.some((message) => message.role === 'user' && message.content.includes('calculate_bazi')))
})

test('知识查询工具可返回命理边界说明', async () => {
  const completion = scriptedCompletion([
    {
      tool_calls: [
        openaiToolCall('calculate_bazi'),
        openaiToolCall('search_celebrities'),
        openaiToolCall('lookup_knowledge', { topic: '名人匹配' }),
      ],
    },
    { content: '报告' },
  ])
  await analyze(input, baseConfig, completion)
  const observations = completion.calls.at(-1).messages.filter((message) => message.role === 'tool')
  assert.ok(observations.some((message) => message.content.includes('四柱全部已知')))
})

test('未知工具被拒绝且不计入已执行工具', async () => {
  const completion = scriptedCompletion([
    { tool_calls: [openaiToolCall('drop_database', { table: 'config' })] },
    { tool_calls: [openaiToolCall('calculate_bazi'), openaiToolCall('search_celebrities')] },
    { content: '报告' },
  ])

  const result = await analyze(input, baseConfig, completion)
  assert.equal(result.mode, 'llm')
  const rejected = completion.calls[1].messages.find((message) => message.role === 'tool')
  assert.ok(rejected.content.includes('未知工具'))
})

test('超过最大轮数时回退规则报告并说明原因', async () => {
  const completion = scriptedCompletion([{ tool_calls: [openaiToolCall('calculate_bazi')] }])
  const result = await analyze(input, { ...baseConfig, maxSteps: 3 }, completion)
  assert.equal(result.mode, 'demo')
  assert.match(result.fallback.reason, /最大轮数/)
  assert.ok(result.trace.some((item) => item.tool === 'llm_fallback'))
  assert.match(result.report, /规则演示模式/)
})

test('模型返回空报告时同样回退规则报告', async () => {
  const completion = scriptedCompletion([
    { tool_calls: [openaiToolCall('calculate_bazi'), openaiToolCall('search_celebrities')] },
    { role: 'assistant', content: '   ' },
  ])
  const result = await analyze(input, baseConfig, completion)
  assert.equal(result.mode, 'demo')
  assert.match(result.fallback.reason, /未返回报告内容/)
})

test('模型接口一直不响应时受总时长上限约束并回退', async () => {
  const startedAt = Date.now()
  const result = await analyze(input, baseConfig, () => new Promise(() => {}), { deadlineMs: 300 })
  assert.ok(Date.now() - startedAt < 5000, '不应长时间挂起')
  assert.equal(result.mode, 'demo')
  assert.match(result.fallback.reason, /未响应|上限/)
  assert.ok(result.trace.some((item) => item.tool === 'llm_fallback'))
  assert.deepEqual(
    result.chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
})

test('模型接口报错时回退规则报告并保留失败原因', async () => {
  const result = await analyze(input, baseConfig, async () => {
    throw new Error('模型接口返回 HTTP 401，请检查地址、模型、密钥与 tools 支持情况')
  })
  assert.equal(result.mode, 'demo')
  assert.match(result.fallback.reason, /HTTP 401/)
  assert.match(result.report, /规则演示模式/)
  assert.equal(result.matches.length > 0, true)
})

test('未配置密钥时使用规则演示模式，不访问外部接口', async () => {
  let called = false
  const result = await analyze(input, { ...baseConfig, apiKey: '' }, async () => {
    called = true
    return { content: '不应被调用' }
  })
  assert.equal(called, false)
  assert.equal(result.mode, 'demo')
  assert.match(result.report, /规则演示模式/)
  assert.ok(result.trace.length >= 4)
  assert.ok(Object.keys(knowledge).includes('月令'))
})

test('配置了本地模型端点时即使没有密钥也走 LLM 模式', async () => {
  const completion = scriptedCompletion([
    { tool_calls: [openaiToolCall('calculate_bazi'), openaiToolCall('search_celebrities')] },
    { content: '本地模型报告' },
  ])
  const result = await analyze(
    input,
    { ...baseConfig, apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1' },
    completion,
  )
  assert.equal(result.mode, 'llm')
  assert.equal(completion.calls.length, 2)
})

test('本地模式完全不调用模型，直接生成规则报告', async () => {
  let called = false
  const result = await analyze(
    input,
    baseConfig,
    async () => {
      called = true
      return { content: '不应被调用' }
    },
    { engine: 'local' },
  )

  assert.equal(called, false)
  assert.equal(result.engine, 'local')
  assert.equal(result.mode, 'demo')
  assert.equal(result.fallback, undefined)
  assert.match(result.report, /本地规则模式/)
  assert.deepEqual(
    result.chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
  assert.ok(result.trace.some((item) => item.type === 'action' && item.tool === 'search_celebrities'))
  assert.ok(result.trace.at(-1).summary.includes('未调用模型'))
})

test('切换引擎不影响排盘与名人匹配结果', async () => {
  const local = await analyze(
    input,
    baseConfig,
    async () => {
      throw new Error('本地模式不应访问模型')
    },
    { engine: 'local' },
  )
  const completion = scriptedCompletion([
    { tool_calls: [openaiToolCall('calculate_bazi'), openaiToolCall('search_celebrities')] },
    { content: '模型报告' },
  ])
  const agent = await analyze(input, baseConfig, completion)

  assert.equal(agent.engine, 'agent')
  assert.equal(agent.mode, 'llm')
  assert.deepEqual(
    local.chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
    agent.chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
  )
  assert.deepEqual(local.matches.map((m) => m.name), agent.matches.map((m) => m.name))
  assert.deepEqual(local.chart.elements, agent.chart.elements)
})

test('Agent 模式未配置密钥时标记为无密钥回退，不访问模型', async () => {
  let called = false
  const result = await analyze(input, { ...baseConfig, apiKey: '' }, async () => {
    called = true
    return { content: '不应被调用' }
  })

  assert.equal(called, false)
  assert.equal(result.engine, 'agent')
  assert.equal(result.mode, 'demo')
  assert.equal(result.fallback.kind, 'no-key')
  assert.match(result.report, /规则演示模式/)
})
