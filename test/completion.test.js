import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { completion } from '../server/config.js'

/** 启动一个假的 OpenAI 兼容端点，记录收到的请求 */
async function withFakeEndpoint(handler) {
  const received = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null })
      handler(req, res)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const config = {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    model: 'test-model',
    apiKey: 'sk-test',
    temperature: 0.3,
    maxSteps: 3,
  }
  return {
    config,
    received,
    close() {
      server.closeAllConnections?.()
      server.close()
    },
  }
}

const reply = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
}

test('completion 发出标准请求：路径、鉴权头、请求体，且不外泄内部参数', async () => {
  const fake = await withFakeEndpoint((_req, res) =>
    reply(res, 200, { choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
  )
  try {
    const message = await completion(
      fake.config,
      [{ role: 'user', content: 'hi' }],
      { tools: [], max_tokens: 8, deadlineMs: 5000 },
    )
    assert.equal(message.content, 'OK')

    const [{ url, headers, body }] = fake.received
    assert.equal(url, '/v1/chat/completions')
    assert.equal(headers.authorization, 'Bearer sk-test')
    assert.equal(headers['content-type'], 'application/json')
    assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'temperature', 'tools'])
    assert.equal(body.model, 'test-model')
    assert.equal(body.temperature, 0.3)
    assert.equal(body.deadlineMs, undefined)
  } finally {
    fake.close()
  }
})

test('接口返回非 2xx 时给出可读错误', async () => {
  const fake = await withFakeEndpoint((_req, res) => reply(res, 401, { error: 'invalid key' }))
  try {
    await assert.rejects(
      () => completion(fake.config, [{ role: 'user', content: 'hi' }]),
      /HTTP 401/,
    )
  } finally {
    fake.close()
  }
})

test('响应缺少 choices 时给出可读错误', async () => {
  const fake = await withFakeEndpoint((_req, res) => reply(res, 200, { object: 'error' }))
  try {
    await assert.rejects(() => completion(fake.config, [{ role: 'user', content: 'hi' }]), /choices\[0\]\.message/)
  } finally {
    fake.close()
  }
})

test('端点不响应时会被超时中断，不会无限等待', async () => {
  const fake = await withFakeEndpoint(() => {
    /* 故意不响应 */
  })
  try {
    const startedAt = Date.now()
    await assert.rejects(
      () => completion(fake.config, [{ role: 'user', content: 'hi' }], { deadlineMs: 400 }),
      /timeout|abort|没有响应|没有返回完整内容/i,
    )
    assert.ok(Date.now() - startedAt < 5000)
  } finally {
    fake.close()
  }
})

test('先返回响应头、迟迟不结束响应体时同样能超时中断', async () => {
  // 复现真实网关的行为：200 + 响应头秒回，body 长时间不结束
  const fake = await withFakeEndpoint((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' })
    res.write('{"choices":[{"message":{"content":"未写完')
  })
  try {
    const outcome = await Promise.race([
      completion(fake.config, [{ role: 'user', content: 'hi' }], { deadlineMs: 500 })
        .then(() => 'resolved')
        .catch((error) => `rejected:${error.message}`),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 8000)),
    ])
    assert.match(outcome, /^rejected:/)
    assert.match(outcome, /没有返回完整内容|timeout|abort/i)
  } finally {
    fake.close()
  }
})
