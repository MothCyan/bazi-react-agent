import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'

const directory = resolve(process.env.BAZI_DATA_DIR || 'data')
const file = resolve(directory,'config.json')
export const configSchema = z.object({
  baseUrl:z.string().url().refine(v => /^https?:\/\//.test(v),'接口地址必须使用 http 或 https'),
  model:z.string().trim().min(1).max(120),apiKey:z.string().max(4096).default(''),
  temperature:z.number().min(0).max(2).default(0.6),maxSteps:z.number().int().min(2).max(8).default(5),
})
const defaults = {baseUrl:process.env.LLM_BASE_URL || 'https://api.openai.com/v1',model:process.env.LLM_MODEL || 'gpt-4o-mini',apiKey:process.env.LLM_API_KEY || '',temperature:0.6,maxSteps:5}
export async function getConfig() {
  try { return configSchema.parse(JSON.parse(await readFile(file,'utf8'))) }
  catch (error) { if(error.code === 'ENOENT') return configSchema.parse(defaults); throw new Error('本地模型配置无法读取，请检查 data/config.json') }
}
export function publicConfig(config) { const {apiKey,...safe}=config; return {...safe,hasKey:!!apiKey} }
export async function saveConfig(raw) {
  const previous = await getConfig()
  const next = configSchema.parse({...raw,apiKey:raw.clearKey ? '' : raw.apiKey || previous.apiKey})
  await mkdir(directory,{recursive:true})
  await writeFile(file+'.tmp',JSON.stringify(next,null,2),{mode:0o600})
  await rename(file+'.tmp',file)
  return publicConfig(next)
}
export async function completion(config,messages,extra={}) {
  const endpoint = config.baseUrl.replace(/\/$/,'')+'/chat/completions'
  const response = await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json',...(config.apiKey ? {Authorization:`Bearer ${config.apiKey}`} : {})},body:JSON.stringify({model:config.model,temperature:config.temperature,messages,...extra})})
  if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}，请检查地址、模型、密钥与 tools 支持情况`)
  const result = await response.json()
  const message = result.choices?.[0]?.message
  if (!message) throw new Error('模型响应缺少 choices[0].message，请使用 OpenAI 兼容接口')
  return message
}