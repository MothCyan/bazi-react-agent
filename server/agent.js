import { buildChart } from './chart.js'
import { findMatches } from './celebrities.js'
import { completion } from './config.js'

export const knowledge = {
  五行:'五行相生为木生火、火生土、土生金、金生水、水生木；相克为木克土、土克水、水克火、火克金、金克木。数量不等同旺衰，不能按缺什么就补什么。',
  十神:'十神是日干与其他天干的五行生克及阴阳关系，包含比肩、劫财、食神、伤官、正偏财、正官七杀、正偏印。它是一套传统符号分类，不是科学人格测量。',
  月令:'传统旺衰分析重视月令、通根、透干及组合，不可只按五行数量判喜忌。不同流派结论可能不同，应明确依据和局限。',
  名人匹配:'按对应位置比较年、月、日、时柱；四柱全部已知且相同才叫完整匹配。种子名人库均缺乏可靠出生时辰，最多提供前三柱相同或部分柱相同的参考。相同八字不能推出相同人生。',
}
const tools = [
  {type:'function',function:{name:'calculate_bazi',description:'计算用户输入的四柱、十神、纳音和表层五行分布。输入已由服务端绑定。',parameters:{type:'object',properties:{},additionalProperties:false}}},
  {type:'function',function:{name:'search_celebrities',description:'从有生日来源的本地名人库检索对应柱相同的候选，未知时辰不做完整匹配。',parameters:{type:'object',properties:{},additionalProperties:false}}},
  {type:'function',function:{name:'lookup_knowledge',description:'查询传统命理基础知识与方法局限。',parameters:{type:'object',properties:{topic:{type:'string',enum:Object.keys(knowledge)}},required:['topic'],additionalProperties:false}}},
]
function demoReport(chart,matches) {
  return `## 命盘概览\n你的日主为 **${chart.dayMaster}**，四柱为 **${chart.pillars.map(p=>p.gan+p.zhi).join(' · ')}**。\n\n## 五行与十神\n表层八字计数：${Object.entries(chart.elements).map(([k,v])=>`${k} ${v}`).join('、')}。此统计没有月令和藏干权重，不能直接判断身强身弱或喜用神。\n\n${knowledge.十神}\n\n## 名人参照\n${matches.length ? `本地数据库找到 ${matches.length} 位至少有一柱对应相同的人物。最高匹配 ${matches[0].matchCount} 柱：${matches[0].name}。` : '本地小型数据库未找到对应柱相同的人物，这不代表世界上不存在。'}所有种子人物的时辰均未核实，因此本次没有可确认的四柱完全匹配。\n\n## 阅读建议\n${knowledge.月令}\n\n当前为**无需 LLM 的规则演示模式**。配置支持工具调用的模型后，可以运行完整 ReAct 循环，结合工具结果生成分析。传统命理仅供文化学习与娱乐，不是科学预测，不应用于医疗、投资或重大人生决定。`
}
export async function analyze(input,config,requestCompletion=completion) {
  const chart = buildChart(input), matches=findMatches(chart), trace=[]
  if (!config.apiKey && !/localhost|127\.0\.0\.1|\[::1\]/.test(new URL(config.baseUrl).hostname)) {
    for(const [tool,summary] of [['calculate_bazi',chart.pillars.map(p=>p.gan+p.zhi).join(' / ')],['search_celebrities',`找到 ${matches.length} 位部分匹配人物，完整匹配 0 位`],['lookup_knowledge','已读取月令、十神与匹配边界']]) { trace.push({type:'action',tool,summary:'执行本地规则工具'},{type:'observation',tool,summary}) }
    trace.push({type:'final',summary:'规则报告已生成；配置 LLM 后启用自主工具选择'})
    return {chart,matches,trace,report:demoReport(chart,matches),mode:'demo'}
  }
  const messages=[{role:'system',content:'你是八字传统文化研究助手，运行工具驱动的 ReAct Agent。先调用 calculate_bazi 和 search_celebrities，按需调用 lookup_knowledge，再根据观察结果输出中文 Markdown 报告。不要输出隐藏推理，只输出最终报告和简短结论。不要编造四柱、名人或时辰。不把部分匹配称为相同八字。解释计数不是旺衰，不做确定性命运预测或医疗投资建议。报告包含命盘、五行十神、方法局限和名人匹配，标明文化娱乐用途。工具调用不得修改用户输入。'}, {role:'user',content:JSON.stringify(input)}]
  const seen=new Set()
  for(let step=0;step<config.maxSteps;step++) {
    const message=await requestCompletion(config,messages,{tools,tool_choice:step===config.maxSteps-1 ? 'none' : 'auto'})
    if (!message.tool_calls?.length) {
      if (!seen.has('calculate_bazi') || !seen.has('search_celebrities')) {
        messages.push({role:'assistant',content:message.content || ''},{role:'user',content:'请先调用 calculate_bazi 和 search_celebrities 获得事实后再完成报告。'})
        continue
      }
      if (!message.content?.trim()) throw new Error('模型未返回报告内容')
      trace.push({type:'final',summary:'已根据工具观察结果生成分析报告'})
      return {chart,matches,trace,report:message.content,mode:'llm'}
    }
    if(message.tool_calls.length>8) throw new Error('模型单轮工具调用数量超出限制')
    messages.push({role:'assistant',content:message.content || null,tool_calls:message.tool_calls})
    for(const call of message.tool_calls) {
      const name=call.function.name
      trace.push({type:'action',tool:name,summary:`第 ${step+1} 轮：请求工具`})
      let result
      try {
        const args=JSON.parse(call.function.arguments || '{}')
        if(name==='calculate_bazi') result=chart
        else if(name==='search_celebrities') result={matches,exactCount:0,database:'16 位有生日来源的本地人物；时辰均未知'}
        else if(name==='lookup_knowledge') result={text:knowledge[args.topic] || '主题不存在，请选择五行、十神、月令或名人匹配'}
        else result={error:'未知工具，禁止执行'}
        if(!result.error) seen.add(name)
      } catch { result={error:'工具参数不是合法 JSON'} }
      const observation=JSON.stringify(result)
      trace.push({type:'observation',tool:name,summary:observation})
      messages.push({role:'tool',tool_call_id:call.id,content:observation})
    }
  }
  throw new Error('Agent 达到最大轮数仍未完成，请增加步数或使用支持 tools 的模型')
}