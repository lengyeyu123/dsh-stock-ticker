/**
 * 浏览器半区的状态源。
 *
 * 手写一个极小的可观察 store（不引入 zustand，减少与 shell 模块表的耦合），
 * 组件用 useSyncExternalStore 订阅整个 state 快照。
 *
 * 偏好分成两层：
 *   - `settings`：当前生效的一组参数（刷新间隔 / 图表 / 涨跌配色 / 密度 / 侧栏轮播）
 *   - `profiles`：可命名的配置方案，用户能自建、应用、覆盖、重命名、删除
 * 两层都落在 localStorage；v1 的旧键会在首次读取时自动迁移。
 */
import type { IntradaySeries, KlinePeriod, KlineSeries, Quote } from '../core/types.ts'
import { normalizeSymbol } from '../core/symbol.ts'

/** 面板当前展示的视图。 */
export type PanelView = 'list' | 'detail' | 'settings'

/** 上方价格区的渲染方式。 */
export type ChartMode = 'line' | 'bar'

/** 详情页的图表类型：当日分时，或某个周期的 K 线。 */
export type ChartKind = 'intraday' | KlinePeriod

/** 涨跌配色：`cn` 红涨绿跌（A 股习惯），`us` 绿涨红跌。 */
export type ColorMode = 'cn' | 'us'

/** 列表密度。 */
export type Density = 'cozy' | 'compact'

/** 一组可整体套用的参数。 */
export interface Settings {
  /** 轮询间隔，毫秒。 */
  intervalMs: number
  chartMode: ChartMode
  colorMode: ColorMode
  density: Density
  /** 侧栏按钮是否轮播自选标的。 */
  rotateSidebar: boolean
}

/** 一套命名配置方案。 */
export interface Profile {
  id: string
  name: string
  /** 内置方案不可覆盖、不可删除。 */
  builtin: boolean
  settings: Settings
}

export interface StockState {
  /** 浮层面板是否展开。 */
  open: boolean
  view: PanelView
  /** 从哪个视图进的设置页，返回时回到这里。 */
  prevView: PanelView
  /** 详情视图里的标的代码。 */
  selected: string | null
  /** 自选股代码列表（有序）。 */
  watchlist: string[]
  /** 当前生效的参数。 */
  settings: Settings
  /** 内置 + 用户自建的配置方案。 */
  profiles: Profile[]
  /** 当前套用的方案 id；用户改过单项参数后仍指向原方案，由 `isProfileDirty` 判断是否偏离。 */
  activeProfileId: string | null
  /** code → 快照。 */
  quotes: Record<string, Quote>
  /** 最近一次成功刷新的时间戳。 */
  updatedAt: number
  loading: boolean
  error: string | null
  /** 手动刷新计数：变化即触发一次立即拉取。 */
  refreshNonce: number
  /** 当前标的的分时序列。 */
  series: IntradaySeries | null
  seriesLoading: boolean
  seriesError: string | null
  /** 详情页图表类型。 */
  chartKind: ChartKind
  /** 当前标的的 K 线序列。 */
  kline: KlineSeries | null
  klineLoading: boolean
  klineError: string | null
  /** 面板左上角位置（px）。 */
  position: { left: number; bottom: number }
}

export interface StockActions {
  open(): void
  close(): void
  toggle(): void
  select(code: string): void
  back(): void
  openSettings(): void
  add(input: string): string | null
  /** 批量添加：空格 / 逗号 / 顿号分隔。 */
  addMany(input: string): { added: number; failed: string[] }
  remove(code: string): void
  /** 置顶。 */
  pin(code: string): void
  /** 修改单项参数。 */
  patchSettings(patch: Partial<Settings>): void
  applyProfile(id: string): void
  /** 以当前参数新建方案。 */
  createProfile(name: string): string | null
  /** 把当前参数写回已有方案（内置方案不可写）。 */
  saveProfile(id: string): string | null
  renameProfile(id: string, name: string): string | null
  deleteProfile(id: string): string | null
  refreshNow(): void
  applyQuotes(quotes: readonly Quote[], at: number): void
  setLoading(loading: boolean): void
  setError(message: string | null): void
  setSeries(series: IntradaySeries | null): void
  setSeriesLoading(loading: boolean): void
  setSeriesError(message: string | null): void
  setChartKind(kind: ChartKind): void
  setKline(series: KlineSeries | null): void
  setKlineLoading(loading: boolean): void
  setKlineError(message: string | null): void
  setPosition(left: number, bottom: number): void
}

