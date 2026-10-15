import express from 'express'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { buildChart } from './chart.js'
import { findMatches } from './celebrities.js'
import { getConfig,publicConfig,saveConfig,completion } from './config.js'
import { analyze } from './agent.js'

export const app=express()
app.disable('x-powered-by')
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff')
  if(req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control','no-store')
    const origin=req.get('origin')
    const allowed=new Set([`http://${req.get('host')}`,'http://127.0.0.1:5173','http://localhost:5173'])
    if(origin && !allowed.has(origin)) return res.status(403).json({error:'不允许跨站访问本地接口'})
    if(req.get('sec-fetch-site')==='cross-site') return res.status(403).json({error:'不允许跨站访问本地接口'})
  }
  next()
})
app.use(express.json({limit:'24kb'}))
app.get('/api/health',(_req,res)=>res.json({ok:true}))
app.get('/api/config',async(_req,res)=>res.json(publicConfig(await getConfig())))
app.put('/api/config',async(req,res)=>res.json(await saveConfig(req.body)))
app.post('/api/config/test',async(_req,res)=>{
  const config=await getConfig()
  await completion(config,[{role:'user',content:'请回复 OK'}],{max_tokens:32})
  res.json({ok:true,message:'连接成功。分析时还要求模型支持 OpenAI tools。'})
})
app.post('/api/chart',(req,res)=>{const chart=buildChart(req.body);res.json({chart,matches:findMatches(chart)})})
let analyzing=false
app.post('/api/analyze',async(req,res)=>{
  if(analyzing) return res.status(429).json({error:'已有分析正在进行，请稍后重试'})
  analyzing=true
  try {res.json(await analyze(req.body,await getConfig()))} finally {analyzing=false}
})
app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}))
const dist=resolve('dist')
if(existsSync(dist)) {app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')))}
app.use((error,_req,res,_next)=>{
  const message=error.name==='ZodError' ? error.issues.map(i=>i.message).join('；') : error.name==='TimeoutError' ? '模型请求超时，请稍后重试' : error.message || '请求失败'
  res.status(400).json({error:message})
})
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  app.listen(Number(process.env.PORT || 3001),'127.0.0.1',()=>console.log(`观命服务：http://127.0.0.1:${process.env.PORT || 3001}`))
}