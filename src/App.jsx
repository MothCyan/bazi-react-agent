import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleDot,
  Compass,
  Cpu,
  Download,
  Gauge,
  History,
  KeyRound,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { getConfig, runAnalysis, saveConfig, testConnection } from './api.js'
import './App.css'

const ELEMENT_ORDER = ['木', '火', '土', '金', '水']
const ELEMENT_COLOR = {
  木: '#4e8a5c',
  火: '#c1543a',
  土: '#b5863f',
  金: '#8d9199',
  水: '#3f6f96',
}
const HISTORY_KEY = 'bazi.history.v1'
const ENGINE_KEY = 'bazi.engine'
const DEMO_FORM = { mode: 'birth', name: '示例', date: '1990-05-20', time: '10:00', pillars: ['', '', '', ''] }
const EMPTY_FORM = { mode: 'birth', name: '', date: '', time: '', pillars: ['', '', '', ''] }

// 静态展示用示例（与庚午 辛巳 乙酉 辛巳 对应），不代替真实排盘结果。
const EXAMPLE_CHART = {
  pillars: [
    { label: '年柱', gan: '庚', zhi: '午', element: '金', branchElement: '火', tenGod: '正官', naYin: '路旁土', hidden: '丁·食神 / 己·偏财' },
    { label: '月柱', gan: '辛', zhi: '巳', element: '金', branchElement: '火', tenGod: '七杀', naYin: '白蜡金', hidden: '丙·伤官 / 庚·正官 / 戊·正财' },
    { label: '日柱', gan: '乙', zhi: '酉', element: '木', branchElement: '金', tenGod: '日主', naYin: '泉中水', hidden: '辛·七杀' },
    { label: '时柱', gan: '辛', zhi: '巳', element: '金', branchElement: '火', tenGod: '七杀', naYin: '白蜡金', hidden: '丙·伤官 / 庚·正官 / 戊·正财' },
  ],
  dayMaster: '乙',
  elements: { 木: 1, 火: 3, 土: 0, 金: 4, 水: 0 },
}

function readHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object').slice(0, 8) : []
  } catch {
    return []
  }
}

function writeHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 8)))
  } catch {
    /* 存储不可用时静默忽略，不影响分析流程 */
  }
}

/** 分析引擎：local 只用服务端规则与工具，agent 走 ReAct + 模型 */
function readEngine() {
  try {
    return localStorage.getItem(ENGINE_KEY) === 'local' ? 'local' : 'agent'
  } catch {
    return 'agent'
  }
}

function writeEngine(engine) {
  try {
    localStorage.setItem(ENGINE_KEY, engine)
  } catch {
    /* 存储不可用时只在本次会话内生效 */
  }
}

function buildPayload(form) {
  if (form.mode === 'manual') {
    return { mode: 'manual', pillars: form.pillars.map((pillar) => pillar.trim()) }
  }
  return { mode: 'birth', name: form.name.trim(), date: form.date, time: form.time }
}

function formTitle(payload) {
  if (payload.mode === 'manual') return payload.pillars.join(' ')
  return `${payload.date} ${payload.time}`
}

