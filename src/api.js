const TOKEN_KEY = 'bazi.token'

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * 从访问链接的 ?token=… 读取访问令牌（穿透/共享链接时使用），
 * 存入 sessionStorage 并把它从地址栏去掉，避免泄露在历史记录与截图里。
 */
function captureTokenFromUrl() {
  if (typeof window === 'undefined') return ''
  try {
    const params = new URLSearchParams(window.location.search)
    const token = (params.get('token') || '').trim()
    if (!token) return readStoredToken()
    window.sessionStorage.setItem(TOKEN_KEY, token)
    params.delete('token')
    const query = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    return token
  } catch {
    return ''
  }
}

let accessToken = captureTokenFromUrl()

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { 'x-access-token': accessToken } : {}),
        ...(options.headers || {}),
      },
    })
  } catch {
    throw new Error('无法连接本地服务，请确认后端已在 3001 端口运行')
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`)
  }
  if (!data) {
    throw new Error('服务返回了无法解析的内容')
  }
  return data
}

export const getConfig = () => request('/api/config')

export const saveConfig = (payload) =>
  request('/api/config', { method: 'PUT', body: JSON.stringify(payload) })

export const testConnection = () => request('/api/config/test', { method: 'POST' })

export const previewChart = (payload) =>
  request('/api/chart', { method: 'POST', body: JSON.stringify(payload) })

export const runAnalysis = (payload) =>
  request('/api/analyze', { method: 'POST', body: JSON.stringify(payload) })
