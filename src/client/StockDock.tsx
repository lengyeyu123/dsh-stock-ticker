/**
 * 浮层容器。
 *
 * 常驻挂载在 document.body 上（不受 shell 重渲染影响），负责：
 *   1. 自选行情的轮询循环（面板关着也继续刷新，侧栏按钮才有实时数字）
 *   2. 面板开关时的分时拉取
 *   3. Esc / 点击外部关闭
 */
import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { QuoteClient } from './api.ts'
import type { StockStore } from './store.ts'
import { StockPanel } from './StockPanel.tsx'

export interface StockDockProps {
  store: StockStore
  client: QuoteClient
}

/**
 * 轮询容器。
 * @param props - store 与行情客户端。
 * @returns 展开时的浮层面板。
 */
export function StockDock({ store, client }: StockDockProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const watchKey = state.watchlist.join(',')

  // 报价轮询：watchlist 或刷新间隔变化时重建循环。
  useEffect(() => {
    let cancelled = false
    let timer = 0
    const codes = watchKey === '' ? [] : watchKey.split(',')

    const schedule = (): void => {
      if (cancelled) return
      timer = window.setTimeout(() => { void tick() }, store.getState().intervalMs)
    }

    const tick = async (): Promise<void> => {
      if (cancelled) return
      if (codes.length === 0) {
        schedule()
        return
      }
      // 窗口不可见时跳过网络请求，只维持计时。
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule()
        return
      }
      store.actions.setLoading(true)
      try {
        const quotes = await client.quotes(codes)
        if (!cancelled) store.actions.applyQuotes(quotes, Date.now())
      } catch (error) {
        if (!cancelled) store.actions.setError(error instanceof Error ? error.message : '行情请求失败')
      }
      schedule()
    }

    void tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [watchKey, state.intervalMs, client, store])

  // 展开时把面板贴到侧栏按钮右侧；拿不到按钮几何时退回左下角默认位。
  useEffect(() => {
    if (!state.open) return
    const trigger = document.querySelector('[data-dsh-stock-trigger]')
    if (trigger === null) return
    const rect = trigger.getBoundingClientRect()
    if (rect.width <= 0) return
    const left = Math.min(Math.max(8, rect.right + 8), window.innerWidth - 200)
    const bottom = Math.min(Math.max(8, window.innerHeight - rect.bottom), window.innerHeight - 80)
    store.actions.setPosition(left, bottom)
  }, [state.open, store])

  // Esc 关闭 + 点击面板外部关闭。
  useEffect(() => {
    if (!state.open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') store.actions.close()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-dsh-stock-panel]') !== null) return
      if (target.closest('[data-dsh-stock-trigger]') !== null) return
      store.actions.close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [state.open, store])

  if (!state.open || typeof document === 'undefined') return null

  return createPortal(
    <StockPanel store={store} client={client} variant="popover" onClose={() => { store.actions.close() }} />,
    document.body,
  )
}
