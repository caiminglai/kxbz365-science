import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router'
import { useDisciplines } from '@/hooks/useDisciplines'
import FilterPill from '@/components/FilterPill'
import { SEARCH_DEBOUNCE_MS, SEARCH_CLICK_OUTSIDE_DELAY_MS } from '@/lib/utils'
import { searchTerms } from '@/api/services'
import type { SearchResult } from '@/api/types'

const SEARCH_HISTORY_KEY = 'search_history'
const MAX_HISTORY = 8

const HOT_SEARCH_TERMS = [
  '人工智能',
  '涌现',
  '对齐',
  '熵',
  '纳什均衡',
  '梯度下降',
  '贝叶斯',
  '边际效应',
]

interface SearchSuggestion {
  id: string
  name: string
  translation: string
  discipline: string
  score?: number
  highlights?: { field: string; text: string }[]
}

// API 搜索结果项类型已迁移到 @/api/types (SearchResult)

interface SearchSectionProps {
  query: string
  onQueryChange: (query: string) => void
  activeFilter: string | 'all'
  onFilterChange: (filter: string | 'all') => void
  onSearch?: () => void
  onSelectSuggestion?: (suggestion: SearchSuggestion) => void
}

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.slice(0, MAX_HISTORY)
    return []
  } catch {
    return []
  }
}

function writeHistory(items: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
  } catch {
    // ignore
  }
}