export default function App() {
  const [view, setView] = useState('overview')
  const [form, setForm] = useState(EMPTY_FORM)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(readHistory)
  const [engine, setEngine] = useState(readEngine)
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState('')
  const resultRef = useRef(null)

  useEffect(() => {
    let alive = true
    getConfig()
      .then((data) => {
        if (alive) setConfig(data)
      })
      .catch((cause) => {
        if (alive) setConfigError(cause.message)
      })
    return () => {
      alive = false
    }
  }, [])

  const submit = useCallback(async (payload) => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await runAnalysis({ ...payload, engine })
      setResult(data)
      setHistory((previous) => {
        const entry = { id: `${Date.now()}`, ...payload, title: formTitle(payload) }
        const next = [entry, ...previous.filter((item) => item.title !== entry.title)].slice(0, 8)
        writeHistory(next)
        return next
      })
      window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (cause) {
      setError(cause.message)
    } finally {
      setLoading(false)
    }
  }, [engine])

  const selectEngine = (next) => {
    setEngine(next)
    writeEngine(next)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    submit(buildPayload(form))
  }

  const handleDemo = () => {
    setForm(DEMO_FORM)
    submit(buildPayload(DEMO_FORM))
  }

  const applyHistory = (item) => {
    setForm({
      mode: item.mode === 'manual' ? 'manual' : 'birth',
      name: item.name || '',
      date: item.date || '',
      time: item.time || '',
      pillars: Array.isArray(item.pillars) && item.pillars.length === 4 ? item.pillars : ['', '', '', ''],
    })
    setView('overview')
  }

  const removeHistory = (id) => {
    setHistory((previous) => {
      const next = previous.filter((item) => item.id !== id)
      writeHistory(next)
      return next
    })
  }

  const historyNodes = useMemo(
    () =>
      history.map((item) => (
        <li key={item.id} className="history-row">
          <button type="button" className="history-item" onClick={() => applyHistory(item)}>
            <span className="history-title">{item.name || '未命名'}</span>
            <span className="history-meta">{item.title}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`删除记录 ${item.title}`}
            onClick={() => removeHistory(item.id)}
          >
            <Trash2 size={14} />
          </button>
        </li>
      )),
    [history],
  )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Compass size={20} />
          </span>
          <span className="brand-text">
            <strong>观命</strong>
            <em>BAZI LAB</em>
          </span>
        </div>

        <nav className="nav">
          <button
            type="button"
            className={view === 'overview' ? 'nav-item is-active' : 'nav-item'}
            onClick={() => setView('overview')}
          >
            <Gauge size={17} /> 排盘分析
          </button>
          <button
            type="button"
            className={view === 'settings' ? 'nav-item is-active' : 'nav-item'}
            onClick={() => setView('settings')}
          >
            <Settings size={17} /> 模型设置
          </button>
        </nav>

        <div className="side-block">
          <h4>
            <History size={15} /> 本地记录
          </h4>
          {history.length === 0 ? (
            <p className="side-empty">暂无记录。分析成功后自动保留最近 8 条出生信息，只含姓名与时间。</p>
          ) : (
            <ul className="history">{historyNodes}</ul>
          )}
        </div>

        <p className="side-note">
          传统文化学习与娱乐用途，不构成科学预测；请勿用于医疗、投资或其他重大决策。
        </p>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>八字命理智能分析</h1>
            <p className="topbar-sub">ReAct Agent · 工具驱动的排盘、命理分析与同八字名人检索</p>
          </div>
          <div className="status">
            <span className={engine === 'local' ? 'chip' : 'chip chip-live'}>
              {engine === 'local' ? <Zap size={13} /> : <Sparkles size={13} />}
              {engine === 'local' ? '本地模式' : 'Agent 模式'}
            </span>
            {result && (
              <span className="chip chip-muted">
                {result.mode === 'llm' ? '模型生成' : result.engine === 'local' ? '本地规则生成' : '规则回退生成'}
              </span>
            )}
            <span className="chip chip-muted">
              <Cpu size={13} /> {config?.model || '未配置模型'}
            </span>
          </div>
        </header>

        <div className="content">
          {view === 'settings' ? (
            <SettingsView
              config={config}
              configError={configError}
              onSaved={(saved) => {
                setConfig(saved)
                setConfigError('')
              }}
            />
          ) : (
            <>
              <form className="card input-card" onSubmit={handleSubmit}>
                <div className="input-head">
                  <div className="seg" role="group" aria-label="输入方式">
                    <button
                      type="button"
                      className={form.mode === 'birth' ? 'seg-btn is-active' : 'seg-btn'}
                      onClick={() => setForm((previous) => ({ ...previous, mode: 'birth' }))}
                    >
                      出生信息排盘
                    </button>
                    <button
                      type="button"
                      className={form.mode === 'manual' ? 'seg-btn is-active' : 'seg-btn'}
                      onClick={() => setForm((previous) => ({ ...previous, mode: 'manual' }))}
                    >
                      直接输入四柱
                    </button>
                  </div>

                  <div className="seg seg-engine" role="group" aria-label="分析引擎">
                    <button
                      type="button"
                      className={engine === 'local' ? 'seg-btn is-active' : 'seg-btn'}
                      onClick={() => selectEngine('local')}
                    >
                      <Zap size={14} /> 本地模式
                    </button>
                    <button
                      type="button"
                      className={engine === 'agent' ? 'seg-btn is-active' : 'seg-btn'}
                      onClick={() => selectEngine('agent')}
                    >
                      <Sparkles size={14} /> Agent 模式
                    </button>
                  </div>
                </div>

                <p className="engine-note">
                  {engine === 'local'
                    ? '本地模式：不调用模型，排盘、名人检索与报告全部由服务端规则即时完成，无需配置密钥。'
                    : config && !config.hasKey
                      ? 'Agent 模式：未配置模型密钥，本次会直接使用本地规则报告；可在「模型设置」中配置支持 tools 的模型。'
                      : 'Agent 模式：由模型自主选择工具并撰写报告，调用失败或超时时自动回退本地规则报告。'}
                </p>

                {form.mode === 'birth' ? (
                  <div className="fields">
                    <Field label="姓名（可选）">
                      <input
                        className="input"
                        type="text"
                        maxLength={40}
                        placeholder="用于报告称呼"
                        value={form.name}
                        onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                      />
                    </Field>
                    <Field label="出生日期（公历）">
                      <input
                        className="input"
                        type="date"
                        required
                        min="1900-01-01"
                        max="2100-12-31"
                        value={form.date}
                        onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))}
                      />
                    </Field>
                    <Field label="出生时间（北京时间）">
                      <input
                        className="input"
                        type="time"
                        required
                        value={form.time}
                        onChange={(event) => setForm((previous) => ({ ...previous, time: event.target.value }))}
                      />
                    </Field>
                  </div>
                ) : (
                  <div className="fields">
                    {['年柱', '月柱', '日柱', '时柱'].map((label, index) => (
                      <Field key={label} label={label}>
                        <input
                          className="input pillar-input"
                          type="text"
                          maxLength={2}
                          required
                          placeholder="甲子"
                          value={form.pillars[index]}
                          onChange={(event) =>
                            setForm((previous) => {
                              const pillars = [...previous.pillars]
                              pillars[index] = event.target.value
                              return { ...previous, pillars }
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                )}

                <div className="input-foot">
                  <p className="hint">
                    历法由 lunar-javascript 在服务端计算：立春换年、节气换月、晚子时按午夜换日。未知时柱不做推测。
                  </p>
                  <div className="input-actions">
                    <button type="button" className="btn btn-ghost" onClick={handleDemo} disabled={loading}>
                      <Play size={15} /> 一键示例
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                      {loading ? '分析中…' : '开始分析'}
                    </button>
                  </div>
                </div>
              </form>

              {error && (
                <div className="alert" role="alert">
                  <AlertTriangle size={17} />
                  <span>{error}</span>
                </div>
              )}

              {configError && !error && (
                <div className="alert alert-soft" role="status">
                  <AlertTriangle size={17} />
                  <span>模型配置读取失败：{configError}</span>
                </div>
              )}

              {loading && <LoadingPanel engine={engine} />}

              <div ref={resultRef}>
                {result ? (
                  <ResultView result={result} />
                ) : (
                  !loading && (
                    <GuideDashboard
                      engine={engine}
                      onDemo={handleDemo}
                      onOpenSettings={() => setView('settings')}
                      modelReady={Boolean(config?.hasKey)}
                    />
                  )
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function LoadingPanel({ engine }) {
  const local = engine === 'local'
  return (
    <section className="card loading" aria-live="polite">
      <header className="card-head">
        <h2>
          {local ? <Zap size={17} /> : <Loader2 size={17} className="spin" />} {local ? '本地规则引擎运行中' : 'Agent 正在运行'}
        </h2>
      </header>
      <ol className="steps">
        <li className="step is-active">
          <CircleDot size={15} /> 计算四柱、十神与五行分布
        </li>
        <li className="step is-active">
          <CircleDot size={15} /> 检索本地名人库并比对柱位
        </li>
        <li className="step is-active">
          <CircleDot size={15} /> {local ? '套用规则模板生成 Markdown 报告' : '模型根据工具结果撰写 Markdown 报告'}
        </li>
      </ol>
      <p className="hint">
        {local
          ? '本地模式不调用任何模型，通常在一秒内返回结果。'
          : '未配置模型时使用规则报告；配置支持 tools 的模型后会进行多轮工具调用。模型响应过慢或不可用时最多等待约 90 秒，超时会自动回退到规则报告。'}
      </p>
    </section>
  )
}

function GuideDashboard({ engine, onDemo, onOpenSettings, modelReady }) {
  return (
    <div className="guide">
      <section className="card">
        <header className="card-head">
          <h2>
            <BookOpen size={17} /> 使用说明
          </h2>
        </header>
        <ol className="guide-steps">
          <li>
            <strong>1 · 输入出生信息</strong>
            <span>填写公历生日与出生时间，或直接输入已知的四柱干支。</span>
          </li>
          <li>
            <strong>2 · 选择分析引擎</strong>
            <span>
              本地模式不调用模型，用服务端工具与规则模板秒级出报告；Agent 模式由模型自主选择工具并撰写，失败时回退规则。
            </span>
          </li>
          <li>
            <strong>3 · 阅读报告与轨迹</strong>
            <span>可查看工具调用轨迹、五行分布、名人参照，并导出 Markdown 报告。</span>
          </li>
        </ol>
        <div className="guide-actions">
          <button type="button" className="btn btn-primary" onClick={onDemo}>
            <Play size={15} /> 体验 1990-05-20 示例（{engine === 'local' ? '本地模式' : 'Agent 模式'}）
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
            <Settings size={15} /> {modelReady ? '查看模型配置' : '配置 LLM（可选）'}
          </button>
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>
            <TrendingUp size={17} /> 示例命盘（演示数据）
          </h2>
          <span className="chip chip-muted">庚午 · 辛巳 · 乙酉 · 辛巳</span>
        </header>
        <div className="chart-grid">
          <PillarTable chart={EXAMPLE_CHART} />
          <ElementBars elements={EXAMPLE_CHART.elements} />
        </div>
        <p className="hint">此卡片为静态说明，展示四柱与五行视图的呈现方式，不是真实输入的排盘结果。</p>
      </section>
    </div>
  )
}

function ResultView({ result }) {
  const exportReport = () => {
    const blob = new Blob([result.report], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `八字分析报告-${new Date().toISOString().slice(0, 10)}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="results">
      {result.fallback && (
        <div className="alert alert-soft" role="status">
          <AlertTriangle size={17} />
          <span>
            {result.fallback.kind === 'no-key'
              ? '未配置模型密钥，本次使用本地规则报告。可在「模型设置」中配置模型后重试。'
              : `模型调用失败，已回退到本地规则报告：${result.fallback.reason}`}
          </span>
        </div>
      )}
      <section className="card">
        <header className="card-head">
          <h2>
            <Compass size={17} /> 命盘
          </h2>
          <span className="chip chip-accent">日主 {result.chart.dayMaster}</span>
        </header>
        <p className="meta-line">
          <span>{result.chart.solar}</span>
          <span>{result.chart.lunar}</span>
        </p>
        <div className="chart-grid">
          <PillarTable chart={result.chart} />
          <ElementBars elements={result.chart.elements} />
        </div>
        <ul className="notes">
          {result.chart.notes.map((note) => (
            <li key={note}>
              <CircleDot size={13} /> {note}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>
            <Users size={17} /> 同八字名人参照
          </h2>
          <span className="chip chip-muted">完整匹配 {result.matches.filter((m) => m.exact).length} 位</span>
        </header>
        {result.matches.length === 0 ? (
          <p className="empty">
            本地小型名人库（16 位，均有公历生日来源）中没有柱位相同的人物。这并不代表世界上不存在，只是当前数据集未覆盖。
          </p>
        ) : (
          <ul className="matches">
            {result.matches.map((match) => (
              <li key={match.name} className="match-card">
                <div className="match-head">
                  <h3>{match.name}</h3>
                  <span className={match.exact ? 'badge badge-ok' : 'badge'}>
                    {match.exact ? '四柱完全匹配' : `部分匹配 ${match.matchCount} 柱`}
                  </span>
                </div>
                <p className="match-meta">
                  {match.birth} · {match.description}
                </p>
                <p className="match-pillars">
                  已比对：{match.pillars.join(' · ')}
                  {match.matchedPillars.length > 0 && <em>（相同：{match.matchedPillars.join('、')}）</em>}
                </p>
                {!match.timeKnown && (
                  <p className="match-warn">
                    <AlertTriangle size={13} /> 出生时辰未核实，时柱未知，因此不能判定为四柱完全匹配。
                  </p>
                )}
                <a className="match-source" href={match.url} target="_blank" rel="noreferrer">
                  <Link2 size={13} /> 生日来源
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <header className="card-head">
          <h2>
            <Cpu size={17} /> {result.engine === 'local' ? '本地规则轨迹' : 'Agent 工具轨迹'}
          </h2>
          <span className="chip chip-muted">共 {result.trace.length} 条</span>
        </header>
        <p className="hint">
          {result.engine === 'local'
            ? '本地模式下按固定顺序执行同一批工具，不展示任何模型思维链。'
            : '仅展示动作摘要与工具返回结果，不展示模型内部思维链。'}
        </p>
        <ol className="trace">
          {result.trace.map((item, index) => (
            <li key={`${item.type}-${item.tool || ''}-${index}`} className={`trace-item trace-${item.type}`}>
              <span className="trace-type">{item.type === 'action' ? '动作' : item.type === 'observation' ? '结果' : '完成'}</span>
              <div className="trace-body">
                {item.tool && <code className="trace-tool">{item.tool}</code>}
                <TraceSummary text={item.summary} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>
            <Sparkles size={17} /> 分析报告
          </h2>
          <div className="card-actions">
            <span className="chip chip-muted">
              {result.mode === 'llm' ? '模型生成' : result.engine === 'local' ? '本地规则生成' : '规则回退生成'}
            </span>
            <button type="button" className="btn btn-ghost" onClick={exportReport}>
              <Download size={15} /> 导出 Markdown
            </button>
          </div>
        </header>
        <div className="markdown">
          <ReactMarkdown>{result.report}</ReactMarkdown>
        </div>
      </section>
    </div>
  )
}

function TraceSummary({ text }) {
  if (text.length <= 180) {
    return <p className="trace-text">{text}</p>
  }
  return (
    <details className="trace-details">
      <summary className="trace-text">{text.slice(0, 180)}…</summary>
      <pre className="trace-full">{text}</pre>
    </details>
  )
}

function PillarTable({ chart }) {
  return (
    <div className="table-scroll">
      <table className="pillar-table">
        <thead>
          <tr>
            <th scope="col">柱位</th>
            <th scope="col">干支</th>
            <th scope="col">天干十神</th>
            <th scope="col">纳音</th>
            <th scope="col">地支藏干</th>
          </tr>
        </thead>
        <tbody>
          {chart.pillars.map((pillar) => (
            <tr key={pillar.label}>
              <th scope="row">{pillar.label}</th>
              <td>
                <span className="gz">
                  <b style={{ color: ELEMENT_COLOR[pillar.element] }}>{pillar.gan}</b>
                  <b style={{ color: ELEMENT_COLOR[pillar.branchElement] }}>{pillar.zhi}</b>
                </span>
                <span className="gz-elements">
                  {pillar.element}/{pillar.branchElement}
                </span>
              </td>
              <td data-label="天干十神">{pillar.tenGod}</td>
              <td data-label="纳音">{pillar.naYin}</td>
              <td className="hidden-cell" data-label="地支藏干">{pillar.hidden}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ElementBars({ elements }) {
  const total = ELEMENT_ORDER.reduce((sum, key) => sum + (elements[key] || 0), 0) || 1
  return (
    <div className="elements">
      <h3 className="elements-title">五行分布（表层八字计数）</h3>
      <ul>
        {ELEMENT_ORDER.map((key) => {
          const value = elements[key] || 0
          return (
            <li key={key} className="element-row">
              <span className="element-name" style={{ color: ELEMENT_COLOR[key] }}>
                {key}
              </span>
              <span className="element-bar">
                <span
                  className="element-fill"
                  style={{ width: `${(value / total) * 100}%`, background: ELEMENT_COLOR[key] }}
                />
              </span>
              <span className="element-count">{value}</span>
            </li>
          )
        })}
      </ul>
      <p className="hint">仅统计八个大字，未计入藏干与月令权重，不能据此直接判定喜用神。</p>
    </div>
  )
}

function toDraft(config) {
  return {
    baseUrl: config?.baseUrl || '',
    model: config?.model || '',
    apiKey: '',
    temperature: typeof config?.temperature === 'number' ? config.temperature : 0.6,
    maxSteps: typeof config?.maxSteps === 'number' ? config.maxSteps : 5,
  }
}

function SettingsView({ config, configError, onSaved }) {
  const [draft, setDraft] = useState(() => toDraft(config))
  const [loadedConfig, setLoadedConfig] = useState(config)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState('')
  const [clearing, setClearing] = useState(false)

  // 配置从服务端返回或保存成功后同步表单（渲染期调整状态，避免额外渲染）
  if (config !== loadedConfig) {
    setLoadedConfig(config)
    setDraft(toDraft(config))
  }

  const update = (key) => (event) => setDraft((previous) => ({ ...previous, [key]: event.target.value }))

  const handleSave = async (event) => {
    event.preventDefault()
    setBusy('save')
    setMessage('')
    setFailure('')
    try {
      const saved = await saveConfig({
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        apiKey: draft.apiKey,
        temperature: Number(draft.temperature),
        maxSteps: Number(draft.maxSteps),
        clearKey: clearing,
      })
      setDraft((previous) => ({ ...previous, apiKey: '' }))
      setClearing(false)
      onSaved(saved)
      setMessage(clearing ? '已保存并清除服务端密钥。' : '配置已保存到服务端 data/config.json，密钥不会返回浏览器。')
    } catch (cause) {
      setFailure(cause.message)
    } finally {
      setBusy('')
    }
  }

  const handleTest = async () => {
    setBusy('test')
    setMessage('')
    setFailure('')
    try {
      const data = await testConnection()
      setMessage(data.message)
    } catch (cause) {
      setFailure(cause.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <form className="card settings" onSubmit={handleSave}>
      <header className="card-head">
        <h2>
          <KeyRound size={17} /> LLM 配置
        </h2>
        <span className={config?.hasKey ? 'chip chip-live' : 'chip'}>{config?.hasKey ? '已保存密钥' : '未保存密钥'}</span>
      </header>

      {configError && <p className="warn-line">读取配置失败：{configError}</p>}

      <div className="fields fields-stack">
        <Field label="接口地址 Base URL（OpenAI 兼容）">
          <input
            className="input"
            type="url"
            required
            placeholder="https://api.openai.com/v1"
            value={draft.baseUrl}
            onChange={update('baseUrl')}
          />
        </Field>
        <Field label="模型名称">
          <input className="input" type="text" required maxLength={120} placeholder="gpt-4o-mini" value={draft.model} onChange={update('model')} />
        </Field>
        <Field label="API Key（留空表示保留已保存的密钥）">
          <input
            className="input"
            type="password"
            autoComplete="off"
            spellCheck="false"
            placeholder={config?.hasKey ? '已保存，留空则不修改' : '仅保存在服务端，不写入浏览器'}
            value={draft.apiKey}
            onChange={update('apiKey')}
          />
        </Field>
        <div className="fields">
          <Field label="温度（0—2）">
            <input
              className="input"
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={draft.temperature}
              onChange={update('temperature')}
            />
          </Field>
          <Field label="最大工具调用轮数（2—8）">
            <input className="input" type="number" min="2" max="8" step="1" value={draft.maxSteps} onChange={update('maxSteps')} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={clearing} onChange={(event) => setClearing(event.target.checked)} />
          <span>保存时同时清除服务端已保存的密钥</span>
        </label>
      </div>

      <div className="input-actions">
        <button type="button" className="btn btn-ghost" onClick={handleTest} disabled={busy !== ''}>
          {busy === 'test' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} 测试连接
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy !== ''}>
          {busy === 'save' ? <Loader2 size={15} className="spin" /> : <Save size={15} />} 保存配置
        </button>
      </div>

      {message && (
        <p className="ok-line" role="status">
          <CheckCircle2 size={15} /> {message}
        </p>
      )}
      {failure && (
        <p className="warn-line" role="alert">
          <AlertTriangle size={15} /> {failure}
        </p>
      )}

      <ul className="notes">
        <li>
          <CircleDot size={13} /> 密钥仅写入服务端 <code>data/config.json</code>（已在 .gitignore 中排除），接口只返回
          “是否已保存”，不返回密钥内容。
        </li>
        <li>
          <CircleDot size={13} /> 未配置密钥时自动使用规则演示模式，排盘与名人匹配仍然可用；该模式不会调用任何外部接口。
        </li>
        <li>
          <CircleDot size={13} /> 完整 ReAct 循环要求模型支持 OpenAI 风格 <code>tools</code>（函数调用），例如 GPT、DeepSeek、
          Qwen 等兼容接口。仅“测试连接”通过不代表工具调用一定可用。
        </li>
      </ul>
    </form>
  )
}
