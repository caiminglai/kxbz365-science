import { useState, useEffect, useCallback } from 'react'
import Navbar from '@/sections/Navbar'
import Footer from '@/sections/Footer'
import { createSubmission, generateTermWithAI, getAIProviders } from '@/api/services'
import { DISCIPLINES } from '@/types'
import type { AIProvider } from '@/api/types'
import { Sparkles, Loader2, AlertCircle, Key, Lightbulb } from 'lucide-react'

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error'
type SubmitMode = 'pair' | 'term'

interface AIConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

const AI_STORAGE_KEY = 'twym_ai_config'

function readAIConfig(): AIConfig {
  try {
    const saved = localStorage.getItem(AI_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // localStorage 读取失败时忽略
  }
  return { provider: 'openai', apiKey: '', baseUrl: '', model: '' }
}

const emptyPairForm = {
  term1: '',
  term2: '',
  explanation: '',
  examples: '',
  contact: '',
}

const emptyTermForm = {
  term_name: '',
  term_discipline: '',
  term_translation: '',
  term_essence: '',
  term_tip: '',
  term_aliases: '',
  contact: '',
}

export default function UserSubmission() {
  const [mode, setMode] = useState<SubmitMode>('pair')
  const [pairForm, setPairForm] = useState(emptyPairForm)
  const [termForm, setTermForm] = useState(emptyTermForm)
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [aiConfig, setAiConfig] = useState<AIConfig>(readAIConfig)
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [showAISettings, setShowAISettings] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        setProviders(await getAIProviders())
      } catch {
        // 获取提供商列表失败时静默忽略
      }
    })()
  }, [])

  const handlePairChange = (field: keyof typeof emptyPairForm, value: string) => {
    setPairForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleTermChange = (field: keyof typeof emptyTermForm, value: string) => {
    setTermForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validatePair = () => {
    const next: Record<string, string> = {}
    if (!pairForm.term1.trim()) next.term1 = '请填写术语 1'
    if (!pairForm.term2.trim()) next.term2 = '请填写术语 2'
    if (!pairForm.explanation.trim()) next.explanation = '请解释它们的共同本质'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const validateTerm = () => {
    const next: Record<string, string> = {}
    if (!termForm.term_name.trim()) next.term_name = '请填写术语名称'
    if (!termForm.term_discipline.trim()) next.term_discipline = '请选择学科'
    if (!termForm.term_translation.trim()) next.term_translation = '请填写大白话翻译'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const isValid = mode === 'pair' ? validatePair() : validateTerm()
    if (!isValid) return

    setStatus('submitting')
    setErrorMsg('')
    try {
      if (mode === 'pair') {
        await createSubmission({
          submission_type: 'pair',
          term1: pairForm.term1.trim(),
          term2: pairForm.term2.trim(),
          explanation: pairForm.explanation.trim() || undefined,
          contact: pairForm.contact.trim() || undefined,
          examples: pairForm.examples.trim() || undefined,
        })
      } else {
        const aliases = termForm.term_aliases
          .split(/[,，;；]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((line) => {
            const parts = line.split(/[:：]/)
            return {
              discipline: parts[0]?.trim() || '跨学科',
              name: parts[1]?.trim() || line,
            }
          })
        await createSubmission({
          submission_type: 'term',
          term_name: termForm.term_name.trim(),
          term_discipline: termForm.term_discipline.trim(),
          term_translation: termForm.term_translation.trim(),
          term_essence: termForm.term_essence.trim(),
          term_tip: termForm.term_tip.trim(),
          term_aliases: aliases,
          contact: termForm.contact.trim() || undefined,
        })
      }
      setStatus('success')
    } catch (err: unknown) {
      setStatus('error')
      const message = err instanceof Error ? err.message : '提交失败，请稍后再试'
      setErrorMsg(message)
    }
  }

  const handleReset = () => {
    setPairForm(emptyPairForm)
    setTermForm(emptyTermForm)
    setErrors({})
    setStatus('idle')
    setErrorMsg('')
  }

  const handleGenerate = useCallback(async () => {
    if (!termForm.term_name.trim() || !termForm.term_discipline.trim()) {
      setErrors((prev) => ({
        ...prev,
        term_name: !termForm.term_name.trim() ? '请填写术语名称' : prev.term_name,
        term_discipline: !termForm.term_discipline.trim() ? '请选择学科' : prev.term_discipline,
      }))
      return
    }
    if (!aiConfig.apiKey.trim()) {
      setShowAISettings(true)
      setErrorMsg('请先配置 API Key')
      return
    }

    setIsGenerating(true)
    setErrorMsg('')
    try {
      const result = await generateTermWithAI({
        name: termForm.term_name.trim(),
        discipline: termForm.term_discipline.trim(),
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey.trim(),
        baseUrl: aiConfig.baseUrl.trim() || undefined,
        model: aiConfig.model.trim() || undefined,
      })
      setTermForm((prev) => ({
        ...prev,
        term_translation: result.translation || prev.term_translation,
        term_essence: result.essence || prev.term_essence,
        term_tip: result.tip || prev.term_tip,
        term_aliases: result.aliases
          ? result.aliases.map((a) => `${a.discipline}：${a.name}`).join('；')
          : prev.term_aliases,
      }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '生成失败，请稍后再试'
      setErrorMsg(message)
      setStatus('error')
    } finally {
      setIsGenerating(false)
    }
  }, [termForm, aiConfig])

  const saveAIConfig = (patch: Partial<AIConfig>) => {
    const next = { ...aiConfig, ...patch }
    setAiConfig(next)
    try {
      localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // localStorage 写入失败时忽略
    }
  }

  const inputBase =
    'w-full px-4 rounded-lg bg-white dark:bg-warm-card border text-warm-dark dark:text-warm-text text-sm focus:outline-none focus:ring-2 transition-colors'

  return (
    <div className="min-h-screen bg-warm-bg dark:bg-warm-bg">
      <Navbar
        onSearch={() => {}}
        onRandom={() => {}}
        onFilterDiscipline={() => {}}
        activeFilter="all"
      />

      <main className="pt-24 pb-10 px-4 lg:px-6">
        <div className="max-w-[800px] mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-1 h-8 rounded-full bg-disc-econ" />
              <h1 className="text-2xl sm:text-3xl font-bold text-warm-dark dark:text-warm-text font-display">
                一起降低知识门槛 →
              </h1>
            </div>
            <p className="text-warm-text ml-4 max-w-[600px]">
              你可以提交一组“同物异名”，也可以提交一个专业术语的大白话解释。我们每天人工审核。
            </p>

            {/* 模式说明卡片 */}
            <div className="mt-6 p-4 bg-warm-bg dark:bg-warm-card-dark rounded-xl border border-warm-border">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-disc-econ/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-disc-econ font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-warm-dark dark:text-warm-text mb-1">
                      同物异名
                    </h3>
                    <p className="text-sm text-warm-text">
                      提交两个本质相同但叫法不同的术语，比如“函数”和“映射”
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-disc-cs/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-disc-cs font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-warm-dark dark:text-warm-text mb-1">
                      新术语 / AI 辅助
                    </h3>
                    <p className="text-sm text-warm-text">
                      提交一个新术语的大白话解释，AI 可以帮你自动生成
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {status === 'success' ? (
            <div className="bg-white dark:bg-warm-card rounded-xl p-8 border border-warm-border text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-warm-dark dark:text-warm-text font-display mb-3">
                提交成功！
              </h2>
              <p className="text-warm-text text-sm max-w-[500px] mx-auto leading-relaxed mb-6">
                感谢你的贡献！我们会尽快人工审核，通过后就会加入词条库。
              </p>
              <button
                onClick={handleReset}
                className="px-8 py-3 rounded-lg bg-disc-econ hover:bg-disc-econ/90 text-white font-medium transition-colors"
              >
                继续提交
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-warm-card rounded-xl border border-warm-border overflow-hidden">
              {/* 模式切换 */}
              <div className="flex border-b border-warm-border">
                <button
                  type="button"
                  onClick={() => setMode('pair')}
                  className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                    mode === 'pair'
                      ? 'bg-warm-bg dark:bg-warm-bg text-warm-dark dark:text-warm-text border-b-2 border-disc-econ'
                      : 'text-warm-text hover:text-warm-dark dark:hover:text-warm-text'
                  }`}
                >
                  同物异名
                </button>
                <button
                  type="button"
                  onClick={() => setMode('term')}
                  className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                    mode === 'term'
                      ? 'bg-warm-bg dark:bg-warm-bg text-warm-dark dark:text-warm-text border-b-2 border-disc-econ'
                      : 'text-warm-text hover:text-warm-dark dark:hover:text-warm-text'
                  }`}
                >
                  新术语 / AI 辅助
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 sm:p-8">
                {mode === 'pair' ? (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm text-warm-text mb-2">
                          术语 1 <span className="text-disc-econ">*</span>
                        </label>
                        <input
                          type="text"
                          value={pairForm.term1}
                          onChange={(e) => handlePairChange('term1', e.target.value)}
                          placeholder="如：人工智能"
                          className={`${inputBase} h-12 ${
                            errors.term1
                              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15'
                              : 'border-warm-border focus:border-disc-econ focus:ring-disc-econ/15'
                          }`}
                        />
                        {errors.term1 && (
                          <div className="mt-1.5 text-xs text-red-500">{errors.term1}</div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm text-warm-text mb-2">
                          术语 2 <span className="text-disc-econ">*</span>
                        </label>
                        <input
                          type="text"
                          value={pairForm.term2}
                          onChange={(e) => handlePairChange('term2', e.target.value)}
                          placeholder="如：机器学习"
                          className={`${inputBase} h-12 ${
                            errors.term2
                              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15'
                              : 'border-warm-border focus:border-disc-econ focus:ring-disc-econ/15'
                          }`}
                        />
                        {errors.term2 && (
                          <div className="mt-1.5 text-xs text-red-500">{errors.term2}</div>
                        )}
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm text-warm-text mb-2">
                        它们本质是… <span className="text-disc-econ">*</span>
                      </label>
                      <textarea
                        value={pairForm.explanation}
                        onChange={(e) => handlePairChange('explanation', e.target.value)}
                        placeholder="用一句话描述这两个术语的共同本质，帮助我们理解它们为什么是同一个东西"
                        rows={4}
                        className={`${inputBase} py-3 resize-y ${
                          errors.explanation
                            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15'
                            : 'border-warm-border focus:border-disc-econ focus:ring-disc-econ/15'
                        }`}
                      />
                      {errors.explanation && (
                        <div className="mt-1.5 text-xs text-red-500">{errors.explanation}</div>
                      )}
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm text-warm-text mb-2">
                        应用场景举例 <span className="text-xs text-warm-text/70">（可选）</span>
                      </label>
                      <textarea
                        value={pairForm.examples}
                        onChange={(e) => handlePairChange('examples', e.target.value)}
                        placeholder="这两个术语在什么场合会被使用？举一两个例子可以帮助其他读者理解"
                        rows={3}
                        className={`${inputBase} py-3 resize-y border-warm-border focus:border-disc-econ focus:ring-disc-econ/15`}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm text-warm-text mb-2">
                          术语名称 <span className="text-disc-econ">*</span>
                        </label>
                        <input
                          type="text"
                          value={termForm.term_name}
                          onChange={(e) => handleTermChange('term_name', e.target.value)}
                          placeholder="如：涌现"
                          className={`${inputBase} h-12 ${
                            errors.term_name
                              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15'
                              : 'border-warm-border focus:border-disc-econ focus:ring-disc-econ/15'
                          }`}
                        />
                        {errors.term_name && (
                          <div className="mt-1.5 text-xs text-red-500">{errors.term_name}</div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm text-warm-text mb-2">
                          所属学科 <span className="text-disc-econ">*</span>
                        </label>
                        <select
                          value={termForm.term_discipline}
                          onChange={(e) => handleTermChange('term_discipline', e.target.value)}
                          className={`${inputBase} h-12 ${
                            errors.term_discipline
                              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15'
                              : 'border-warm-border focus:border-disc-econ focus:ring-disc-econ/15'
                          }`}
                        >
                          <option value="">请选择学科</option>
                          {DISCIPLINES.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        {errors.term_discipline && (
                          <div className="mt-1.5 text-xs text-red-500">
                            {errors.term_discipline}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI 生成区 */}
                    <div className="mb-5 p-4 rounded-xl bg-warm-bg dark:bg-warm-bg border border-warm-border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-warm-accent" />
                          <span className="text-sm font-medium text-warm-dark dark:text-warm-text">
                            AI 辅助生成
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAISettings(!showAISettings)}
                          className="flex items-center gap-1 text-xs text-warm-text hover:text-warm-accent transition-colors"
                        >
                          <Key className="w-3 h-3" />
                          {showAISettings ? '收起设置' : 'API 设置'}
                        </button>
                      </div>

                      {showAISettings && (
                        <div className="mb-3 grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-warm-text mb-1">提供商</label>
                            <select
                              value={aiConfig.provider}
                              onChange={(e) => saveAIConfig({ provider: e.target.value })}
                              className={`${inputBase} h-9 text-xs`}
                            >
                              {providers.map((p) => (
                                <option key={p.provider} value={p.provider}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-warm-text mb-1">API Key</label>
                            <input
                              type="password"
                              value={aiConfig.apiKey}
                              onChange={(e) => saveAIConfig({ apiKey: e.target.value })}
                              placeholder="sk-..."
                              className={`${inputBase} h-9 text-xs`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-warm-text mb-1">
                              模型（可选）
                            </label>
                            <input
                              type="text"
                              value={aiConfig.model}
                              onChange={(e) => saveAIConfig({ model: e.target.value })}
                              placeholder="默认模型"
                              className={`${inputBase} h-9 text-xs`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-warm-text mb-1">
                              Base URL（可选）
                            </label>
                            <input
                              type="text"
                              value={aiConfig.baseUrl}
                              onChange={(e) => saveAIConfig({ baseUrl: e.target.value })}
                              placeholder="https://api.openai.com/v1"
                              className={`${inputBase} h-9 text-xs`}
                            />
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full py-2.5 rounded-lg bg-warm-accent/10 hover:bg-warm-accent/20 text-warm-accent font-medium text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            AI 正在生成…
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />让 AI 生成大白话翻译、本质与跨学科别名
                          </>
                        )}
                      </button>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm text-warm-text mb-2">
                        大白话翻译 <span className="text-disc-econ">*</span>
                      </label>
                      <input
                        type="text"
                        value={termForm.term_translation}
                        onChange={(e) => handleTermChange('term_translation', e.target.value)}
                        placeholder="用一句话让初中生也能听懂"
                        className={`${inputBase} h-12 ${
                          errors.term_translation
                            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15'
                            : 'border-warm-border focus:border-disc-econ focus:ring-disc-econ/15'
                        }`}
                      />
                      {errors.term_translation && (
                        <div className="mt-1.5 text-xs text-red-500">{errors.term_translation}</div>
                      )}
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm text-warm-text mb-2">
                        本质解释 <span className="text-xs text-warm-text/70">（可选）</span>
                      </label>
                      <textarea
                        value={termForm.term_essence}
                        onChange={(e) => handleTermChange('term_essence', e.target.value)}
                        placeholder="用 2-3 句话解释这个术语的本质，避免使用更复杂的术语包装"
                        rows={3}
                        className={`${inputBase} py-3 resize-y border-warm-border focus:border-disc-econ focus:ring-disc-econ/15`}
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm text-warm-text mb-2">
                        防忽悠提示 <span className="text-xs text-warm-text/70">（可选）</span>
                      </label>
                      <textarea
                        value={termForm.term_tip}
                        onChange={(e) => handleTermChange('term_tip', e.target.value)}
                        placeholder="告诉读者遇到这个术语时应该注意什么"
                        rows={2}
                        className={`${inputBase} py-3 resize-y border-warm-border focus:border-disc-econ focus:ring-disc-econ/15`}
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm text-warm-text mb-2">
                        跨学科别名 <span className="text-xs text-warm-text/70">（可选）</span>
                      </label>
                      <textarea
                        value={termForm.term_aliases}
                        onChange={(e) => handleTermChange('term_aliases', e.target.value)}
                        placeholder="格式：学科id：别名；如 cs：机器学习；stats：统计学习"
                        rows={2}
                        className={`${inputBase} py-3 resize-y border-warm-border focus:border-disc-econ focus:ring-disc-econ/15`}
                      />
                      <div className="mt-1.5 flex items-start gap-1 text-xs text-warm-text">
                        <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>可用 AI 自动生成，也可手动填写。多个别名用分号隔开。</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="mb-6">
                  <label className="block text-sm text-warm-text mb-2">
                    你的联系方式{' '}
                    <span className="text-xs text-warm-text/70">（可选，邮箱/微信）</span>
                  </label>
                  <input
                    type="text"
                    value={mode === 'pair' ? pairForm.contact : termForm.contact}
                    onChange={(e) =>
                      mode === 'pair'
                        ? handlePairChange('contact', e.target.value)
                        : handleTermChange('contact', e.target.value)
                    }
                    placeholder="方便我们感谢你，也可能在审核通过时通知你"
                    className={`${inputBase} h-12 border-warm-border focus:border-disc-econ focus:ring-disc-econ/15`}
                  />
                </div>

                {status === 'error' && errorMsg && (
                  <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {errorMsg}
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="px-10 py-3.5 rounded-lg bg-disc-econ hover:bg-disc-econ/90 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-base"
                  >
                    {status === 'submitting' ? '提交中…' : '提交审核'}
                  </button>
                </div>

                <div className="mt-5 text-center text-xs text-warm-text">
                  🔒 你提交的内容会先进入人工审核队列，不会立即公开展示
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
