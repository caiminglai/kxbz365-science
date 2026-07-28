import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getComparisons } from '@/api/services'
import type { Comparison } from '@/api/types'

export default function CrossDisciplineSection() {
  const [loading, setLoading] = useState(true)
  const [comparisons, setComparisons] = useState<Comparison[]>([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const data = await getComparisons()
        if (mounted) {
          const list = Array.isArray(data) ? data : []
          setComparisons(list)
        }
      } catch {
        if (mounted) setComparisons([])
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <section className="py-12 sm:py-16 px-4 lg:px-6">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-6 sm:mb-8"
        >
          <h2 className="text-xl sm:text-2xl md:text-[28px] font-bold text-warm-dark font-display">
            跨学科概念对比
          </h2>
          <p className="text-sm sm:text-[15px] text-warm-text mt-2 sm:mt-3 max-w-[700px]">
            同一个本质在不同学科的不同外衣——帮助你从第一性原理看问题
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-warm-bg to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-warm-bg to-transparent z-10 pointer-events-none" />

          {loading ? (
            <div className="text-center py-12 text-warm-text">加载中...</div>
          ) : comparisons.length === 0 ? (
            <div className="text-center py-12 text-warm-text bg-warm-bg/30 rounded-xl border border-dashed border-warm-border">
              暂无跨学科对比
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
              {comparisons.map((c, index) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: Math.min(index * 0.1, 0.6), ease: 'easeOut' }}
                  className="flex-shrink-0 w-[calc(100vw-2rem)] sm:w-[320px] md:w-[320px] bg-white rounded-xl p-5 sm:p-6 border border-warm-border"
                >
                  <div
                    className="h-1 w-full rounded-full mb-4"
                    style={{
                      background: `linear-gradient(to right, #D4853B, #6B7D5A)`,
                    }}
                  />
                  <h4 className="text-base font-semibold text-warm-dark mb-4 font-display">
                    {c.title}
                  </h4>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-start gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ backgroundColor: '#D4853B' }}
                      />
                      <div>
                        <span className="text-xs text-warm-text">{c.concept_a_discipline}</span>
                        <div className="text-sm text-warm-dark">
                          <span className="font-semibold">{c.concept_a_name}</span>
                          <span className="text-warm-text"> - {c.concept_a_plain}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ backgroundColor: '#6B7D5A' }}
                      />
                      <div>
                        <span className="text-xs text-warm-text">{c.concept_b_discipline}</span>
                        <div className="text-sm text-warm-dark">
                          <span className="font-semibold">{c.concept_b_name}</span>
                          <span className="text-warm-text"> - {c.concept_b_plain}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-warm-text leading-relaxed border-t border-warm-border pt-3">
                    {c.summary}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
