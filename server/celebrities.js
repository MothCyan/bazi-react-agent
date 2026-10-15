import { buildChart } from './chart.js'

// 仅使用可核对的公历生日。时辰均未知，不生成或推测名人时柱。
export const celebrities = [
  ['周杰伦','1979-01-18','音乐人','https://zh.wikipedia.org/wiki/周杰倫'],
  ['姚明','1980-09-12','篮球运动员','https://zh.wikipedia.org/wiki/姚明'],
  ['莫言','1955-02-17','作家，诺贝尔文学奖得主','https://zh.wikipedia.org/wiki/莫言'],
  ['屠呦呦','1930-12-30','药学家，诺贝尔生理学或医学奖得主','https://zh.wikipedia.org/wiki/屠呦呦'],
  ['袁隆平','1930-09-07','农业科学家','https://zh.wikipedia.org/wiki/袁隆平'],
  ['钱学森','1911-12-11','航天科学家','https://zh.wikipedia.org/wiki/钱学森'],
  ['杨振宁','1922-10-01','物理学家','https://zh.wikipedia.org/wiki/杨振宁'],
  ['张爱玲','1920-09-30','作家','https://zh.wikipedia.org/wiki/張愛玲'],
  ['李小龙','1940-11-27','演员、武术家','https://zh.wikipedia.org/wiki/李小龍'],
  ['成龙','1954-04-07','演员、导演','https://zh.wikipedia.org/wiki/成龍'],
  ['刘德华','1961-09-27','演员、歌手','https://zh.wikipedia.org/wiki/劉德華'],
  ['王菲','1969-08-08','歌手','https://zh.wikipedia.org/wiki/王菲'],
  ['邓紫棋','1991-08-16','音乐人','https://zh.wikipedia.org/wiki/鄧紫棋'],
  ['苏炳添','1989-08-29','短跑运动员','https://zh.wikipedia.org/wiki/苏炳添'],
  ['马龙','1988-10-20','乒乓球运动员','https://zh.wikipedia.org/wiki/马龙'],
  ['谷爱凌','2003-09-03','自由式滑雪运动员','https://zh.wikipedia.org/wiki/谷爱凌'],
].map(([name,birth,description,url]) => ({name,birth,description,url,timeKnown:false}))

export function findMatches(chart) {
  return celebrities.map(person => {
    const known = buildChart({date:person.birth,time:'12:00'}).pillars.slice(0,3)
    const matchedPillars = known.flatMap((p,i) => p.gan === chart.pillars[i].gan && p.zhi === chart.pillars[i].zhi ? [p.label] : [])
    return {...person, pillars:known.map(p => p.gan+p.zhi),matchCount:matchedPillars.length,matchedPillars,exact:false}
  }).filter(p => p.matchCount > 0).sort((a,b) => b.matchCount-a.matchCount).slice(0,6)
}