/**
 * 配色。
 *
 * 不依赖 shell 的语义 token（`--dsw-alias-brand-*` 在当前主题里会 alias 到近黑色，
 * 硬套会得到"黑按钮黑字"），改为自己探测 shell 背景亮度，两套调色板各自保证对比度。
 * 涨跌遵循 A 股习惯：红涨绿跌。
 */
import { useEffect, useState } from 'react'

export interface Palette {
  /** 面板底色。 */
  surface: string
  /** 次级区块底色。 */
  surfaceAlt: string
  /** 主文字。 */
  text: string
  /** 次级文字。 */
  subtext: string
  /** 更弱的辅助文字。 */
  faint: string
  border: string
  grid: string
  shadow: string
  /** 上涨色。 */
  up: string
  /** 下跌色。 */
  down: string
  /** 平盘色。 */
  flat: string
  /** 强调色（选中、聚焦）。 */
  accent: string
  /** 悬浮高亮底。 */
  hover: string
  mode: 'light' | 'dark'
}

const LIGHT: Palette = {
  surface: '#ffffff',
  surfaceAlt: '#f5f6f8',
  text: '#14171c',
  subtext: '#5b6472',
  faint: '#8b95a3',
  border: 'rgba(16, 24, 40, 0.10)',
  grid: 'rgba(16, 24, 40, 0.07)',
  shadow: '0 18px 48px rgba(16, 24, 40, 0.18), 0 2px 8px rgba(16, 24, 40, 0.08)',
  up: '#e0483d',
  down: '#0a9c6d',
  flat: '#8b95a3',
  accent: '#2f6bff',
  hover: 'rgba(47, 107, 255, 0.08)',
  mode: 'light',
}

const DARK: Palette = {
  surface: '#1c1f26',
  surfaceAlt: '#252932',
  text: '#e9ecf1',
  subtext: '#9aa4b2',
  faint: '#6f7a89',
  border: 'rgba(255, 255, 255, 0.10)',
  grid: 'rgba(255, 255, 255, 0.07)',
  shadow: '0 18px 48px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35)',
  up: '#ff5a4e',
  down: '#22c58b',
  flat: '#8b95a3',
  accent: '#6f9bff',
  hover: 'rgba(111, 155, 255, 0.14)',
  mode: 'dark',
}

/**
 * 采样页面背景亮度判断当前是浅色还是深色主题。
 * @returns 'light' | 'dark'
 */
function detectMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  const probe = document.body ?? document.documentElement
  const raw = getComputedStyle(probe).backgroundColor
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i.exec(raw)
  if (match === null) {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true ? 'dark' : 'light'
  }
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  if (alpha === 0) {
    const rootRaw = getComputedStyle(document.documentElement).backgroundColor
    const rootMatch = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(rootRaw)
    if (rootMatch === null) return 'light'
    const [r, g, b] = [Number(rootMatch[1]), Number(rootMatch[2]), Number(rootMatch[3])]
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128 ? 'dark' : 'light'
  }
  const r = Number(match[1])
  const g = Number(match[2])
  const b = Number(match[3])
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128 ? 'dark' : 'light'
}

/**
 * 订阅 shell 主题并返回对应调色板。
 * @returns 当前调色板。
 */
export function usePalette(): Palette {
  const [mode, setMode] = useState<'light' | 'dark'>(() => detectMode())

  useEffect(() => {
    const sync = (): void => {
      const next = detectMode()
      setMode((prev) => (prev === next ? prev : next))
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    if (document.body !== null) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
    }
    const timer = window.setInterval(sync, 4_000)
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  return mode === 'dark' ? DARK : LIGHT
}

/**
 * 按涨跌取色。
 * @param value - 涨跌值。
 * @param palette - 调色板。
 * @returns 颜色。
 */
export function toneColor(value: number, palette: Palette): string {
  if (value > 0) return palette.up
  if (value < 0) return palette.down
  return palette.flat
}
