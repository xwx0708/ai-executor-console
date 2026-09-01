// ============================================================
// 通用数据获取 Hook：自动轮询 + 监听 Mock 引擎变更事件
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribe } from '@/services/store'

interface UseQueryOptions {
  /** 轮询间隔（毫秒），不传则不轮询 */
  interval?: number
}

export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = [], opts: UseQueryOptions = {}) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const value = await fetcherRef.current()
      setData(value)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload(true)
    const unsub = subscribe(() => reload())
    let timer: ReturnType<typeof setInterval> | undefined
    if (opts.interval) timer = setInterval(() => reload(), opts.interval)
    return () => {
      unsub()
      if (timer) clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload }
}
