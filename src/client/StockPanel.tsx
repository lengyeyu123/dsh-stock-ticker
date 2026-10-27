/**
 * 自选行情面板：列表视图 + 个股详情视图（分时图 / 柱状图）。
 *
 * 同一个组件同时服务两种落位：
 *   - `variant="popover"`：侧栏按钮弹出的浮层，可拖动标题栏移动
 *   - `variant="page"`：设置页里的一级页面，占满内容区
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Quote } from '../core/types.ts'
import type { QuoteClient } from './api.ts'
import type { ChartMode, StockStore } from './store.ts'
import { INTERVAL_CHOICES } from './store.ts'
import type { Palette } from './theme.ts'
import { toneColor, usePalette } from './theme.ts'
import { IntradayChart } from './IntradayChart.tsx'
import {
  currencySign,
  fmtAmount,
  fmtChange,
  fmtClock,
  fmtPct,
  fmtPrice,
  fmtVolume,
  marketLabel,
} from './format.ts'

export interface StockPanelProps {
  store: StockStore
  client: QuoteClient
  variant?: 'popover' | 'page'
  onClose?: () => void
}

const PANEL_WIDTH = 392
const CARD_RADIUS = 14

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
 * 自选行情面板。
 * @param props - store、行情客户端、落位方式、关闭回调。
 * @returns 面板。
 */
