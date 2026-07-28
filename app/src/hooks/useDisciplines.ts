import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { getDisciplines } from '../api/services'
import type { DisciplineData } from '../api/services'

export interface DisciplineInfo extends DisciplineData {
  description: string
}

/**
 * 模块级缓存（所有组件共享同一份学科数据）
 * - 避免多个组件并发发起重复请求
 * - TTL 5 分钟，足够学科这种几乎不变的数据
 */
const CACHE_TTL = 5 * 60 * 1000
let _cachedData: DisciplineInfo[] = []
let _cachedAt = 0
let _inflight: Promise<DisciplineInfo[]> | null = null
const _listeners = new Set<() => void>()

function _notify() {
  _listeners.forEach((fn) => fn())
}

async function _fetchAndCache(force = false): Promise<DisciplineInfo[]> {
  if (!force && _inflight) return _inflight

  if (!force && _cachedData.length > 0 && Date.now() - _cachedAt < CACHE_TTL) {
    return _cachedData
  }

  _inflight = (async () => {
    const data = await getDisciplines()
    const mapped: DisciplineInfo[] = data.map((apiItem) => ({
      id: apiItem.id,
      name: apiItem.name,
      color: apiItem.color,
      description: apiItem.description || '',
    }))
    _cachedData = mapped
    _cachedAt = Date.now()
    _notify()
    return mapped
  })()

  try {
    return await _inflight
  } finally {
    _inflight = null
  }
}

export function clearDisciplineCache() {
  _cachedData = []
  _cachedAt = 0
  _inflight = null
  _notify()
}

export function useDisciplines() {
  const [loading, setLoading] = useState<boolean>(_cachedData.length === 0)
  const [error, setError] = useState<string | null>(null)

  const subscribe = useCallback((cb: () => void) => {
    _listeners.add(cb)
    return () => {
      _listeners.delete(cb)
    }
  }, [])

  const getSnapshot = useCallback(() => {
    return _cachedData
  }, [])

  const disciplines = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

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
        console.error('Failed to fetch disciplines:', err)
        if (!cancelled) {
          setError('获取学科列表失败')
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
      console.error('Failed to refresh disciplines:', err)
      setError('获取学科列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    disciplines,
    loading,
    error,
    refresh,
  }
}

export function useDisciplineColor(disciplineId: string): string {
  const subscribe = useCallback((cb: () => void) => {
    _listeners.add(cb)
    return () => {
      _listeners.delete(cb)
    }
  }, [])

  const getSnapshot = useCallback(() => {
    const discipline = _cachedData.find((d) => d.id === disciplineId)
    return discipline?.color || '#8B7D6B'
  }, [disciplineId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useDisciplineName(disciplineId: string): string {
  const subscribe = useCallback((cb: () => void) => {
    _listeners.add(cb)
    return () => {
      _listeners.delete(cb)
    }
  }, [])

  const getSnapshot = useCallback(() => {
    const discipline = _cachedData.find((d) => d.id === disciplineId)
    return discipline?.name || disciplineId
  }, [disciplineId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
