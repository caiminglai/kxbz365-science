import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import Navbar from '@/sections/Navbar'
import Footer from '@/sections/Footer'
import TermCard from '@/components/TermCard'
import ConceptGraph from '@/components/ConceptGraph'
import { getDisciplines, getTerms } from '@/api/services'
import type { DisciplineData } from '@/api/services'
import type { APITerm } from '@/api/types'

export default function DisciplinePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [discipline, setDiscipline] = useState<DisciplineData | null>(null)
  const [terms, setTerms] = useState<APITerm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      setLoading(true)
      try {
        // 加载学科列表
        const disciplines = await getDisciplines()
        const disc = disciplines.find((d) => d.id === id)
        if (!cancelled)
          setDiscipline(disc ? { ...disc, description: disc.description || '' } : null)

        // 加载该学科下的词条（使用统一 API 服务）
        const termsData = await getTerms(1, 500, disc?.name || id)
        if (!cancelled) {
          const list: APITerm[] = Array.isArray(termsData) ? termsData : termsData?.terms || []
          setTerms(list)
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (discipline) {
      document.title = `${discipline.name} - 同物异名`
    }
  }, [discipline])

  return (
    <div className="min-h-screen bg-warm-bg">
      <Navbar onSearch={() => {}} onRandom={() => {}} onFilterDiscipline={() => {}} />

      <main className="pt-20 pb-10">
        {loading ? (
          <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-20 text-center text-warm-text">
            加载中...
          </div>
        ) : error ? (
          <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-20 text-center">
            <p className="text-warm-text mb-4">加载失败: {error}</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 rounded-lg bg-disc-econ text-white font-medium hover:bg-disc-econ/90 transition-colors"
            >
              返回首页
            </button>
          </div>
        ) : !discipline ? (
          <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-20 text-center">
            <h1 className="text-2xl font-bold text-warm-dark mb-4 font-display">学科未找到</h1>
            <p className="text-warm-text mb-6">你访问的学科分类不存在。</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 rounded-lg bg-disc-econ text-white font-medium hover:bg-disc-econ/90 transition-colors"
            >
              返回首页
            </button>
          </div>
        ) : (
          <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
            {/* 学科标题 */}
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-warm-dark font-display flex items-center gap-3">
                <span
                  className="w-1.5 h-10 rounded-full"
                  style={{ backgroundColor: discipline.color || '#6B7D5E' }}
                />
                {discipline.name}
              </h1>
              {discipline.description && (
                <p className="mt-3 text-warm-text pl-5">{discipline.description}</p>
              )}
              <p className="mt-2 text-sm text-warm-text/70 pl-5">共 {terms.length} 个词条</p>
            </div>

            {/* 学科专属概念关系图谱 */}
            <section className="mb-10">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xl font-bold text-warm-dark font-display flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: discipline.color || '#6B7D5E' }}
                  />
                  「{discipline.name}」的概念关系图谱
                </h2>
                <span className="text-xs text-warm-text/70">只显示该学科内部的词条与关系</span>
              </div>
              <ConceptGraph discipline={id} subtitle={`${discipline.name} 内关系：`} />
            </section>

            {/* 词条列表 */}
            {terms.length === 0 ? (
              <div className="text-center py-16 text-warm-text">
                <p>该学科下暂时没有词条。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {terms.map((term, i) => (
                  <TermCard key={term.id} entry={term} index={i} />
                ))}
              </div>
            )}

            {/* 学科专属延伸资源 */}
            {id === '计算机' && (
              <section className="mt-14">
                <div className="flex items-baseline justify-between mb-5">
                  <h2 className="text-xl font-bold text-warm-dark font-display flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-disc-cs" />
                    延伸推荐资源
                  </h2>
                  <span className="text-xs text-warm-text/70">适合深入学习的高质量站外资源</span>
                </div>
                <a
                  href="https://paperswithcode.co/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group rounded-2xl border border-warm-border bg-white/60 hover:bg-white transition-all duration-300 p-6 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-5">
                    <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-disc-cs to-disc-cs/70 flex items-center justify-center text-white text-2xl shadow-sm group-hover:scale-105 transition-transform">
                      📄
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-warm-dark group-hover:text-disc-cs transition-colors">
                          Papers with Code
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-disc-cs/10 text-disc-cs font-medium border border-disc-cs/20">
                          论文 · 代码 · 基准
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-warm-border/60 text-warm-text/80">
                          paperswithcode.co
                        </span>
                      </div>
                      <p className="mt-2 text-warm-text text-sm leading-relaxed">
                        机器学习与 AI 领域最全的「论文 + 官方代码实现 + 数据集 +
                        基准榜单」汇总平台。 从 Transformer、扩散模型到强化学习，每条
                        SOTA（当前最优）结果都有可复现的代码和完整评测数据，
                        是计算机方向入门前沿研究、复现实验、对比模型效果的首选工具站。
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-warm-text/70">
                        <span className="inline-flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          海量论文 + 代码对应
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                          </svg>
                          SOTA 基准排行榜
                        </span>
                        <span className="inline-flex items-center gap-1 text-disc-cs/90 font-medium group-hover:translate-x-0.5 transition-transform">
                          前往访问
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14 5l7 7m0 0l-7 7m7-7H3"
                            />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              </section>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
