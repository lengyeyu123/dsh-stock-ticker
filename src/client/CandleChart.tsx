/**
 * K 线图（蜡烛图）。
 *
 * 和分时图一样是纯 SVG 手绘：蜡烛 + MA5/10/20 + 成交量 + 右侧价格轴 + 十字光标。
 * 涨跌沿用全局配色方向（默认红涨绿跌），所以切「绿涨红跌」时蜡烛也会跟着换。
 */
import { useMemo, useRef, useState } from 'react'
import type { Candle, KlineSeries } from '../core/types.ts'
import type { Palette } from './theme.ts'
import { toneColor } from './theme.ts'
import { fmtPct, fmtPrice, fmtVolume } from './format.ts'

const VB_W = 680
const VB_H = 344
const PAD_L = 6
const PAD_R = 54
const PLOT_W = VB_W - PAD_L - PAD_R
const PRICE_TOP = 16
const PRICE_BOTTOM = 216
const PRICE_H = PRICE_BOTTOM - PRICE_TOP
const VOL_TOP = 242
const VOL_BOTTOM = 312
const AXIS_Y = 330

const FONT = '11px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
const FONT_SMALL = '10px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

/** 均线周期。 */
export const MA_PERIODS = [5, 10, 20] as const

/** 均线配色：MA5 跟随主题强调色，MA10/MA20 固定暖冷两色。 */
export const MA_COLORS: readonly string[] = ['#2f6bff', '#e0a53c', '#a97bd8']

/**
 * 收盘价均线的最后一个值。
 * @param candles - K 线序列。
 * @param period - 周期。
 * @returns 均线值；样本不足时为 null。
 */
export function movingAverage(candles: readonly Candle[], period: number): number | null {
  if (candles.length < period) return null
  let sum = 0
  for (let i = candles.length - period; i < candles.length; i += 1) sum += candles[i]?.close ?? 0
  return sum / period
}

export interface CandleChartProps {
  series: KlineSeries
  palette: Palette
}

/**
 * K 线图。
 * @param props - 序列与调色板。
 * @returns SVG。
 */