export default function SearchSection({
  query,
  onQueryChange,
  activeFilter,
  onFilterChange,
  onSearch,
  onSelectSuggestion,
}: SearchSectionProps) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>(() => readHistory())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchedQueryRef = useRef<string>('')
  const navigate = useNavigate()

  const { disciplines } = useDisciplines()

  const getDisciplineName = (id: string) => {
    const discipline = disciplines.find((d) => d.id === id)
    return discipline?.name || id
  }

  const getDisciplineColor = (id: string) => {
    const discipline = disciplines.find((d) => d.id === id)
    return discipline?.color || '#8B7D6B'
  }

  // 将 Meilisearch 高亮文本（含 <em> 标签）渲染为 React 元素
  const renderHighlighted = (highlightText: string | undefined, fallback: string) => {
    if (!highlightText) return <>{fallback}</>
    // 按 <em> 和 </em> 分割
    const parts = highlightText.split(/(<\/?em>)/)
    let inEm = false
    return (
      <>
        {parts.map((part, i) => {
          if (part === '<em>') {
            inEm = true
            return null
          }
          if (part === '</em>') {
            inEm = false
            return null
          }
          if (!part) return null
          return inEm ? (
            <em key={i} className="not-italic text-warm-accent font-semibold">
              {part}
            </em>
          ) : (
            <span key={i}>{part}</span>
          )
        })}
      </>
    )
  }

  // 获取某字段的高亮文本
  const getHighlight = (suggestion: SearchSuggestion, field: string) => {
    return suggestion.highlights?.find((h) => h.field === field)?.text
  }

  const addToHistory = useCallback((term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    setSearchHistory((prev) => {
      const filtered = prev.filter((h) => h.toLowerCase() !== trimmed.toLowerCase())
      const next = [trimmed, ...filtered].slice(0, MAX_HISTORY)
      writeHistory(next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setSearchHistory([])
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY)
    } catch {
      // ignore
    }
  }, [])

  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSuggestions([])
      return
    }
    if (trimmed === lastFetchedQueryRef.current) {
      return
    }
    lastFetchedQueryRef.current = trimmed

    setIsLoading(true)
    setHasSearched(true)
    try {
      const data = await searchTerms(trimmed, 8)
      if (data.results) {
        setSuggestions(
          data.results.map((item: SearchResult) => ({
            id: item.term.id,
            name: item.term.name,
            translation: item.term.translation,
            discipline: item.term.discipline as string,
            score: item.score,
            highlights: item.highlights,
          })),
        )
      } else {
        setSuggestions([])
      }
    } catch {
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    const trimmed = query.trim()
    if (!trimmed) {
      setSuggestions([])
      setHasSearched(false)
      lastFetchedQueryRef.current = ''
      return
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, fetchSuggestions])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    addToHistory(suggestion.name)
    onQueryChange(suggestion.name)
    setShowSuggestions(false)
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion)
    }
  }

  const handleHistoryClick = (term: string) => {
    addToHistory(term)
    onQueryChange(term)
    if (onSearch) {
      onSearch()
    }
    if (searchInputRef.current) {
      searchInputRef.current.blur()
    }
  }

  const handleHotClick = (term: string) => {
    addToHistory(term)
    onQueryChange(term)
    if (onSearch) {
      onSearch()
    }
    if (searchInputRef.current) {
      searchInputRef.current.blur()
    }
  }

  const handleInputFocus = () => {
    setShowSuggestions(true)
  }

  const handleInputBlur = () => {
    setTimeout(() => setShowSuggestions(false), SEARCH_CLICK_OUTSIDE_DELAY_MS)
  }

  const trimmedQuery = query.trim()
  const showEmptyState =
    hasSearched && !isLoading && trimmedQuery.length > 0 && suggestions.length === 0
  const showHistoryOrHot = !trimmedQuery && showSuggestions

  return (
    <section id="search-section" className="bg-warm-bg dark:bg-warm-bg py-8 sm:py-10 px-4 lg:px-6">
      <motion.div
        className="max-w-[700px] mx-auto relative"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-text dark:text-warm-text" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (trimmedQuery) {
                  addToHistory(trimmedQuery)
                }
                if (onSearch) {
                  onSearch()
                }
              }
            }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder="搜索任何术语、缩写或人话翻译..."
            className="w-full h-14 pl-12 pr-12 rounded-xl bg-warm-bg dark:bg-warm-bg border-2 border-warm-border
              text-base text-warm-dark dark:text-warm-text placeholder:text-warm-text/60 dark:placeholder:text-warm-text/50
              focus:outline-none focus:border-warm-accent focus:ring-4 focus:ring-warm-accent/15
              transition-all duration-200"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
            {isLoading ? <Loader2 className="w-5 h-5 text-warm-accent animate-spin" /> : null}
          </div>
        </div>

        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              ref={suggestionsRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute w-full mt-2 bg-warm-card dark:bg-warm-card rounded-xl shadow-lg border border-warm-border z-50 overflow-hidden suggestions-list"
            >
              {/* 搜索建议 */}
              {suggestions.length > 0 && (
                <div>
                  <div className="px-4 pt-3 pb-1 text-xs text-warm-text font-medium">搜索结果</div>
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={suggestion.id}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-warm-bg dark:hover:bg-warm-bg cursor-pointer transition-colors"
                      style={{
                        borderBottom:
                          index < suggestions.length - 1 ? '1px solid var(--warm-border)' : 'none',
                      }}
                    >
                      <span
                        className="px-2 py-1 text-xs rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: `${getDisciplineColor(suggestion.discipline)}20`,
                          color: getDisciplineColor(suggestion.discipline),
                        }}
                      >
                        {getDisciplineName(suggestion.discipline)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-warm-dark dark:text-warm-text font-medium truncate">
                          {renderHighlighted(getHighlight(suggestion, 'name'), suggestion.name)}
                        </div>
                        <div className="text-sm text-warm-text truncate">
                          {renderHighlighted(
                            getHighlight(suggestion, 'translation'),
                            suggestion.translation,
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 无结果提示 */}
              {showEmptyState && (
                <div className="px-4 py-8 text-center">
                  <div className="text-3xl mb-2 opacity-50">🔍</div>
                  <div className="text-sm font-medium text-warm-dark dark:text-warm-text mb-1">
                    没有找到 "{trimmedQuery}" 的匹配结果
                  </div>
                  <div className="text-xs text-warm-text mb-4">你是不是在找...？</div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {HOT_SEARCH_TERMS.slice(0, 4).map((term) => (
                      <button
                        key={term}
                        onClick={() => handleHotClick(term)}
                        className="px-3 py-1.5 text-xs rounded-full bg-warm-bg dark:bg-warm-bg text-warm-text dark:text-warm-text hover:text-warm-accent hover:bg-warm-accent/10 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 搜索框为空时，显示历史和热门 */}
              {showHistoryOrHot && (
                <div>
                  {searchHistory.length > 0 && (
                    <div className="px-4 pt-3 pb-2 border-b border-warm-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-warm-text">搜索历史</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            clearHistory()
                          }}
                          className="text-xs text-warm-text hover:text-warm-accent transition-colors"
                        >
                          清除
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {searchHistory.map((term) => (
                          <button
                            key={term}
                            onClick={() => handleHistoryClick(term)}
                            className="px-3 py-1.5 text-xs rounded-full bg-warm-bg dark:bg-warm-bg text-warm-dark dark:text-warm-text hover:text-warm-accent hover:bg-warm-accent/10 transition-colors"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="px-4 pt-3 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-warm-text">热门搜索</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warm-accent/15 text-warm-accent">
                        HOT
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {HOT_SEARCH_TERMS.map((term) => (
                        <button
                          key={term}
                          onClick={() => handleHotClick(term)}
                          className="px-3 py-1.5 text-xs rounded-full bg-warm-bg dark:bg-warm-bg text-warm-dark dark:text-warm-text hover:text-warm-accent hover:bg-warm-accent/10 transition-colors"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
          <FilterPill
            key="all"
            discipline="all"
            isActive={activeFilter === 'all'}
            onClick={() => {
              onFilterChange('all')
              navigate('/')
            }}
          />
          {disciplines.map((d) => (
            <FilterPill
              key={d.id}
              discipline={d.id}
              isActive={activeFilter === d.id}
              onClick={() => navigate(`/discipline/${d.id}`)}
            />
          ))}
        </div>
      </motion.div>
    </section>
  )
}