export interface StockStore {
  getState(): StockState
  subscribe(listener: () => void): () => void
  actions: StockActions
}

const STORAGE_KEY = 'dsh.stock-ticker.prefs.v2'

/** v1 只存了 watchlist / intervalMs / chartMode，读一次做迁移。 */
const LEGACY_KEY = 'dsh.stock-ticker.prefs.v1'

/** 首次安装时的默认自选：一个指数 + 三地各一只龙头。 */
const DEFAULT_WATCHLIST: readonly string[] = ['sh000001', 'sh600519', 'sz300750', 'hk00700', 'usAAPL']

/** 自选上限。 */
export const MAX_WATCHLIST = 40

/** 方案名长度上限。 */
export const MAX_PROFILE_NAME = 12

/** 刷新间隔的可选档位。 */
export const INTERVAL_CHOICES: readonly number[] = [3_000, 5_000, 10_000, 30_000, 60_000]

/** 自定义刷新间隔的上下限（毫秒）。 */
export const MIN_INTERVAL_MS = 1_000
export const MAX_INTERVAL_MS = 600_000

/** 出厂参数。 */
export const DEFAULT_SETTINGS: Settings = {
  intervalMs: 5_000,
  chartMode: 'line',
  colorMode: 'cn',
  density: 'cozy',
  rotateSidebar: true,
}

/**
 * 内置方案：覆盖「盯盘」「省流」两个典型场景，开箱即用。
 * 内置方案只读 —— 想改就另存为自己的方案。
 */
export const BUILTIN_PROFILES: readonly Profile[] = [
  { id: 'builtin-standard', name: '标准', builtin: true, settings: { ...DEFAULT_SETTINGS } },
  {
    id: 'builtin-intraday',
    name: '盯盘',
    builtin: true,
    settings: { intervalMs: 3_000, chartMode: 'bar', colorMode: 'cn', density: 'cozy', rotateSidebar: true },
  },
  {
    id: 'builtin-lite',
    name: '省流',
    builtin: true,
    settings: { intervalMs: 60_000, chartMode: 'line', colorMode: 'cn', density: 'compact', rotateSidebar: false },
  },
]

const DEFAULT_PROFILE_ID = 'builtin-standard'

/**
 * 把任意数值收敛到合法的刷新间隔。
 * @param value - 毫秒数。
 * @returns 合法间隔。
 */
export function clampInterval(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.intervalMs
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(value)))
}

/**
 * 两组参数是否完全一致。
 * @param a - 参数 A。
 * @param b - 参数 B。
 * @returns 一致为 true。
 */
export function sameSettings(a: Settings, b: Settings): boolean {
  return a.intervalMs === b.intervalMs
    && a.chartMode === b.chartMode
    && a.colorMode === b.colorMode
    && a.density === b.density
    && a.rotateSidebar === b.rotateSidebar
}

/**
 * 取当前套用的方案。
 * @param state - 状态。
 * @returns 方案；未套用时为 undefined。
 */
export function activeProfile(state: StockState): Profile | undefined {
  if (state.activeProfileId === null) return undefined
  return state.profiles.find((profile) => profile.id === state.activeProfileId)
}

/**
 * 当前参数是否已偏离所套用的方案。
 * @param state - 状态。
 * @returns 偏离为 true。
 */
export function isProfileDirty(state: StockState): boolean {
  const profile = activeProfile(state)
  if (profile === undefined) return false
  return !sameSettings(profile.settings, state.settings)
}

/**
 * 参数是否等于出厂设置。
 * @param settings - 参数。
 * @returns 相等为 true。
 */
export function isDefaultSettings(settings: Settings): boolean {
  return sameSettings(settings, DEFAULT_SETTINGS)
}

/**
 * 校验并规整一组来自 localStorage 的参数。
 * @param raw - 任意值。
 * @returns 合法参数；无法识别时退回出厂设置。
 */
function parseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const source = raw as Record<string, unknown>
  return {
    intervalMs: typeof source.intervalMs === 'number' ? clampInterval(source.intervalMs) : DEFAULT_SETTINGS.intervalMs,
    chartMode: source.chartMode === 'bar' ? 'bar' : 'line',
    colorMode: source.colorMode === 'us' ? 'us' : 'cn',
    density: source.density === 'compact' ? 'compact' : 'cozy',
    rotateSidebar: source.rotateSidebar !== false,
  }
}