export function CandleChart({ series, palette }: CandleChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const geo = useMemo(() => {
    const candles = series.candles
    const count = candles.length
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    let maxVolume = 0
    for (const candle of candles) {
      min = Math.min(min, candle.low)
      max = Math.max(max, candle.high)
      maxVolume = Math.max(maxVolume, candle.volume)
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) {
      min = 0
      max = 1
    }
    const span = max - min
    const padding = span > 0 ? span * 0.06 : Math.max(max * 0.01, 0.01)
    const top = max + padding
    const bottom = Math.max(0, min - padding)
    const step = PLOT_W / Math.max(count, 1)
    const bodyWidth = Math.max(1.5, Math.min(16, step * 0.62))
    const x = (index: number): number => PAD_L + step * (index + 0.5)
    const y = (price: number): number => PRICE_TOP + ((top - price) / Math.max(top - bottom, 0.0001)) * PRICE_H

    const levels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const price = top - (top - bottom) * ratio
      return { price, y: y(price) }
    })

    const maPaths = MA_PERIODS.map((period) => {
      let sum = 0
      const commands: string[] = []
      candles.forEach((candle, index) => {
        sum += candle.close
        if (index >= period) sum -= candles[index - period]?.close ?? 0
        if (index >= period - 1) {
          commands.push(`${commands.length === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(sum / period).toFixed(1)}`)
        }
      })
      return commands.join('')
    })

    return { candles, count, top, bottom, step, bodyWidth, maxVolume, x, y, levels, maPaths }
  }, [series])

  const { candles, count, x, y, maxVolume } = geo
  const activeIndex = hover !== null && hover >= 0 && hover < count ? hover : null
  const active = activeIndex === null ? undefined : candles[activeIndex]

  const handleMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const element = svgRef.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0) return
    const vx = ((event.clientX - rect.left) / rect.width) * VB_W
    const index = Math.floor((vx - PAD_L) / Math.max(geo.step, 0.0001))
    setHover(Math.min(count - 1, Math.max(0, index)))
  }

  const dateLabel = (date: string): string => (date.length >= 10 ? date.slice(5) : date)
  const axisLabels = count === 0
    ? []
    : [
        { x: PAD_L, text: dateLabel(candles[0]?.date ?? ''), anchor: 'start' as const },
        { x: PAD_L + PLOT_W / 2, text: dateLabel(candles[Math.floor((count - 1) / 2)]?.date ?? ''), anchor: 'middle' as const },
        { x: PAD_L + PLOT_W, text: dateLabel(candles[count - 1]?.date ?? ''), anchor: 'end' as const },
      ]

  const tooltipWidth = 148
  const tooltipHeight = 78
  const tooltipX = activeIndex === null
    ? 0
    : Math.min(VB_W - tooltipWidth - 6, Math.max(PAD_L + 4, x(activeIndex) + 10))

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${String(VB_W)} ${String(VB_H)}`}
      style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none' }}
      onPointerMove={handleMove}
      onPointerLeave={() => { setHover(null) }}
      role="img"
      aria-label={`${series.name} K 线`}
    >
      {/* 价格轴网格 */}
      {geo.levels.map((level) => (
        <g key={level.y}>
          <line
            x1={PAD_L}
            x2={PAD_L + PLOT_W}
            y1={level.y}
            y2={level.y}
            stroke={palette.grid}
            strokeWidth={1}
          />
          <text x={VB_W - 4} y={level.y + 3.5} textAnchor="end" fill={palette.faint} style={{ font: FONT_SMALL }}>
            {fmtPrice(level.price)}
          </text>
        </g>
      ))}

      {/* 成交量区网格 */}
      <line x1={PAD_L} x2={PAD_L + PLOT_W} y1={VOL_BOTTOM} y2={VOL_BOTTOM} stroke={palette.grid} strokeWidth={1} />
      <line x1={PAD_L} x2={PAD_L + PLOT_W} y1={VOL_TOP} y2={VOL_TOP} stroke={palette.grid} strokeWidth={1} strokeDasharray="3 4" />
      <text x={VB_W - 4} y={VOL_TOP + 3.5} textAnchor="end" fill={palette.faint} style={{ font: FONT_SMALL }}>
        {maxVolume > 0 ? fmtVolume(maxVolume, series.market) : ''}
      </text>

      {/* 蜡烛 */}
      {candles.map((candle, index) => {
        const color = toneColor(candle.close - candle.open, palette)
        const openY = y(candle.open)
        const closeY = y(candle.close)
        const bodyTop = Math.min(openY, closeY)
        const bodyHeight = Math.max(1, Math.abs(closeY - openY))
        return (
          <g key={`${candle.date}-${String(index)}`}>
            <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={1} />
            <rect
              x={x(index) - geo.bodyWidth / 2}
              y={bodyTop}
              width={geo.bodyWidth}
              height={bodyHeight}
              fill={color}
              opacity={0.92}
            />
          </g>
        )
      })}

      {/* 均线 */}
      {geo.maPaths.map((path, index) => (
        path === '' ? null : (
          <path
            key={MA_PERIODS[index]}
            d={path}
            fill="none"
            stroke={index === 0 ? palette.accent : (MA_COLORS[index] ?? palette.faint)}
            strokeWidth={1.1}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.9}
          />
        )
      ))}

      {/* 成交量柱 */}
      {candles.map((candle, index) => {
        const height = maxVolume > 0 ? (candle.volume / maxVolume) * (VOL_BOTTOM - VOL_TOP) : 0
        return (
          <rect
            key={`v${candle.date}-${String(index)}`}
            x={x(index) - geo.bodyWidth / 2}
            y={VOL_BOTTOM - Math.max(height, 0.4)}
            width={geo.bodyWidth}
            height={Math.max(height, 0.4)}
            fill={toneColor(candle.close - candle.open, palette)}
            opacity={0.55}
          />
        )
      })}

      {/* 时间轴 */}
      {axisLabels.map((label) => (
        <text
          key={label.text + String(label.x)}
          x={label.x}
          y={AXIS_Y}
          textAnchor={label.anchor}
          fill={palette.faint}
          style={{ font: FONT_SMALL }}
        >
          {label.text}
        </text>
      ))}

      {/* 十字光标 */}
      {active !== undefined && activeIndex !== null && (
        <g pointerEvents="none">
          <line
            x1={x(activeIndex)}
            x2={x(activeIndex)}
            y1={PRICE_TOP}
            y2={VOL_BOTTOM}
            stroke={palette.subtext}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.65}
          />
          <g transform={`translate(${String(tooltipX)}, ${String(PRICE_TOP + 4)})`}>
            <rect
              width={tooltipWidth}
              height={tooltipHeight}
              rx={8}
              fill={palette.surface}
              stroke={palette.border}
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.18))' }}
            />
            <text x={10} y={16} fill={palette.subtext} style={{ font: FONT }}>
              {active.date}
            </text>
            <text x={10} y={33} fill={palette.faint} style={{ font: FONT_SMALL }}>
              开 {fmtPrice(active.open)}
            </text>
            <text x={tooltipWidth - 10} y={33} textAnchor="end" fill={palette.faint} style={{ font: FONT_SMALL }}>
              收 {fmtPrice(active.close)}
            </text>
            <text x={10} y={48} fill={palette.faint} style={{ font: FONT_SMALL }}>
              高 {fmtPrice(active.high)}
            </text>
            <text x={tooltipWidth - 10} y={48} textAnchor="end" fill={palette.faint} style={{ font: FONT_SMALL }}>
              低 {fmtPrice(active.low)}
            </text>
            <text x={10} y={66} fill={toneColor(active.close - active.open, palette)} style={{ font: FONT_SMALL }}>
              {fmtPct(active.open > 0 ? ((active.close - active.open) / active.open) * 100 : 0)}
            </text>
            <text x={tooltipWidth - 10} y={66} textAnchor="end" fill={palette.faint} style={{ font: FONT_SMALL }}>
              量 {fmtVolume(active.volume, series.market)}
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}
