/**
 * 浏览器半区的状态源。
 *
 * 手写一个极小的可观察 store（不引入 zustand，减少与 shell 模块表的耦合），
 * 组件用 useSyncExternalStore 订阅整个 state 快照。
 */
import type { IntradaySeries, Quote } from '../core/types.ts'
import { normalizeSymbol } from '../core/symbol.ts'

/** 面板当前展示的视图。 */
export type PanelView = 'list' | 'detail'

/** 上方价格区的渲染方式。 */
export type ChartMode = 'line' | 'bar'

export interface StockState {
  /** 浮层面板是否展开。 */
  open: boolean
  view: PanelView
  /** 详情视图里的标的代码。 */
  selected: string | null
  /** 自选股代码列表（有序）。 */
  watchlist: string[]
  /** 轮询间隔，毫秒。 */
  intervalMs: number
  /** code → 快照。 */
  quotes: Record<string, Quote>
  /** 最近一次成功刷新的时间戳。 */
  updatedAt: number
  loading: boolean
  error: string | null
  /** 当前标的的分时序列。 */
  series: IntradaySeries | null
  seriesLoading: boolean
  seriesError: string | null
  chartMode: ChartMode
  /** 面板左上角位置（px）。 */
  position: { left: number; bottom: number }
}

export interface StockActions {
  open(): void
  close(): void
  toggle(): void
  select(code: string): void
  back(): void
  add(input: string): string | null
  remove(code: string): void
  setIntervalMs(ms: number): void
  setChartMode(mode: ChartMode): void
  applyQuotes(quotes: readonly Quote[], at: number): void
  setLoading(loading: boolean): void
  setError(message: string | null): void
  setSeries(series: IntradaySeries | null): void
  setSeriesLoading(loading: boolean): void
  setSeriesError(message: string | null): void
  setPosition(left: number, bottom: number): void
}

export interface StockStore {
  getState(): StockState
  subscribe(listener: () => void): () => void
  actions: StockActions
}

const STORAGE_KEY = 'dsh.stock-ticker.prefs.v1'

/** 首次安装时的默认自选：一个指数 + 三地各一只龙头。 */
const DEFAULT_WATCHLIST: readonly string[] = ['sh000001', 'sh600519', 'sz300750', 'hk00700', 'usAAPL']

/** 默认轮询间隔。 */
const DEFAULT_INTERVAL_MS = 5_000

/** 可选轮询间隔。 */
export const INTERVAL_CHOICES: readonly number[] = [3_000, 5_000, 10_000, 30_000, 60_000]

interface Persisted {
  watchlist?: unknown
  intervalMs?: unknown
  chartMode?: unknown
}

/**
 * 读回上次的偏好设置，任何异常都退回默认值。
 * @returns 偏好设置。
 */
function loadPrefs(): { watchlist: string[]; intervalMs: number; chartMode: ChartMode } {
  const fallback = {
    watchlist: [...DEFAULT_WATCHLIST],
    intervalMs: DEFAULT_INTERVAL_MS,
    chartMode: 'line' as ChartMode,
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as Persisted

    const watchlist = Array.isArray(parsed.watchlist)
      ? parsed.watchlist
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeSymbol(item))
        .filter((item): item is string => item !== null)
      : []
    const intervalMs = typeof parsed.intervalMs === 'number' && INTERVAL_CHOICES.includes(parsed.intervalMs)
      ? parsed.intervalMs
      : DEFAULT_INTERVAL_MS
    const chartMode: ChartMode = parsed.chartMode === 'bar' ? 'bar' : 'line'

    return {
      watchlist: watchlist.length > 0 ? [...new Set(watchlist)] : [...DEFAULT_WATCHLIST],
      intervalMs,
      chartMode,
    }
  } catch {
    return fallback
  }
}

/**
 * 持久化偏好设置，写失败（配额 / 隐私模式）时静默忽略。
 * @param state - 当前状态。
 */
function savePrefs(state: StockState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      watchlist: state.watchlist,
      intervalMs: state.intervalMs,
      chartMode: state.chartMode,
    }))
  } catch {
    // 持久化失败不影响运行。
  }
}

/**
 * 创建一个 store 实例。
 * @returns store 与 actions。
 */
export function createStockStore(): StockStore {
  const prefs = loadPrefs()

  let state: StockState = {
    open: false,
    view: 'list',
    selected: null,
    watchlist: prefs.watchlist,
    intervalMs: prefs.intervalMs,
    quotes: {},
    updatedAt: 0,
    loading: false,
    error: null,
    series: null,
    seriesLoading: false,
    seriesError: null,
    chartMode: prefs.chartMode,
    position: { left: 16, bottom: 96 },
  }

  const listeners = new Set<() => void>()

  const emit = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // 单个订阅者异常不阻断其余订阅者。
      }
    }
  }

  const patch = (next: Partial<StockState>): void => {
    let changed = false
    for (const key of Object.keys(next) as (keyof StockState)[]) {
      if (state[key] !== next[key]) {
        changed = true
        break
      }
    }
    if (!changed) return
    state = { ...state, ...next }
    emit()
  }

  const actions: StockActions = {
    open: () => { patch({ open: true }) },
    close: () => { patch({ open: false, view: 'list' }) },
    toggle: () => { patch(state.open ? { open: false, view: 'list' } : { open: true }) },
    select: (code) => { patch({ selected: code, view: 'detail', series: null, seriesError: null }) },
    back: () => { patch({ view: 'list', series: null, seriesError: null }) },

    add: (input) => {
      const code = normalizeSymbol(input)
      if (code === null) return '无法识别的标的代码'
      if (state.watchlist.includes(code)) return '该标的已在自选中'
      if (state.watchlist.length >= 40) return '自选上限 40 只'
      const next = { ...state, watchlist: [...state.watchlist, code] }
      patch({ watchlist: next.watchlist })
      savePrefs(next)
      return null
    },

    remove: (code) => {
      const watchlist = state.watchlist.filter((item) => item !== code)
      if (watchlist.length === state.watchlist.length) return
      const quotes = { ...state.quotes }
      delete quotes[code]
      const next: StockState = {
        ...state,
        watchlist,
        quotes,
        ...(state.selected === code ? { selected: null, view: 'list' as PanelView, series: null } : {}),
      }
      patch({
        watchlist,
        quotes,
        ...(state.selected === code ? { selected: null, view: 'list' as PanelView, series: null } : {}),
      })
      savePrefs(next)
    },

    setIntervalMs: (ms) => {
      if (!INTERVAL_CHOICES.includes(ms)) return
      patch({ intervalMs: ms })
      savePrefs({ ...state, intervalMs: ms })
    },

    setChartMode: (mode) => {
      patch({ chartMode: mode })
      savePrefs({ ...state, chartMode: mode })
    },

    applyQuotes: (list, at) => {
      const quotes = { ...state.quotes }
      for (const quote of list) quotes[quote.code] = quote
      patch({ quotes, updatedAt: at, error: null, loading: false })
    },

    setLoading: (loading) => { patch({ loading }) },
    setError: (message) => { patch({ error: message, loading: false }) },
    setSeries: (series) => { patch({ series, seriesLoading: false, seriesError: null }) },
    setSeriesLoading: (loading) => { patch({ seriesLoading: loading }) },
    setSeriesError: (message) => { patch({ seriesError: message, seriesLoading: false }) },
    setPosition: (left, bottom) => { patch({ position: { left, bottom } }) },
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    actions,
  }
}
