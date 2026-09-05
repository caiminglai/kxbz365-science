import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck, GitCompare } from 'lucide-react'
import type { TermEntry } from '@/types'
import { DISCIPLINES } from '@/types'
import type { APITerm } from '@/api/types'
import { useFavorites } from '@/hooks/useFavorites'
import ShareCard from '@/components/ShareCard'

// 统一词条数据格式
interface UnifiedTerm {
  id: string
  discipline: string
  name: string
  translation: string
  essence: string
  tip: string
  aliases?: { discipline: string; name: string }[]
  hot?: boolean
}

// 适配函数：支持TermEntry和APITerm两种格式
function adaptTerm(entry: TermEntry | APITerm): UnifiedTerm {
  // 判断是哪种格式 - APITerm 有 hot: number, TermEntry 有 hot?: boolean
  const asApi = entry as APITerm
  const asTerm = entry as TermEntry
  const isApi = typeof asApi.hot === 'number'
  return {
    id: entry.id,
    discipline: entry.discipline,
    name: entry.name,
    translation: entry.translation,
    essence: entry.essence,
    tip: entry.tip,
    aliases: asApi.aliases || asTerm.aliases,
    hot: isApi ? asApi.hot === 1 : asTerm.hot,
  }
}

interface TermCardProps {
  entry: TermEntry | APITerm
  index: number
  highlightId?: string | null
}

export default function TermCard({ entry, index, highlightId }: TermCardProps) {
  const term = adaptTerm(entry)
  const discipline = DISCIPLINES.find((d) => d.id === term.discipline)
  const isHighlighted = highlightId === term.id
  const { isFavorite, toggleFavorite } = useFavorites()
  const favored = isFavorite(term.id)

  const handleToggleFav = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite({
      id: term.id,
      name: term.name,
      translation: term.translation,
      discipline: term.discipline,
      essence: term.essence,
      tip: term.tip,
    })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.5), ease: 'easeOut' }}
      className={`
        relative bg-white dark:bg-warm-card rounded-xl p-4 sm:p-5 border border-warm-border
        transition-all duration-250
        hover:-translate-y-1 hover:shadow-card
        ${isHighlighted ? 'animate-pulse' : ''}
      `}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        ...(isHighlighted
          ? { boxShadow: '0 0 0 3px rgba(212, 133, 59, 0.3)', borderColor: '#D4853B' }
          : {}),
      }}
      onMouseEnter={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.borderColor = discipline?.color + '80' || '#E5E2DA'
        }
      }}
      onMouseLeave={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.borderColor = '#E5E2DA'
        }
      }}
    >
      {/* 顶部标签行 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: discipline?.color }}
          />
          <span
            className="text-xs font-medium text-warm-text dark:text-warm-text"
            style={{ color: discipline?.color }}
          >
            {discipline?.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {term.hot && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-warm-bg dark:bg-warm-bg text-warm-text">
              热门
            </span>
          )}
          <ShareCard
            term={{
              name: term.name,
              translation: term.translation,
              essence: term.essence,
              discipline: term.discipline,
              disciplineName: discipline?.name,
            }}
          />
          <button
            onClick={handleToggleFav}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              favored
                ? 'text-warm-accent bg-warm-accent/10'
                : 'text-warm-text hover:text-warm-accent hover:bg-warm-accent/10'
            }`}
            title={favored ? '取消收藏' : '添加收藏'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={favored ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 术语名称 */}
      <h3 className="text-xl font-semibold text-warm-dark dark:text-warm-text mt-2 font-display">
        {term.name}
      </h3>

      {/* 人话翻译 - 干净的方案2：橙色箭头 + 深色粗体 */}
      {term.translation && term.translation.trim() !== '' && (
        <div className="mt-3 flex items-start gap-2">
          <ArrowRight className="w-4 h-4 text-warm-accent flex-shrink-0 mt-1" />
          <span className="text-base font-semibold text-warm-accent leading-snug">
            {term.translation}
          </span>
        </div>
      )}

      {/* 跨学科别名 - 增强视觉 */}
      {(() => {
        // 过滤空值脏数据：学科名和别名都必须是非空字符串
        const validAliases = (term.aliases || []).filter(
          (a) =>
            a &&
            typeof a.name === 'string' &&
            a.name.trim() !== '' &&
            typeof a.discipline === 'string' &&
            a.discipline.trim() !== '',
        )
        if (validAliases.length === 0) return null
        return (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <GitCompare className="w-3.5 h-3.5 text-warm-text" />
              <span className="text-xs font-medium text-warm-text">跨学科别名</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {validAliases.map((alias) => {
                const aliasDiscipline = DISCIPLINES.find((d) => d.id === alias.discipline.trim())
                const discColor = aliasDiscipline?.color || '#8B7D6B'
                const discLabel = aliasDiscipline?.name || alias.discipline.trim()
                const aliasName = alias.name.trim()
                return (
                  <span
                    key={`${alias.discipline}-${alias.name}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border bg-emerald-50/70 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50"
                  >
                    <span
                      className="inline-flex items-center text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md whitespace-nowrap"
                      style={{
                        backgroundColor: `${discColor}30`,
                        color: discColor,
                      }}
                    >
                      {discLabel}
                    </span>
                    <span className="font-semibold text-warm-dark dark:text-warm-text leading-none">
                      {aliasName}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 本质解释 */}
      <p className="text-sm text-warm-text mt-3 leading-relaxed dark:text-warm-text">
        {term.essence}
      </p>

      {/* 防忽悠提示 */}
      <div className="mt-3 pt-3 border-t border-dashed border-warm-border">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-disc-law flex-shrink-0 mt-0.5" />
          <span className="text-[13px] text-disc-law italic leading-relaxed">{term.tip}</span>
        </div>
      </div>
    </motion.div>
  )
}
