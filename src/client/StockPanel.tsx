/**
 * 自选行情面板：列表视图 + 个股详情视图 + 设置视图。
 *
 * 同一个组件同时服务两种落位：
 *   - `variant="popover"`：侧栏按钮弹出的浮层，可拖动标题栏移动
 *   - `variant="page"`：设置页里的一级页面，占满内容区
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Quote } from '../core/types.ts'
import type { QuoteClient } from './api.ts'
import type { ChartKind, ChartMode, StockStore } from './store.ts'
import type { Palette } from './theme.ts'
import { toneColor, usePalette } from './theme.ts'
import { CandleChart, MA_COLORS, MA_PERIODS, movingAverage } from './CandleChart.tsx'
import { IntradayChart } from './IntradayChart.tsx'
import { SettingsView } from './SettingsView.tsx'
import { Icon, IconButton, Segmented } from './ui.tsx'
import {
  currencySign,
  fmtAmount,
  fmtChange,
  fmtPct,
  fmtPrice,
  fmtRelative,
  fmtVolume,
  marketLabel,
  marketSession,
  sessionLabel,
} from './format.ts'

export interface StockPanelProps {
  store: StockStore
  client: QuoteClient
  variant?: 'popover' | 'page'
  onClose?: () => void
}

const PANEL_WIDTH = 392
const CARD_RADIUS = 14

/** 空列表时的快捷入口。 */
const SUGGESTIONS: readonly { code: string; name: string }[] = [
  { code: 'sh000001', name: '上证指数' },
  { code: 'sh600519', name: '贵州茅台' },
  { code: 'sz300750', name: '宁德时代' },
  { code: 'hk00700', name: '腾讯控股' },
  { code: 'usAAPL', name: '苹果' },
]

/**
 * 一行键值统计。
 * @param props - 标签、值、颜色。
 * @returns 单元格。
 */
