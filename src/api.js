async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
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
