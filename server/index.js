import express from 'express'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { buildChart } from './chart.js'
import { findMatches } from './celebrities.js'
import { getConfig,publicConfig,saveConfig,completion } from './config.js'
import { analyze } from './agent.js'
import { createTokenGuard, loadToken } from './access.js'

export const app=express()
app.disable('x-powered-by')
// 穿透后浏览器发出的 Origin 是 https://公网域名，因此两种协议都要放行；
// 额外来源（如自定义域名、局域网地址）用 BAZI_ALLOWED_ORIGINS 逗号分隔补充。
const extraOrigins=(process.env.BAZI_ALLOWED_ORIGINS || '').split(',').map(v=>v.trim()).filter(Boolean)
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff')
  if(req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control','no-store')
    const origin=req.get('origin')
    const host=req.get('host') || ''
    const allowed=new Set([`http://${host}`,`https://${host}`,'http://127.0.0.1:5173','http://localhost:5173',...extraOrigins])
    if(origin && !allowed.has(origin)) return res.status(403).json({error:'不允许跨站访问本地接口'})
    if(req.get('sec-fetch-site')==='cross-site') return res.status(403).json({error:'不允许跨站访问本地接口'})
  }
  next()
})
app.use(express.json({limit:'24kb'}))
app.get('/api/health',(_req,res)=>res.json({ok:true}))
// 健康检查保持开放，便于穿透工具探测；其余接口在启用令牌后必须鉴权
const tokenGuard=createTokenGuard()
app.use('/api',(req,res,next)=>{
  if(req.path==='/health') return next()
  return tokenGuard(req,res,next)
})
app.get('/api/config',async(_req,res)=>res.json(publicConfig(await getConfig())))
app.put('/api/config',async(req,res)=>res.json(await saveConfig(req.body)))
app.post('/api/config/test',async(_req,res)=>{
  const config=await getConfig()
  await completion(config,[{role:'user',content:'请回复 OK'}],{max_tokens:32})
  res.json({ok:true,message:'连接成功。分析时还要求模型支持 OpenAI tools。'})
})
app.post('/api/chart',(req,res)=>{const chart=buildChart(req.body);res.json({chart,matches:findMatches(chart)})})
// 并发配额：不用全局单请求锁——一个卡在模型端的分析不应该挡住所有人
const MAX_IN_FLIGHT=4
let inFlight=0
app.post('/api/analyze',async(req,res)=>{
  if(inFlight>=MAX_IN_FLIGHT) return res.status(429).json({error:'当前分析请求过多，请稍后重试'})
  inFlight+=1
  const startedAt=Date.now()
  // 引擎由请求决定：local 只用本地规则与工具，agent 才走模型 ReAct 循环
  const engine=req.body?.engine==='local' ? 'local' : 'agent'
  console.log(`[analyze] 开始 engine=${engine} mode=${req.body?.mode || 'birth'} 并发=${inFlight}`)
  try {
    const payload=await analyze(req.body,await getConfig(),completion,{engine})
    res.json(payload)
    console.log(`[analyze] 完成 engine=${payload.engine || engine} 报告=${payload.mode} 耗时=${Date.now()-startedAt}ms${payload.fallback ? ` ${payload.fallback.kind === 'no-key' ? '未配置密钥' : '回退原因'}：${payload.fallback.reason}` : ''}`)
  } finally {inFlight-=1}
})
app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}))
const dist=resolve('dist')
if(existsSync(dist)) {app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')))}
app.use((error,_req,res,_next)=>{
  const message=error.name==='ZodError' ? error.issues.map(i=>i.message).join('；') : error.name==='TimeoutError' ? '模型请求超时，请稍后重试' : error.message || '请求失败'
  res.status(400).json({error:message})
})
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const port=Number(process.env.PORT || 3001)
  const host=process.env.HOST || '127.0.0.1'
  app.listen(port,host,async()=>{
    const shown=host==='0.0.0.0'||host==='::' ? '127.0.0.1' : host
    console.log(`观命服务：http://${shown}:${port}`)
    if(await loadToken()) {
      console.log('访问令牌已启用：接口需要 ?token=…（健康检查除外），页面可正常打开')
    }
  })
}