/**
 * 校验并规整自选列表。
 * @param raw - 任意值。
 * @returns 归一化后的代码；不是数组时返回 null。
 */
function parseWatchlist(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const codes = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeSymbol(item))
    .filter((item): item is string => item !== null)
  return [...new Set(codes)].slice(0, MAX_WATCHLIST)
}

/**
 * 校验并规整用户自建方案。
 * @param raw - 任意值。
 * @returns 方案列表（只含合法的自定义方案）。
 */
function parseProfiles(raw: unknown): Profile[] {
  if (!Array.isArray(raw)) return []
  const out: Profile[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const source = item as Record<string, unknown>
    if (typeof source.id !== 'string' || typeof source.name !== 'string') continue
    const name = source.name.trim().slice(0, MAX_PROFILE_NAME)
    if (name === '' || source.id.startsWith('builtin-')) continue
    out.push({ id: source.id, name, builtin: false, settings: parseSettings(source.settings) })
  }
  return out.slice(0, 24)
}

interface Prefs {
  watchlist: string[]
  settings: Settings
  profiles: Profile[]
  activeProfileId: string
}

/**
 * 读回上次的偏好设置，任何异常都退回默认值。
 * @returns 偏好设置。
 */
function loadPrefs(): Prefs {
  const fallback: Prefs = {
    watchlist: [...DEFAULT_WATCHLIST],
    settings: { ...DEFAULT_SETTINGS },
    profiles: [],
    activeProfileId: DEFAULT_PROFILE_ID,
  }

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) raw = window.localStorage.getItem(LEGACY_KEY)
  } catch {
    return fallback
  }
  if (raw === null) return fallback

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // v1 没有 settings 字段，只有散落的 intervalMs / chartMode。
    const settings = parsed.settings === undefined
      ? parseSettings({ intervalMs: parsed.intervalMs, chartMode: parsed.chartMode })
      : parseSettings(parsed.settings)
    const watchlist = parseWatchlist(parsed.watchlist)
    const profiles = parseProfiles(parsed.profiles)
    const activeProfileId = typeof parsed.activeProfileId === 'string'
      && (profiles.some((profile) => profile.id === parsed.activeProfileId)
        || BUILTIN_PROFILES.some((profile) => profile.id === parsed.activeProfileId))
      ? parsed.activeProfileId
      : DEFAULT_PROFILE_ID

    return {
      watchlist: watchlist ?? [...DEFAULT_WATCHLIST],
      settings,
      profiles,
      activeProfileId,
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
      version: 2,
      watchlist: state.watchlist,
      settings: state.settings,
      profiles: state.profiles.filter((profile) => !profile.builtin),
      activeProfileId: state.activeProfileId,
    }))
  } catch {
    // 持久化失败不影响运行。
  }
}

/**
 * 校验方案名。
 * @param raw - 用户输入。
 * @param profiles - 已有方案。
 * @param selfId - 改名时排除自身。
 * @returns 规整后的名字；不合法时返回错误文案。
 */
