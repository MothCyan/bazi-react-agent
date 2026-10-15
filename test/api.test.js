import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = await mkdtemp(join(tmpdir(), 'bazi-api-'))
process.env.BAZI_DATA_DIR = dataDir
delete process.env.LLM_API_KEY

const { app } = await import('../server/index.js')

let server
let origin

before(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  server.close()
})

const post = (path, body, headers = {}) =>
  fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

test('健康检查可用', async () => {
  const response = await fetch(`${origin}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test('排盘接口返回命盘与名人参照', async () => {
  const response = await post('/api/chart', { mode: 'birth', date: '1990-05-20', time: '10:00' })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(
    data.chart.pillars.map((pillar) => pillar.gan + pillar.zhi),
    ['庚午', '辛巳', '乙酉', '辛巳'],
  )
  assert.ok(Array.isArray(data.matches))
  assert.ok(data.matches.every((match) => match.exact === false))
})

test('非法输入返回 400 与可读错误', async () => {
  const response = await post('/api/chart', { mode: 'birth', date: '2100-02-30', time: '10:00' })
  assert.equal(response.status, 400)
  const data = await response.json()
  assert.match(data.error, /出生日期或时间无效/)
})

test('缺少字段的请求返回 400 而不是 500', async () => {
  const response = await post('/api/chart', { mode: 'manual', pillars: ['甲子'] })
  assert.equal(response.status, 400)
  const data = await response.json()
  assert.ok(typeof data.error === 'string' && data.error.length > 0)
})

test('未配置密钥时分析走规则演示模式', async () => {
  const response = await post('/api/analyze', { mode: 'birth', date: '1990-05-20', time: '10:00' })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.mode, 'demo')
  assert.ok(data.report.length > 100)
  assert.ok(Array.isArray(data.trace) && data.trace.length > 0)
})

test('配置接口不回传密钥，密钥落盘在数据目录', async () => {
  const initial = await (await fetch(`${origin}/api/config`)).json()
  assert.equal(initial.hasKey, false)
  assert.equal('apiKey' in initial, false)

  const saved = await fetch(`${origin}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-secret-value',
      temperature: 0.4,
      maxSteps: 4,
    }),
  })
  assert.equal(saved.status, 200)
  const savedBody = await saved.json()
  assert.equal(savedBody.hasKey, true)
  assert.equal('apiKey' in savedBody, false)
  assert.equal(savedBody.model, 'deepseek-chat')
  assert.equal(savedBody.temperature, 0.4)

  const reloaded = await (await fetch(`${origin}/api/config`)).json()
  assert.equal(reloaded.hasKey, true)
  assert.equal('apiKey' in reloaded, false)

  const onDisk = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'))
  assert.equal(onDisk.apiKey, 'sk-secret-value')

  // 留空表示保留旧密钥
  const kept = await fetch(`${origin}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '', temperature: 0.4, maxSteps: 4 }),
  })
  assert.equal((await kept.json()).hasKey, true)

  // 显式清除
  const cleared = await fetch(`${origin}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '', temperature: 0.4, maxSteps: 4, clearKey: true }),
  })
  assert.equal((await cleared.json()).hasKey, false)
})

test('非法配置被拒绝', async () => {
  const response = await fetch(`${origin}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'not-a-url', model: 'x' }),
  })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /接口地址/)
})

test('跨站请求被拒绝', async () => {
  const response = await post('/api/chart', { mode: 'birth', date: '1990-05-20', time: '10:00' }, { 'sec-fetch-site': 'cross-site' })
  assert.equal(response.status, 403)
  assert.match((await response.json()).error, /跨站/)
})

test('未知接口返回 JSON 404', async () => {
  const response = await fetch(`${origin}/api/unknown`)
  assert.equal(response.status, 404)
  assert.match((await response.json()).error, /接口不存在/)
})
