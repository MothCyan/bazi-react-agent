import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'

const dataDir = await mkdtemp(join(tmpdir(), 'bazi-access-'))
process.env.BAZI_DATA_DIR = dataDir
delete process.env.BAZI_ACCESS_TOKEN
delete process.env.LLM_API_KEY

const { app } = await import('../server/index.js')
const { createToken, loadToken } = await import('../server/access.js')

const chartBody = { mode: 'birth', date: '1990-05-20', time: '10:00' }

let server
let port

before(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  port = server.address().port
})

after(() => {
  server.close()
})

function rawRequest({ path, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body)
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
      },
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const post = (path, headers = {}) => rawRequest({ path, method: 'POST', headers, body: chartBody })

test('未启用令牌时接口保持开放', async () => {
  assert.equal(await loadToken(), '')
  const response = await post('/api/chart')
  assert.equal(response.status, 200)
})

test('启用令牌后未携带令牌一律 401', async () => {
  process.env.BAZI_ACCESS_TOKEN = 'token-alpha'
  try {
    const response = await post('/api/chart')
    assert.equal(response.status, 401)
    assert.match(JSON.parse(response.text).error, /需要访问令牌/)

    const wrong = await post('/api/chart', { 'x-access-token': 'token-beta' })
    assert.equal(wrong.status, 401)
  } finally {
    delete process.env.BAZI_ACCESS_TOKEN
  }
})

test('请求头、查询参数与 Cookie 三种方式都能通过校验', async () => {
  process.env.BAZI_ACCESS_TOKEN = 'token-alpha'
  try {
    const byHeader = await post('/api/chart', { 'x-access-token': 'token-alpha' })
    assert.equal(byHeader.status, 200)
    assert.equal(JSON.parse(byHeader.text).chart.pillars[0].gan + JSON.parse(byHeader.text).chart.pillars[0].zhi, '庚午')
    assert.match(String(byHeader.headers['set-cookie']), /bazi_token=token-alpha/)

    const byQuery = await post('/api/chart?token=token-alpha')
    assert.equal(byQuery.status, 200)

    const byCookie = await post('/api/chart', { cookie: 'foo=1; bazi_token=token-alpha' })
    assert.equal(byCookie.status, 200)
  } finally {
    delete process.env.BAZI_ACCESS_TOKEN
  }
})

test('健康检查不要求令牌，便于穿透探测', async () => {
  process.env.BAZI_ACCESS_TOKEN = 'token-alpha'
  try {
    const response = await rawRequest({ path: '/api/health' })
    assert.equal(response.status, 200)
    assert.deepEqual(JSON.parse(response.text), { ok: true })
  } finally {
    delete process.env.BAZI_ACCESS_TOKEN
  }
})

test('https 来源被放行（穿透后的同源请求），其它域名仍被拒绝', async () => {
  const host = `127.0.0.1:${port}`
  const sameSite = await post('/api/chart', { origin: `https://${host}` })
  assert.equal(sameSite.status, 200)

  const httpSite = await post('/api/chart', { origin: `http://${host}` })
  assert.equal(httpSite.status, 200)

  const other = await post('/api/chart', { origin: 'https://evil.example.com' })
  assert.equal(other.status, 403)

  const crossSite = await post('/api/chart', { 'sec-fetch-site': 'cross-site' })
  assert.equal(crossSite.status, 403)
})

test('生成的令牌落盘到数据目录，且环境变量优先', async () => {
  const token = await createToken()
  assert.match(token, /^[0-9a-f]{32}$/)
  const onDisk = JSON.parse(await readFile(join(dataDir, 'access.json'), 'utf8'))
  assert.equal(onDisk.token, token)

  assert.equal(await loadToken(), token)
  const response = await post('/api/chart', { 'x-access-token': token })
  assert.equal(response.status, 200)

  process.env.BAZI_ACCESS_TOKEN = 'token-from-env'
  try {
    assert.equal(await loadToken(), 'token-from-env')
    const blocked = await post('/api/chart', { 'x-access-token': token })
    assert.equal(blocked.status, 401)
    const ok = await post('/api/chart', { 'x-access-token': 'token-from-env' })
    assert.equal(ok.status, 200)
  } finally {
    delete process.env.BAZI_ACCESS_TOKEN
  }

  // 删除文件后回到开放状态，避免影响后续运行
  const { rm } = await import('node:fs/promises')
  await rm(join(dataDir, 'access.json'))
  assert.equal(await loadToken(), '')
  assert.equal((await post('/api/chart')).status, 200)
})

test('令牌不会出现在接口返回内容中', async () => {
  process.env.BAZI_ACCESS_TOKEN = 'token-alpha'
  try {
    const response = await post('/api/chart?token=token-alpha')
    assert.ok(!response.text.includes('token-alpha'))
    const config = await rawRequest({ path: '/api/config?token=token-alpha' })
    assert.ok(!config.text.includes('token-alpha'))
    assert.equal('apiKey' in JSON.parse(config.text), false)
  } finally {
    delete process.env.BAZI_ACCESS_TOKEN
  }
})