function validateName(raw: string, profiles: readonly Profile[], selfId?: string): string | { error: string } {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name === '') return { error: '配置名不能为空' }
  if (name.length > MAX_PROFILE_NAME) return { error: `配置名最多 ${String(MAX_PROFILE_NAME)} 个字` }
  if (profiles.some((profile) => profile.name === name && profile.id !== selfId)) return { error: '已有同名配置' }
  return name
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
    prevView: 'list',
    selected: null,
    watchlist: prefs.watchlist,
    settings: prefs.settings,
    profiles: [...BUILTIN_PROFILES, ...prefs.profiles],
    activeProfileId: prefs.activeProfileId,
    quotes: {},
    updatedAt: 0,
    loading: false,
    error: null,
    refreshNonce: 0,
    series: null,
    seriesLoading: false,
    seriesError: null,
    chartKind: 'intraday',
    kline: null,
    klineLoading: false,
    klineError: null,
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

  /** 改完参数后统一落盘。 */
  const commit = (next: Partial<StockState>): void => {
    patch(next)
    savePrefs(state)
  }

  const actions: StockActions = {
    open: () => { patch({ open: true }) },
    close: () => { patch({ open: false, view: 'list', prevView: 'list' }) },
    toggle: () => { patch(state.open ? { open: false, view: 'list', prevView: 'list' } : { open: true }) },
    select: (code) => {
      patch({ selected: code, view: 'detail', series: null, seriesError: null, kline: null, klineError: null })
    },
    back: () => {
      const view = state.view === 'settings' ? state.prevView : 'list'
      patch(view === 'detail'
        ? { view }
        : { view, series: null, seriesError: null, kline: null, klineError: null })
    },
    openSettings: () => { patch({ view: 'settings', prevView: state.view === 'settings' ? state.prevView : state.view }) },

    add: (input) => {
      const code = normalizeSymbol(input)
      if (code === null) return '无法识别的标的代码'
      if (state.watchlist.includes(code)) return '该标的已在自选中'
      if (state.watchlist.length >= MAX_WATCHLIST) return `自选上限 ${String(MAX_WATCHLIST)} 只`
      commit({ watchlist: [...state.watchlist, code] })
      return null
    },

    addMany: (input) => {
      const tokens = input.split(/[\s,，、;；]+/).filter((token) => token !== '')
      const added: string[] = []
      const failed: string[] = []
      let watchlist = [...state.watchlist]
      for (const token of tokens) {
        const code = normalizeSymbol(token)
        if (code === null) {
          failed.push(token)
          continue
        }
        if (watchlist.includes(code) || watchlist.length >= MAX_WATCHLIST) {
          failed.push(token)
          continue
        }
        watchlist = [...watchlist, code]
        added.push(code)
      }
      if (added.length > 0) commit({ watchlist })
      return { added: added.length, failed }
    },

    remove: (code) => {
      const watchlist = state.watchlist.filter((item) => item !== code)
      if (watchlist.length === state.watchlist.length) return
      const quotes = { ...state.quotes }
      delete quotes[code]
      commit({
        watchlist,
        quotes,
        ...(state.selected === code ? { selected: null, view: 'list' as PanelView, series: null } : {}),
      })
    },

    pin: (code) => {
      if (state.watchlist[0] === code) return
      if (!state.watchlist.includes(code)) return
      commit({ watchlist: [code, ...state.watchlist.filter((item) => item !== code)] })
    },

    patchSettings: (next) => {
      const merged: Settings = { ...state.settings, ...next, intervalMs: clampInterval(next.intervalMs ?? state.settings.intervalMs) }
      if (sameSettings(merged, state.settings)) return
      commit({ settings: merged })
    },

    applyProfile: (id) => {
      const profile = state.profiles.find((item) => item.id === id)
      if (profile === undefined) return
      commit({ settings: { ...profile.settings }, activeProfileId: id })
    },

    createProfile: (name) => {
      const checked = validateName(name, state.profiles)
      if (typeof checked !== 'string') return checked.error
      const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const profile: Profile = { id, name: checked, builtin: false, settings: { ...state.settings } }
      commit({ profiles: [...state.profiles, profile], activeProfileId: id })
      return null
    },

    saveProfile: (id) => {
      const profile = state.profiles.find((item) => item.id === id)
      if (profile === undefined) return '配置不存在'
      if (profile.builtin) return '内置配置不可覆盖，请另存为新配置'
      commit({
        profiles: state.profiles.map((item) => (item.id === id ? { ...item, settings: { ...state.settings } } : item)),
        activeProfileId: id,
      })
      return null
    },

    renameProfile: (id, name) => {
      const profile = state.profiles.find((item) => item.id === id)
      if (profile === undefined) return '配置不存在'
      if (profile.builtin) return '内置配置不可重命名'
      const checked = validateName(name, state.profiles, id)
      if (typeof checked !== 'string') return checked.error
      commit({ profiles: state.profiles.map((item) => (item.id === id ? { ...item, name: checked } : item)) })
      return null
    },

    deleteProfile: (id) => {
      const profile = state.profiles.find((item) => item.id === id)
      if (profile === undefined) return '配置不存在'
      if (profile.builtin) return '内置配置不可删除'
      commit({
        profiles: state.profiles.filter((item) => item.id !== id),
        activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
      })
      return null
    },

    refreshNow: () => { patch({ refreshNonce: state.refreshNonce + 1 }) },

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
    setChartKind: (kind) => { patch({ chartKind: kind, kline: null, klineError: null }) },
    setKline: (series) => { patch({ kline: series, klineLoading: false, klineError: null }) },
    setKlineLoading: (loading) => { patch({ klineLoading: loading }) },
    setKlineError: (message) => { patch({ klineError: message, klineLoading: false }) },
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
