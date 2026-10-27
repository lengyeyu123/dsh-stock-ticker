/**
 * 侧栏入口按钮。
 *
 * 挂在 shell 的 `sidebar.footer.action` 槽位上（Settings 行上方），
 * 显示自选列表里的标的并轮播，点击展开浮层面板。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { QuoteClient } from './api.ts'
import type { StockStore } from './store.ts'
import { usePalette, toneColor } from './theme.ts'
import { fmtPct, fmtPrice } from './format.ts'

export interface StockTickerButtonProps {
  store: StockStore
  client: QuoteClient
}

/** 轮播间隔。 */
const ROTATE_MS = 4_500

/**
 * 侧栏行情按钮。
 * @param props - store 与行情客户端。
 * @returns 按钮。
 */
export function StockTickerButton({ store }: StockTickerButtonProps) {
  const palette = usePalette()
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const [cursor, setCursor] = useState(0)
  const [hover, setHover] = useState(false)

  const total = state.watchlist.length

  useEffect(() => {
    if (total <= 1) return
    const timer = window.setInterval(() => {
      setCursor((prev) => (prev + 1) % total)
    }, ROTATE_MS)
    return () => { window.clearInterval(timer) }
  }, [total])

  const code = total === 0 ? null : state.watchlist[cursor % Math.max(total, 1)] ?? null
  const quote = code === null ? undefined : state.quotes[code]
  const pct = quote?.changePct ?? 0
  const color = quote === undefined ? palette.faint : toneColor(pct, palette)

  return (
    <button
      type="button"
      data-dsh-stock-trigger=""
      onClick={() => { store.actions.toggle() }}
      onMouseEnter={() => { setHover(true) }}
      onMouseLeave={() => { setHover(false) }}
      title={quote === undefined ? '自选行情' : `${quote.name} ${fmtPrice(quote.price)} ${fmtPct(quote.changePct)}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        minWidth: 0,
        height: 30,
        padding: '0 8px',
        marginBottom: 4,
        borderRadius: 8,
        border: `1px solid ${state.open ? palette.accent : 'transparent'}`,
        background: state.open ? palette.hover : (hover ? palette.hover : 'transparent'),
        color: palette.text,
        cursor: 'pointer',
        fontFamily: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        transition: 'background 120ms ease',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: state.error !== null ? palette.flat : color,
          flex: 'none',
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {quote?.name ?? (code === null ? '自选行情' : code)}
      </span>
      <span style={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
        {quote === undefined ? '' : fmtPct(pct)}
      </span>
    </button>
  )
}
