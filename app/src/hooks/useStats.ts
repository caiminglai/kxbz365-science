import { useState, useEffect } from 'react'
import { getStats } from '../api/services'

interface StatsData {
  totalTerms: number
  mainTerms: number
  subjectTerms: number
  hotTerms: number
  totalLinks: number
  totalComparisons: number
  totalScenarios: number
  byDiscipline: Record<string, number>
}

export function useStats() {
  const [stats, setStats] = useState<StatsData | null>(null)
  // 初始值为 true（首次挂载时就需要加载），避免在 effect 中同步 setState
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchStats(): Promise<void> {
      try {
        const res = await getStats()
        if (!cancelled) {
          setStats((res?.data ?? res) as StatsData)
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err)
        if (!cancelled) {
          setError('获取统计数据失败')
          setLoading(false)
        }
      }
    }

    fetchStats()
    return () => {
      cancelled = true
    }
  }, [])

  return { stats, loading, error }
}
