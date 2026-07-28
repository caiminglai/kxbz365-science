import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Theater, ChevronRight, Lightbulb } from 'lucide-react'
import { getScenarios } from '@/api'
import type { Scenario } from '@/api/types'

export default function ScenarioReveal() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 加载情景数据
  useEffect(() => {
    ;(async () => {
      try {
        const data = await getScenarios()
        setScenarios(data)
      } catch (err) {
        setError('加载情景数据失败')
        console.error('Failed to load scenarios:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const nextScenario = () => {
    if (scenarios.length === 0) return
    setCurrentIndex((prev) => (prev + 1) % scenarios.length)
  }

  const speakerColors: Record<string, string> = {
    医生: '#A45D6A',
    销售: '#B8783A',
    领导: '#7B6BA0',
    CEO: '#4A9B8E',
    新闻: '#5B7BA0',
    HR: '#6B7B5E',
    患者: '#1A1A2E',
    买家: '#1A1A2E',
    员工: '#1A1A2E',
    投资人: '#1A1A2E',
    观众: '#1A1A2E',
    真相: '#D4853B',
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-warm-border p-10 text-center">
        <p className="text-warm-text">加载情景数据...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-warm-border p-10 text-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (scenarios.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-warm-border p-10 text-center">
        <p className="text-warm-text">暂无情景数据</p>
      </div>
    )
  }

  const scenario = scenarios[currentIndex]

  return (
    <div className="relative">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-warm-dark font-display flex items-center gap-2">
          <Theater className="w-5 h-5 text-warm-accent" />
          忽悠情景还原
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-warm-text">
            {currentIndex + 1} / {scenarios.length}
          </span>
          <button
            onClick={nextScenario}
            className="text-sm text-warm-accent hover:underline flex items-center gap-1"
          >
            下一个 <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 场景标签 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={scenario.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-xl border border-warm-border overflow-hidden"
        >
          {/* 场景标题 */}
          <div className="px-5 py-3 border-b border-warm-border bg-warm-accent/5">
            <span className="text-sm font-medium text-warm-accent">场景：{scenario.scene}</span>
          </div>

          {/* 对话 */}
          <div className="p-5 space-y-4">
            {scenario.dialogue.map((line, i) => (
              <motion.div
                key={`${line.speaker}-${line.text.slice(0, 20)}`}
                initial={{ opacity: 0, x: line.speaker === '真相' ? 0 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15, duration: 0.3 }}
                className={`flex ${line.speaker === '真相' ? 'justify-center' : 'items-start gap-3'}`}
              >
                {line.speaker !== '真相' && (
                  <>
                    <div className="flex-shrink-0">
                      <span
                        className="inline-block px-2.5 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: speakerColors[line.speaker] || '#6B6B7B' }}
                      >
                        {line.speaker}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-warm-dark leading-relaxed">
                        {line.highlight ? (
                          <>
                            {line.text.split(line.highlight).map((part, idx, arr) => (
                              <span key={idx}>
                                {part}
                                {idx < arr.length - 1 && (
                                  <span className="bg-warm-accent/20 px-1 rounded font-medium">
                                    {line.highlight}
                                  </span>
                                )}
                              </span>
                            ))}
                          </>
                        ) : (
                          line.text
                        )}
                      </p>
                    </div>
                  </>
                )}

                {line.speaker === '真相' && (
                  <div className="w-full bg-warm-bg rounded-lg p-4 border-l-4 border-warm-accent">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-warm-accent" />
                      <span className="text-sm font-semibold text-warm-accent">真相大白</span>
                    </div>
                    <p className="text-sm text-warm-dark leading-relaxed">{line.text}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* 教训 */}
          <div className="px-5 py-3 border-t border-warm-border bg-green-50/50">
            <p className="text-sm">
              <span className="font-medium text-green-700">防忽悠心得：</span>
              <span className="text-green-600"> {scenario.lesson}</span>
            </p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* 指示器 */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {scenarios.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`w-2 h-2 rounded-full transition-colors ${i === currentIndex ? 'bg-warm-accent' : 'bg-warm-border'}`}
          />
        ))}
      </div>
    </div>
  )
}