function Stat({ label, value, color, palette }: { label: string; value: string; color?: string; palette: Palette }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: palette.faint, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 12.5, color: color ?? palette.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

/**
 * 上次更新时间的相对显示，自己按秒刷新，避免整块面板每秒重渲染。
 * @param props - 时间戳与调色板。
 * @returns 文本。
 */
function Freshness({ at, palette }: { at: number; palette: Palette }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { window.clearInterval(timer) }
  }, [])

  return (
    <span style={{ fontSize: 10.5, color: palette.faint, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {fmtRelative(at, now)}
    </span>
  )
}

/**
 * 详情页的交易时段标签。
 * @param props - 行情与调色板。
 * @returns 标签；无法判断时返回 null。
 */
function SessionChip({ quote, palette }: { quote: Quote; palette: Palette }) {
  const session = marketSession(quote.market, new Date())
  const label = sessionLabel(session)
  if (label === '') return null
  const color = session === 'trading' ? palette.accent : palette.faint
  return (
    <span
      style={{
        fontSize: 9.5,
        lineHeight: 1.7,
        padding: '0 5px',
        borderRadius: 4,
        color,
        background: session === 'trading' ? `${palette.accent}14` : palette.surfaceAlt,
        border: `1px solid ${session === 'trading' ? `${palette.accent}33` : palette.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

/**
 * 自选行情面板。
 * @param props - store、行情客户端、落位方式、关闭回调。
 * @returns 面板。
 */
export function StockPanel({ store, client, variant = 'popover', onClose }: StockPanelProps) {
  // 自己订阅 store：面板既可能被浮层容器渲染，也可能被设置页直接渲染，
  // 不能依赖父组件的重渲染。
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const palette = usePalette(state.settings.colorMode)
  const compact = state.settings.density === 'compact'

  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; bottom: number } | null>(null)

  const selectedQuote: Quote | undefined = state.selected === null ? undefined : state.quotes[state.selected]
  const loadingFirst = state.loading && Object.keys(state.quotes).length === 0
  const klineActive = state.chartKind !== 'intraday'
  // 数据还没到且没有错误时一律按「加载中」处理，避免切视图时闪一帧空白。
  const chartLoading = klineActive
    ? state.klineError === null && state.kline === null
    : state.seriesError === null && state.series === null
  const chartError = klineActive ? state.klineError : state.seriesError
  const maValues = state.kline === null
    ? []
    : MA_PERIODS.map((period) => movingAverage(state.kline?.candles ?? [], period))

  // 详情视图打开后拉一次分时；切换标的、手动刷新时重拉。
  useEffect(() => {
    if (state.view !== 'detail' || state.selected === null) return
    if (state.chartKind !== 'intraday') return
    const code = state.selected
    let cancelled = false
    store.actions.setSeriesLoading(true)
    client.minute(code).then(
      (series) => { if (!cancelled) store.actions.setSeries(series) },
      (error: unknown) => {
        if (!cancelled) store.actions.setSeriesError(error instanceof Error ? error.message : '分时数据获取失败')
      },
    )
    return () => { cancelled = true }
  }, [state.view, state.selected, state.chartKind, state.refreshNonce, client, store])

  // 切到 K 线时按周期拉一次；切周期 / 换标的 / 手动刷新都会重拉。
  useEffect(() => {
    if (state.view !== 'detail' || state.selected === null) return
    if (state.chartKind === 'intraday') return
    const code = state.selected
    const period = state.chartKind
    let cancelled = false
    store.actions.setKlineLoading(true)
    client.kline(code, period).then(
      (series) => { if (!cancelled) store.actions.setKline(series) },
      (error: unknown) => {
        if (!cancelled) store.actions.setKlineError(error instanceof Error ? error.message : 'K 线数据获取失败')
      },
    )
    return () => { cancelled = true }
  }, [state.view, state.selected, state.chartKind, state.refreshNonce, client, store])

  const submit = (): void => {
    const result = store.actions.addMany(draft)
    if (result.added > 0) {
      setDraft('')
      setNotice(result.failed.length > 0 ? `${String(result.added)} 个已添加，${result.failed.join('、')} 未识别` : null)
      return
    }
    setNotice(result.failed.length > 0 ? `未识别：${result.failed.join('、')}` : '请输入代码')
  }

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (variant !== 'popover') return
    const target = event.target as HTMLElement
    if (target.closest('[data-no-drag]') !== null) return
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: state.position.left,
      bottom: state.position.bottom,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const origin = dragRef.current
    if (origin === null) return
    const left = Math.min(Math.max(4, origin.left + (event.clientX - origin.x)), window.innerWidth - 120)
    const bottom = Math.min(Math.max(4, origin.bottom - (event.clientY - origin.y)), window.innerHeight - 80)
    store.actions.setPosition(left, bottom)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === null) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // 指针已经释放。
    }
  }

  const shellStyle: React.CSSProperties = variant === 'popover'
    ? {
        position: 'fixed',
        left: state.position.left,
        bottom: state.position.bottom,
        width: PANEL_WIDTH,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'min(660px, calc(100vh - 120px))',
        zIndex: 4000,
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: CARD_RADIUS,
        boxShadow: palette.shadow,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        // 供 styles.ts 里的 :focus-visible / 滚动条取色。
        ['--stk-focus' as string]: palette.accent,
        ['--stk-faint' as string]: palette.faint,
        ['--stk-scroll' as string]: palette.mode === 'dark' ? 'rgba(255,255,255,.22)' : 'rgba(16,24,40,.18)',
      }
    : {
        width: '100%',
        maxWidth: 880,
        margin: '0 auto',
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: CARD_RADIUS,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        ['--stk-focus' as string]: palette.accent,
        ['--stk-faint' as string]: palette.faint,
        ['--stk-scroll' as string]: palette.mode === 'dark' ? 'rgba(255,255,255,.22)' : 'rgba(16,24,40,.18)',
      }

  const title = state.view === 'settings' ? '设置' : '自选行情'

  return (
    <div style={shellStyle} data-dsh-stock-panel="">
      {/* 标题栏 */}
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 8px 8px 10px',
          borderBottom: `1px solid ${palette.border}`,
          background: palette.surfaceAlt,
          cursor: variant === 'popover' ? 'grab' : 'default',
          userSelect: 'none',
        }}
      >
        {state.view !== 'list' && (
          <button
            type="button"
            data-no-drag=""
            onClick={() => { store.actions.back() }}
            aria-label="返回列表"
            title="返回列表"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              border: 'none',
              background: 'transparent',
              color: palette.subtext,
              cursor: 'pointer',
              fontSize: 12,
              padding: '2px 4px 2px 0',
              borderRadius: 6,
            }}
          >
            <Icon name="chevron-left" size={13} />
            返回
          </button>
        )}

        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>{title}</span>
        {state.view === 'list' && state.watchlist.length > 0 && (
          <span style={{ fontSize: 10.5, color: palette.faint, marginTop: 1 }}>{state.watchlist.length}</span>
        )}

        <span style={{ flex: 1 }} />

        <span
          title={state.updatedAt > 0 ? `${new Date(state.updatedAt).toLocaleString()} · 每 ${String(state.settings.intervalMs / 1000)} 秒刷新` : '等待首次刷新'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              flex: 'none',
              background: state.error !== null ? palette.flat : (state.updatedAt > 0 ? palette.ok : palette.faint),
              boxShadow: state.error !== null || state.updatedAt === 0 ? 'none' : `0 0 0 3px ${palette.ok}22`,
            }}
          />
          <Freshness at={state.updatedAt} palette={palette} />
        </span>

        <IconButton
          label="立即刷新"
          icon="refresh"
          palette={palette}
          onClick={() => { store.actions.refreshNow() }}
        />

        {state.view !== 'settings' && (
          <IconButton
            label="设置"
            icon="settings"
            palette={palette}
            onClick={() => { store.actions.openSettings() }}
          />
        )}

        {variant === 'popover' && onClose !== undefined && (
          <IconButton label="关闭" icon="close" palette={palette} onClick={onClose} />
        )}
      </div>

      {/* 添加栏 */}
      {state.view === 'list' && (
        <div style={{ display: 'flex', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${palette.border}` }}>
          <input
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setNotice(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
            placeholder="600519 / hk00700 / AAPL，可批量粘贴"
            aria-label="添加自选标的"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 9px',
              fontSize: 12,
              borderRadius: 8,
              border: `1px solid ${notice === null ? palette.border : palette.up}`,
              background: palette.surfaceAlt,
              color: palette.text,
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={draft.trim() === ''}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 8,
              border: 'none',
              background: draft.trim() === '' ? palette.border : palette.accent,
              color: draft.trim() === '' ? palette.faint : '#fff',
              cursor: draft.trim() === '' ? 'default' : 'pointer',
              fontWeight: 500,
            }}
          >
            添加
          </button>
        </div>
      )}

      {notice !== null && state.view === 'list' && (
        <div style={{ padding: '6px 12px', fontSize: 10.5, color: palette.up, background: `${palette.up}12` }}>
          {notice}
        </div>
      )}

      {state.error !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            fontSize: 10.5,
            color: palette.up,
            background: `${palette.up}12`,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.error}
          </span>
          <button
            type="button"
            onClick={() => { store.actions.refreshNow() }}
            style={{
              border: `1px solid ${palette.up}55`,
              background: 'transparent',
              color: palette.up,
              borderRadius: 5,
              padding: '1px 7px',
              fontSize: 10.5,
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            重试
          </button>
        </div>
      )}

      {/* 内容区 */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {state.view === 'settings' ? (
          <SettingsView store={store} palette={palette} />
        ) : state.view === 'list' ? (
          state.watchlist.length === 0 ? (
            <div style={{ padding: '30px 16px 26px', textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, color: palette.subtext }}>还没有自选标的</div>
              <div style={{ fontSize: 10.5, color: palette.faint, marginTop: 4, lineHeight: 1.7 }}>
                输入代码，或从下面挑一只开始
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 }}>
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      const result = store.actions.addMany(item.code)
                      setNotice(result.added > 0 ? null : '添加失败')
                    }}
                    style={{
                      border: `1px solid ${palette.border}`,
                      background: palette.surfaceAlt,
                      color: palette.subtext,
                      borderRadius: 999,
                      padding: '3px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ) : loadingFirst ? (
            <div aria-hidden="true">
              {state.watchlist.slice(0, 5).map((code, index) => (
                <div
                  key={code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: compact ? '8px 12px' : '11px 12px',
                    borderBottom: `1px solid ${palette.border}`,
                    opacity: 1 - index * 0.14,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ width: 76, height: 9, borderRadius: 4, background: palette.grid }} />
                    <div style={{ width: 48, height: 7, borderRadius: 4, background: palette.grid, marginTop: 6 }} />
                  </div>
                  <div style={{ width: 54, height: 9, borderRadius: 4, background: palette.grid }} />
                  <div style={{ width: 62, height: 20, borderRadius: 6, background: palette.grid }} />
                </div>
              ))}
            </div>
          ) : (
            state.watchlist.map((code) => {
              const quote = state.quotes[code]
              const pct = quote?.changePct ?? 0
              const color = quote === undefined ? palette.faint : toneColor(pct, palette)
              const hover = hovered === code
              return (
                <div
                  key={code}
                  onMouseEnter={() => { setHovered(code) }}
                  onMouseLeave={() => { setHovered(null) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: compact ? '5px 10px 5px 12px' : '8px 10px 8px 12px',
                    borderBottom: `1px solid ${palette.border}`,
                    background: hover ? palette.hover : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { store.actions.select(code) }}
                    aria-label={`查看 ${quote?.name ?? code}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: compact ? 12 : 13,
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {quote?.name ?? code}
                      </span>
                      {!compact && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 10.5,
                            color: palette.faint,
                            marginTop: 2,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {marketLabel(quote?.market ?? 'sh')} · {quote?.symbol ?? code.slice(2)}
                        </span>
                      )}
                    </span>

                    <span style={{ display: 'block', textAlign: 'right', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                      <span style={{ display: 'block', fontSize: compact ? 12.5 : 13.5, color, fontWeight: 500 }}>
                        {quote === undefined ? '--' : fmtPrice(quote.price)}
                      </span>
                      <span style={{ display: 'block', fontSize: 10.5, color, marginTop: 2 }}>
                        {quote === undefined ? '--' : fmtChange(quote.change)}
                      </span>
                    </span>

                    <span
                      style={{
                        display: 'block',
                        width: 62,
                        textAlign: 'center',
                        padding: '4px 0',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        color,
                        background: quote === undefined ? 'transparent' : `${color}16`,
                        fontVariantNumeric: 'tabular-nums',
                        flex: 'none',
                      }}
                    >
                      {quote === undefined ? '--' : fmtPct(pct)}
                    </span>
                  </button>

                  <span
                    style={{
                      display: 'flex',
                      gap: 1,
                      flex: 'none',
                      opacity: hover ? 1 : 0.26,
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    <IconButton
                      label="置顶"
                      icon="pin"
                      size={12}
                      palette={palette}
                      onClick={() => { store.actions.pin(code) }}
                    />
                    <IconButton
                      label="移出自选"
                      icon="close"
                      size={12}
                      palette={palette}
                      tone={palette.up}
                      onClick={() => { store.actions.remove(code) }}
                    />
                  </span>
                </div>
              )
            })
          )
        ) : (
          <div style={{ padding: 12 }}>
            {/* 个股头部 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedQuote?.name ?? state.selected}
                  </span>
                  {selectedQuote !== undefined && <SessionChip quote={selectedQuote} palette={palette} />}
                </div>
                <div style={{ fontSize: 10.5, color: palette.faint, marginTop: 2 }}>
                  {selectedQuote === undefined
                    ? ''
                    : `${marketLabel(selectedQuote.market)} · ${selectedQuote.symbol} · ${selectedQuote.time}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: toneColor(selectedQuote?.changePct ?? 0, palette), lineHeight: 1.1 }}>
                  {selectedQuote === undefined ? '--' : fmtPrice(selectedQuote.price)}
                </div>
                <div style={{ fontSize: 11.5, color: toneColor(selectedQuote?.changePct ?? 0, palette), marginTop: 3 }}>
                  {selectedQuote === undefined ? '' : `${fmtChange(selectedQuote.change)}  ${fmtPct(selectedQuote.changePct)}`}
                </div>
              </div>
            </div>

            {/* 关键指标 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px 6px',
                padding: '10px 12px',
                borderRadius: 10,
                background: palette.surfaceAlt,
                marginBottom: 10,
              }}
            >
              <Stat palette={palette} label="今开" value={selectedQuote === undefined ? '--' : fmtPrice(selectedQuote.open)} />
              <Stat palette={palette} label="最高" value={selectedQuote === undefined ? '--' : fmtPrice(selectedQuote.high)} color={palette.up} />
              <Stat palette={palette} label="最低" value={selectedQuote === undefined ? '--' : fmtPrice(selectedQuote.low)} color={palette.down} />
              <Stat palette={palette} label="昨收" value={selectedQuote === undefined ? '--' : fmtPrice(selectedQuote.prevClose)} />
              <Stat
                palette={palette}
                label="成交量"
                value={selectedQuote === undefined ? '--' : fmtVolume(selectedQuote.volume, selectedQuote.market)}
              />
              <Stat
                palette={palette}
                label="成交额"
                value={selectedQuote === undefined ? '--' : `${currencySign(selectedQuote.currency)}${fmtAmount(selectedQuote.amount)}`}
              />
            </div>

            {/* 图表卡片 */}
            <div style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '8px 8px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 4px' }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>走势</span>
                <span style={{ flex: 1 }} />
                <Segmented<ChartKind>
                  ariaLabel="图表类型"
                  palette={palette}
                  value={state.chartKind}
                  onChange={(kind) => { store.actions.setChartKind(kind) }}
                  options={[
                    { value: 'intraday', label: '分时' },
                    { value: 'day', label: '日K' },
                    { value: 'week', label: '周K' },
                    { value: 'month', label: '月K' },
                  ]}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 6px', minHeight: 22 }}>
                {state.chartKind === 'intraday' ? (
                  state.series !== null ? (
                    <span style={{ fontSize: 10, color: palette.faint }}>
                      均价 {fmtPrice(state.series.points[state.series.points.length - 1]?.avg ?? 0)} · 昨收 {fmtPrice(state.series.prevClose)}
                    </span>
                  ) : <span />
                ) : (
                  <span style={{ display: 'flex', gap: 9, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                    {MA_PERIODS.map((period, index) => (
                      <span key={period} style={{ color: index === 0 ? palette.accent : (MA_COLORS[index] ?? palette.faint) }}>
                        MA{period} {maValues[index] === null || maValues[index] === undefined ? '--' : fmtPrice(maValues[index])}
                      </span>
                    ))}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {state.chartKind === 'intraday' && (
                  <Segmented<ChartMode>
                    ariaLabel="图表形态"
                    palette={palette}
                    value={state.settings.chartMode}
                    onChange={(mode) => { store.actions.patchSettings({ chartMode: mode }) }}
                    options={[{ value: 'line', label: '折线' }, { value: 'bar', label: '柱状' }]}
                  />
                )}
              </div>

              {chartLoading && (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: palette.faint }}>
                  加载{state.chartKind === 'intraday' ? '分时数据' : ' K 线数据'}…
                </div>
              )}
              {!chartLoading && chartError !== null && (
                <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11.5, color: palette.up, padding: 16, textAlign: 'center' }}>
                  <span>{chartError}</span>
                  <button
                    type="button"
                    onClick={() => { store.actions.refreshNow() }}
                    style={{
                      border: `1px solid ${palette.border}`,
                      background: palette.surfaceAlt,
                      color: palette.subtext,
                      borderRadius: 6,
                      padding: '3px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    重试
                  </button>
                </div>
              )}
              {!chartLoading && chartError === null && state.chartKind === 'intraday' && state.series !== null && (
                <IntradayChart series={state.series} mode={state.settings.chartMode} palette={palette} />
              )}
              {!chartLoading && chartError === null && state.chartKind !== 'intraday' && state.kline !== null && (
                <CandleChart series={state.kline} palette={palette} />
              )}
            </div>

            {/* 底部信息 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 10.5, color: palette.faint }}>
              <span>
                腾讯行情 · 每 {String(Math.round(state.settings.intervalMs / 1000))} 秒
              </span>
              <button
                type="button"
                onClick={() => { store.actions.openSettings() }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: palette.accent,
                  fontSize: 10.5,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                调整
              </button>
              <span style={{ flex: 1 }} />
              {state.selected !== null && (
                <button
                  type="button"
                  onClick={() => { store.actions.remove(state.selected ?? '') }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: palette.faint,
                    fontSize: 10.5,
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  移出自选
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