export function StockPanel({ store, client, variant = 'popover', onClose }: StockPanelProps) {
  const palette = usePalette()
  // 自己订阅 store：面板既可能被浮层容器渲染，也可能被设置页直接渲染，
  // 不能依赖父组件的重渲染。
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; bottom: number } | null>(null)

  const selectedQuote: Quote | undefined = state.selected === null ? undefined : state.quotes[state.selected]

  // 详情视图打开后拉一次分时；切换标的或手动刷新时重拉。
  useEffect(() => {
    if (state.view !== 'detail' || state.selected === null) return
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
  }, [state.view, state.selected, client, store])

  const submit = (): void => {
    const error = store.actions.add(draft)
    setNotice(error)
    if (error === null) setDraft('')
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
      }

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
          gap: 8,
          padding: '10px 12px',
          borderBottom: `1px solid ${palette.border}`,
          background: palette.surfaceAlt,
          cursor: variant === 'popover' ? 'grab' : 'default',
          userSelect: 'none',
        }}
      >
        {state.view === 'detail' ? (
          <button
            type="button"
            data-no-drag=""
            onClick={() => { store.actions.back() }}
            style={{
              border: 'none',
              background: 'transparent',
              color: palette.subtext,
              cursor: 'pointer',
              fontSize: 13,
              padding: '2px 4px',
              borderRadius: 6,
            }}
          >
            ‹ 返回
          </button>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>自选行情</span>
        )}

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: palette.faint, fontVariantNumeric: 'tabular-nums' }}>
          {state.updatedAt > 0 ? fmtClock(new Date(state.updatedAt).toTimeString().slice(0, 8)) : '--:--:--'}
        </span>

        <span
          title={state.error ?? '每 ' + String(state.intervalMs / 1000) + ' 秒刷新'}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: state.error !== null ? palette.flat : palette.down,
            boxShadow: state.error !== null ? 'none' : `0 0 0 3px ${palette.down}22`,
          }}
        />

        {variant === 'popover' && onClose !== undefined && (
          <button
            type="button"
            data-no-drag=""
            onClick={onClose}
            aria-label="关闭"
            style={{
              border: 'none',
              background: 'transparent',
              color: palette.faint,
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '0 2px',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* 添加栏 */}
      {state.view === 'list' && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderBottom: `1px solid ${palette.border}` }}>
          <input
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setNotice(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
            placeholder="600519 / hk00700 / AAPL"
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
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 8,
              border: 'none',
              background: palette.accent,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            添加
          </button>
        </div>
      )}

      {notice !== null && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: palette.up, background: `${palette.up}12` }}>
          {notice}
        </div>
      )}

      {/* 内容区 */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {state.view === 'list' ? (
          state.watchlist.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: palette.faint }}>
              还没有自选标的，输入代码添加
            </div>
          ) : (
            state.watchlist.map((code) => {
              const quote = state.quotes[code]
              const pct = quote?.changePct ?? 0
              const color = toneColor(pct, palette)
              return (
                <div
                  key={code}
                  onMouseEnter={() => { setHovered(code) }}
                  onMouseLeave={() => { setHovered(null) }}
                  onClick={() => { store.actions.select(code) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    borderBottom: `1px solid ${palette.border}`,
                    cursor: 'pointer',
                    background: hovered === code ? palette.hover : 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {quote?.name ?? code}
                    </div>
                    <div style={{ fontSize: 10.5, color: palette.faint, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {marketLabel(quote?.market ?? 'sh')} · {quote?.symbol ?? code.slice(2)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 13.5, color, fontWeight: 500 }}>{quote === undefined ? '--' : fmtPrice(quote.price)}</div>
                    <div style={{ fontSize: 10.5, color, marginTop: 2 }}>{quote === undefined ? '--' : fmtChange(quote.change)}</div>
                  </div>

                  <div
                    style={{
                      width: 66,
                      textAlign: 'center',
                      padding: '4px 0',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color,
                      background: `${color}16`,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {quote === undefined ? '--' : fmtPct(pct)}
                  </div>

                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); store.actions.remove(code) }}
                    aria-label="移出自选"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: palette.faint,
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: 2,
                      opacity: hovered === code ? 1 : 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })
          )
        ) : (
          <div style={{ padding: 12 }}>
            {/* 个股头部 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedQuote?.name ?? state.selected}</div>
                <div style={{ fontSize: 10.5, color: palette.faint, marginTop: 2 }}>
                  {selectedQuote === undefined ? '' : `${marketLabel(selectedQuote.market)} · ${selectedQuote.symbol} · ${selectedQuote.time}`}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 6px' }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>分时</span>
                {state.series !== null && (
                  <span style={{ fontSize: 10.5, color: palette.faint }}>
                    均价 {fmtPrice(state.series.points[state.series.points.length - 1]?.avg ?? 0)} · 昨收 {fmtPrice(state.series.prevClose)}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: `1px solid ${palette.border}` }}>
                  {(['line', 'bar'] as ChartMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { store.actions.setChartMode(mode) }}
                      style={{
                        border: 'none',
                        padding: '3px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
                        background: state.chartMode === mode ? palette.accent : 'transparent',
                        color: state.chartMode === mode ? '#fff' : palette.subtext,
                      }}
                    >
                      {mode === 'line' ? '折线' : '柱状'}
                    </button>
                  ))}
                </div>
              </div>

              {state.seriesLoading && (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: palette.faint }}>
                  加载分时数据…
                </div>
              )}
              {!state.seriesLoading && state.seriesError !== null && (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: palette.up, padding: 16, textAlign: 'center' }}>
                  {state.seriesError}
                </div>
              )}
              {!state.seriesLoading && state.seriesError === null && state.series !== null && (
                <IntradayChart series={state.series} mode={state.chartMode} palette={palette} />
              )}
            </div>

            {/* 刷新频率 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: palette.faint }}>
              <span>刷新频率</span>
              {INTERVAL_CHOICES.map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => { store.actions.setIntervalMs(ms) }}
                  style={{
                    border: `1px solid ${state.intervalMs === ms ? palette.accent : palette.border}`,
                    background: state.intervalMs === ms ? `${palette.accent}14` : 'transparent',
                    color: state.intervalMs === ms ? palette.accent : palette.subtext,
                    borderRadius: 6,
                    padding: '2px 7px',
                    fontSize: 10.5,
                    cursor: 'pointer',
                  }}
                >
                  {ms / 1000}s
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
