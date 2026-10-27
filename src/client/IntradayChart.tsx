/**
 * 分时图 / 柱状图。
 *
 * 纯 SVG 手绘，不引第三方图表库 —— 插件 bundle 只能从 shell 的冻结模块表里
 * require 依赖，图表库必须内联，手绘反而更小更可控。
 *
 * 结构：上方价格区（折线或涨跌柱）+ 下方成交量柱 + 右侧百分比轴 + 十字光标。
 */
import { useId, useMemo, useRef, useState } from 'react'
import type { IntradaySeries } from '../core/types.ts'
import type { Palette } from './theme.ts'
import { toneColor } from './theme.ts'
import type { ChartMode } from './store.ts'
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

export interface IntradayChartProps {
  series: IntradaySeries
  mode: ChartMode
  palette: Palette
}

interface Geometry {
  base: number
  top: number
  bottom: number
  maxDev: number
  maxVolume: number
  barWidth: number
  linePath: string
  areaPath: string
  avgPath: string
  x: (index: number) => number
  y: (price: number) => number
}

/**
 * 把分时点换算成 SVG 几何。
 * @param series - 分时序列。
 * @param mode - 折线 / 柱状。
 * @returns 绘制所需的几何量。
 */
function buildGeometry(series: IntradaySeries, mode: ChartMode): Geometry {
  const { points } = series
  const count = points.length
  const base = series.prevClose > 0 ? series.prevClose : (points[0]?.price ?? 0)

  let maxDev = 0
  for (const point of points) {
    maxDev = Math.max(maxDev, Math.abs(point.price - base))
    if (point.avg > 0) maxDev = Math.max(maxDev, Math.abs(point.avg - base))
  }
  if (maxDev <= 0) maxDev = Math.max(base * 0.004, 0.01)

  const span = maxDev * 1.08
  const top = base + span
  const bottom = base - span

  let maxVolume = 0
  for (const point of points) maxVolume = Math.max(maxVolume, point.volume)

  const x = (index: number): number => PAD_L + (count <= 1 ? 0 : (index / (count - 1)) * PLOT_W)
  const y = (price: number): number => PRICE_TOP + ((top - price) / (top - bottom)) * PRICE_H

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(point.price).toFixed(2)}`).join('')
  const area = `${line}L${x(count - 1).toFixed(2)},${PRICE_BOTTOM}L${x(0).toFixed(2)},${PRICE_BOTTOM}Z`
  const avg = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(point.avg).toFixed(2)}`)
    .join('')

  return {
    base,
    top,
    bottom,
    maxDev,
    maxVolume,
    barWidth: Math.max(1, (PLOT_W / Math.max(count, 1)) * (mode === 'bar' ? 0.62 : 0.66)),
    linePath: line,
    areaPath: area,
    avgPath: avg,
    x,
    y,
  }
}

/**
 * 分时图。
 * @param props - 序列、渲染模式、调色板。
 * @returns SVG。
 */
