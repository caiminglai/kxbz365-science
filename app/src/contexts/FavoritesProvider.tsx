import { createContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

const FAVORITES_KEY = 'term_favorites'
const MAX_FAVORITES = 100

export interface FavoriteItem {
  id: string
  name: string
  translation: string
  discipline: string
  essence?: string
  tip?: string
}

interface FavoritesContextValue {
  favorites: FavoriteItem[]
  favoritesCount: number
  isFavorite: (id: string) => boolean
  addFavorite: (item: FavoriteItem) => void
  removeFavorite: (id: string) => void
  toggleFavorite: (item: FavoriteItem) => void
  clearFavorites: () => void
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(null)

function readFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    return []
  } catch {
    return []
  }
}

function writeFavorites(items: FavoriteItem[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => readFavorites())
  const favoritesRef = useRef(favorites)

  // 同步 ref（放在 effect 中，避免渲染期间更新 ref）
  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])

  // 单一 storage 事件监听（跨标签页同步）
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === FAVORITES_KEY) {
        setFavorites(readFavorites())
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites],
  )

  const addFavorite = useCallback((item: FavoriteItem) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === item.id)) return prev
      const next = [item, ...prev].slice(0, MAX_FAVORITES)
      writeFavorites(next)
      return next
    })
  }, [])

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id)
      writeFavorites(next)
      return next
    })
  }, [])

  // 修复竞态：使用 ref 读取最新值，避免闭包过期
  const toggleFavorite = useCallback(
    (item: FavoriteItem) => {
      const current = favoritesRef.current
      const exists = current.some((f) => f.id === item.id)
      if (exists) {
        removeFavorite(item.id)
      } else {
        addFavorite(item)
      }
    },
    [addFavorite, removeFavorite],
  )

  const clearFavorites = useCallback(() => {
    setFavorites([])
    try {
      localStorage.removeItem(FAVORITES_KEY)
    } catch {
      // ignore
    }
  }, [])

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        favoritesCount: favorites.length,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        clearFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}
