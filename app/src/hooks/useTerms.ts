import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react'
import { getTerms } from '../api/services'
import type { APITerm } from '../api/types'

/**
 * 模块级缓存（所有组件共享同一份词条数据）
 * - 避免多个组件并发发起重复请求
 * - 数据量较大（几百到上千条），缓存意义明显
 * - TTL 2 分钟 — 词条内容变化频率低
 */
const CACHE_TTL = 2 * 60 * 1000
let _cachedData: APITerm[] = []
let _cachedAt = 0
let _inflight: Promise<APITerm[]> | null = null
const _listeners = new Set<() => void>()

function _notify() {
  _listeners.forEach((fn) => fn())
}

async function _fetchAndCache(force = false): Promise<APITerm[]> {
  if (!force && _inflight) return _inflight

  if (!force && _cachedData.length > 0 && Date.now() - _cachedAt < CACHE_TTL) {
    return _cachedData
  }

  _inflight = (async () => {
    const result = await getTerms(1, 1000)
    _cachedData = result.terms || result
    _cachedAt = Date.now()
    _notify()
    return _cachedData
  })()

  try {
    return await _inflight
  } finally {
    _inflight = null
  }
}

export function clearTermsCache() {
  _cachedData = []
  _cachedAt = 0
  _inflight = null
  _notify()
}

export function useTerms() {
  const [loading, setLoading] = useState<boolean>(_cachedData.length === 0)
  const [error, setError] = useState<string | null>(null)

  const subscribe = useCallback((cb: () => void) => {
    _listeners.add(cb)
    return () => _listeners.delete(cb)
  }, [])

  const getSnapshot = useCallback(() => {
    return _cachedData
  }, [])

  const terms = useSyncExternalStore<APITerm[]>(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    let cancelled = false
    if (_cachedData.length > 0 && Date.now() - _cachedAt < CACHE_TTL) {
      setLoading(false)
      return
    }
    setLoading(true)
    ;(async () => {
      try {
        await _fetchAndCache()
        if (!cancelled) setLoading(false)
      } catch (err) {
        console.error('Failed to fetch terms:', err)
        if (!cancelled) {
          setError('获取词条列表失败')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      await _fetchAndCache(true)
    } catch (err) {
      console.error('Failed to refresh terms:', err)
      setError('获取词条列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 按学科分组 - 使用 useMemo 缓存，避免每次渲染重新计算
  const termsByDiscipline = useMemo(() => {
    return terms.reduce(
      (acc, term) => {
        const discipline = term.discipline
        if (!acc[discipline]) {
          acc[discipline] = []
        }
        acc[discipline].push(term)
        return acc
      },
      {} as Record<string, APITerm[]>,
    )
  }, [terms])

  return {
    terms,
    termsByDiscipline,
    loading,
    error,
    refresh,
  }
}
