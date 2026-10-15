import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

const directory = resolve(process.env.BAZI_DATA_DIR || 'data')
const file = resolve(directory, 'access.json')

/**
 * 访问令牌优先取环境变量 BAZI_ACCESS_TOKEN，其次取 data/access.json。
 * 两者都没有时返回空串，表示不启用令牌校验（仅本机使用时的默认状态）。
 */
export async function loadToken() {
  const fromEnv = (process.env.BAZI_ACCESS_TOKEN || '').trim()
  if (fromEnv) return fromEnv
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return typeof parsed.token === 'string' ? parsed.token.trim() : ''
  } catch {
    return ''
  }
}

export async function createToken() {
  const token = randomBytes(16).toString('hex')
  await mkdir(directory, { recursive: true })
  await writeFile(
    file,
    `${JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 },
  )
  return token
}

/** 令牌可来自请求头、查询参数或 Cookie（三者任一即可） */
export function tokenFromRequest(req) {
  const header = req.get('x-access-token')
  if (header) return header.trim()

  const query = req.query?.token
  if (typeof query === 'string' && query.trim()) return query.trim()

  const cookie = req.get('cookie') || ''
  const matched = cookie.match(/(?:^|;\s*)bazi_token=([^;]+)/)
  return matched ? decodeURIComponent(matched[1]).trim() : ''
}

/**
 * 令牌门卫：启用后所有 /api 接口（除健康检查）都必须携带正确令牌。
 * 校验通过时下发 Cookie，方便后续请求与页面刷新。
 */
export function createTokenGuard(getToken = loadToken) {
  return async function tokenGuard(req, res, next) {
    const expected = await getToken()
    if (!expected) return next()
    if (tokenFromRequest(req) !== expected) {
      return res.status(401).json({ error: '需要访问令牌：请在网址后加上 ?token=… 后再访问' })
    }
    res.cookie('bazi_token', expected, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 })
    next()
  }
}