export function IntradayChart({ series, mode, palette }: IntradayChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const gradientId = useId()

  const geo = useMemo(() => buildGeometry(series, mode), [series, mode])
  const { points } = series
  const count = points.length
  const last = points[count - 1]
  const tone = toneColor((last?.price ?? geo.base) - geo.base, palette)

  const levels = useMemo(() => {
    const ratios = [1, 0.5, 0, -0.5, -1]
    return ratios.map((ratio) => {
      const price = geo.base + geo.maxDev * ratio * 1.08
      return {
        price,
        y: geo.y(price),
        label: ratio === 0 ? '0.00%' : `${ratio > 0 ? '+' : ''}${(ratio * 1.08 * 100 * (geo.maxDev / Math.max(geo.base, 0.01))).toFixed(2)}%`,
        strong: ratio === 0,
      }
    })
  }, [geo])

  const activeIndex = hover !== null && hover >= 0 && hover < count ? hover : null
  const activePoint = activeIndex === null ? undefined : points[activeIndex]

  const handleMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const element = svgRef.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0) return
    const vx = ((event.clientX - rect.left) / rect.width) * VB_W
    const ratio = (vx - PAD_L) / PLOT_W
    const index = Math.round(ratio * (count - 1))
    setHover(Math.min(count - 1, Math.max(0, index)))
  }

  const xLabels = useMemo(() => {
    if (count === 0) return [] as { x: number; text: string; anchor: 'start' | 'middle' | 'end' }[]
    const first = points[0]?.time ?? ''
    const middle = points[Math.floor((count - 1) / 2)]?.time ?? ''
    const lastTime = points[count - 1]?.time ?? ''
    return [
      { x: PAD_L, text: first, anchor: 'start' as const },
      { x: PAD_L + PLOT_W / 2, text: middle, anchor: 'middle' as const },
      { x: PAD_L + PLOT_W, text: lastTime, anchor: 'end' as const },
    ]
  }, [points, count])

  const tooltipWidth = 128
  const tooltipHeight = 62
  const tooltipX = activeIndex === null
    ? 0
    : Math.min(VB_W - tooltipWidth - 6, Math.max(PAD_L + 4, geo.x(activeIndex) + 12))

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${String(VB_W)} ${String(VB_H)}`}
      style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none' }}
      onPointerMove={handleMove}
      onPointerLeave={() => { setHover(null) }}
      role="img"
      aria-label={`${series.name} 分时走势`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity={0.26} />
          <stop offset="100%" stopColor={tone} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* 价格区网格与右侧百分比轴 */}
      {levels.map((level) => (
        <g key={level.label + String(level.y)}>
          <line
            x1={PAD_L}
            x2={PAD_L + PLOT_W}
            y1={level.y}
            y2={level.y}
            stroke={level.strong ? palette.border : palette.grid}
            strokeDasharray={level.strong ? '4 4' : undefined}
            strokeWidth={1}
          />
          <text
            x={VB_W - 4}
            y={level.y + 3.5}
            textAnchor="end"
            fill={level.strong ? palette.subtext : palette.faint}
            style={{ font: FONT_SMALL }}
          >
            {level.label}
          </text>
        </g>
      ))}

      {/* 成交量区网格 */}
      <line x1={PAD_L} x2={PAD_L + PLOT_W} y1={VOL_BOTTOM} y2={VOL_BOTTOM} stroke={palette.grid} strokeWidth={1} />
      <line x1={PAD_L} x2={PAD_L + PLOT_W} y1={VOL_TOP} y2={VOL_TOP} stroke={palette.grid} strokeWidth={1} strokeDasharray="3 4" />
      <text x={VB_W - 4} y={VOL_TOP + 3.5} textAnchor="end" fill={palette.faint} style={{ font: FONT_SMALL }}>
        {geo.maxVolume > 0 ? fmtVolume(geo.maxVolume, series.market) : ''}
      </text>

      {/* 价格区 */}
      {mode === 'line' ? (
        <>
          <path d={geo.areaPath} fill={`url(#${gradientId})`} />
          <path d={geo.linePath} fill="none" stroke={tone} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : (
        points.map((point, index) => {
          const y = geo.y(point.price)
          const anchor = geo.y(geo.base)
          const top = Math.min(y, anchor)
          const height = Math.max(1, Math.abs(anchor - y))
          return (
            <rect
              key={`p${String(index)}`}
              x={geo.x(index) - geo.barWidth / 2}
              y={top}
              width={geo.barWidth}
              height={height}
              fill={toneColor(point.price - geo.base, palette)}
              opacity={0.85}
            />
          )
        })
      )}

      {/* 均价线 */}
      <path d={geo.avgPath} fill="none" stroke={palette.faint} strokeWidth={1} strokeDasharray="3 3" opacity={0.85} />

      {/* 成交量柱 */}
      {points.map((point, index) => {
        const previous = index === 0 ? geo.base : (points[index - 1]?.price ?? point.price)
        const height = geo.maxVolume > 0 ? (point.volume / geo.maxVolume) * (VOL_BOTTOM - VOL_TOP) : 0
        return (
          <rect
            key={`v${String(index)}`}
            x={geo.x(index) - geo.barWidth / 2}
            y={VOL_BOTTOM - Math.max(height, 0.4)}
            width={geo.barWidth}
            height={Math.max(height, 0.4)}
            fill={toneColor(point.price - previous, palette)}
            opacity={0.62}
          />
        )
      })}

      {/* 时间轴 */}
      {xLabels.map((label) => (
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
      {activePoint !== undefined && activeIndex !== null && (
        <g pointerEvents="none">
          <line
            x1={geo.x(activeIndex)}
            x2={geo.x(activeIndex)}
            y1={PRICE_TOP}
            y2={VOL_BOTTOM}
            stroke={palette.subtext}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.7}
          />
          <circle cx={geo.x(activeIndex)} cy={geo.y(activePoint.price)} r={3} fill={tone} stroke={palette.surface} strokeWidth={1.5} />
          <g transform={`translate(${String(tooltipX)}, ${String(PRICE_TOP + 4)})`}>
            <rect
              width={tooltipWidth}
              height={tooltipHeight}
              rx={8}
              fill={palette.surface}
              stroke={palette.border}
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.18))' }}
            />
            <text x={10} y={17} fill={palette.subtext} style={{ font: FONT }}>
              {activePoint.time}
            </text>
            <text x={10} y={33} fill={toneColor(activePoint.price - geo.base, palette)} style={{ font: FONT }}>
              {fmtPrice(activePoint.price)}
            </text>
            <text x={tooltipWidth - 10} y={33} textAnchor="end" fill={toneColor(activePoint.price - geo.base, palette)} style={{ font: FONT }}>
              {geo.base > 0 ? fmtPct(((activePoint.price - geo.base) / geo.base) * 100) : '--'}
            </text>
            <text x={10} y={49} fill={palette.faint} style={{ font: FONT_SMALL }}>
              均价 {fmtPrice(activePoint.avg)}
            </text>
            <text x={tooltipWidth - 10} y={49} textAnchor="end" fill={palette.faint} style={{ font: FONT_SMALL }}>
              量 {fmtVolume(activePoint.volume, series.market)}
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}
