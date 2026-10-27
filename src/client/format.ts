/**
 * 数字与时间格式化。
 */
import type { Market } from '../core/types.ts'

/**
 * 价格：统一两位小数。
 * @param value - 价格。
 * @returns 展示文本。
 */
export function fmtPrice(value: number): string {
  if (!Number.isFinite(value)) return '--'
  return value.toFixed(2)
}

/**
 * 带符号的涨跌额。
 * @param value - 涨跌额。
 * @returns 展示文本。
 */
export function fmtChange(value: number): string {
  if (!Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

/**
 * 带符号的百分比。
 * @param value - 百分数（0.44 → +0.44%）。
 * @returns 展示文本。
 */
export function fmtPct(value: number): string {
  if (!Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/**
 * 成交量：按「手 / 万股 / 亿股」自适应。
 * @param shares - 成交股数。
 * @param market - 市场，A 股习惯用「手」。
 * @returns 展示文本。
 */
export function fmtVolume(shares: number, market: Market): string {
  if (!Number.isFinite(shares) || shares <= 0) return '--'
  if (market === 'sh' || market === 'sz' || market === 'bj') {
    const lots = shares / 100
    if (lots >= 1e8) return `${(lots / 1e8).toFixed(2)}亿手`
    if (lots >= 1e4) return `${(lots / 1e4).toFixed(2)}万手`
    return `${Math.round(lots)}手`
  }
  if (shares >= 1e8) return `${(shares / 1e8).toFixed(2)}亿股`
  if (shares >= 1e4) return `${(shares / 1e4).toFixed(2)}万股`
  return `${Math.round(shares)}股`
}

/**
 * 成交额：按「万 / 亿」自适应。
 * @param value - 成交额。
 * @returns 展示文本。
 */
export function fmtAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--'
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return value.toFixed(0)
}

/**
 * 取时间里的 HH:mm:ss。
 * @param value - YYYY-MM-DD HH:mm:ss。
 * @returns HH:mm:ss；无法解析时返回原串。
 */
export function fmtClock(value: string): string {
  const match = /(\d{2}:\d{2}:\d{2})/.exec(value)
  return match?.[1] ?? value
}

/**
 * 货币符号。
 * @param currency - 货币代码。
 * @returns 符号。
 */
export function currencySign(currency: string): string {
  if (currency === 'HKD') return 'HK$'
  if (currency === 'USD') return '$'
  return '¥'
}

/**
 * 市场标签。
 * @param market - 市场。
 * @returns 中文标签。
 */
export function marketLabel(market: Market): string {
  if (market === 'sh') return '沪'
  if (market === 'sz') return '深'
  if (market === 'bj') return '京'
  if (market === 'hk') return '港'
  return 'US'
}
