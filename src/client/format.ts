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

/**
 * 相对时间，用于「上次更新」。
 * @param from - 时间戳（毫秒），0 表示还没更新过。
 * @param now - 当前时间戳。
 * @returns 如 `刚刚` / `12s 前` / `3 分钟前`。
 */
export function fmtRelative(from: number, now: number): string {
  if (!Number.isFinite(from) || from <= 0) return '--'
  const diff = Math.max(0, now - from)
  if (diff < 1_500) return '刚刚'
  const seconds = Math.round(diff / 1_000)
  if (seconds < 60) return `${String(seconds)}s 前`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)} 分钟前`
  return `${String(Math.round(minutes / 60))} 小时前`
}

/** 交易时段。 */
export type Session = 'pre' | 'trading' | 'break' | 'closed' | 'unknown'

/**
 * 判断美股是否处于夏令时（3 月第二个周日 ～ 11 月第一个周日）。
 * @param utc - UTC 时间。
 * @returns 夏令时为 true。
 */
function isUsDst(utc: Date): boolean {
  const year = utc.getUTCFullYear()
  const march = new Date(Date.UTC(year, 2, 1))
  const nov = new Date(Date.UTC(year, 10, 1))
  const startDay = 1 + ((7 - march.getUTCDay()) % 7) + 7
  const endDay = 1 + ((7 - nov.getUTCDay()) % 7)
  const start = Date.UTC(year, 2, startDay, 7)
  const end = Date.UTC(year, 10, endDay, 6)
  const at = utc.getTime()
  return at >= start && at < end
}

/**
 * 按市场当地时间推断当前交易时段（周末一律视为休市）。
 * @param market - 市场。
 * @param now - 当前时间。
 * @returns 时段。
 */
export function marketSession(market: Market, now: Date): Session {
  const minutes = (offsetHours: number): { day: number; minute: number } => {
    const shifted = new Date(now.getTime() + offsetHours * 3_600_000)
    return { day: shifted.getUTCDay(), minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() }
  }

  if (market === 'us') {
    const local = minutes(isUsDst(now) ? -4 : -5)
    if (local.day === 0 || local.day === 6) return 'closed'
    if (local.minute >= 570 && local.minute < 960) return 'trading'
    if (local.minute >= 240 && local.minute < 570) return 'pre'
    return 'closed'
  }

  const local = minutes(8)
  if (local.day === 0 || local.day === 6) return 'closed'
  // 港股 09:30-12:00 / 13:00-16:00；A 股与北交所 09:30-11:30 / 13:00-15:00。
  const noonBreakStart = market === 'hk' ? 720 : 690
  const close = market === 'hk' ? 960 : 900
  if (local.minute >= 570 && local.minute < noonBreakStart) return 'trading'
  if (local.minute >= noonBreakStart && local.minute < 780) return 'break'
  if (local.minute >= 780 && local.minute < close) return 'trading'
  if (local.minute >= 540 && local.minute < 570) return 'pre'
  return 'closed'
}

/**
 * 时段文案。
 * @param session - 时段。
 * @returns 中文标签；未知时为空串。
 */
export function sessionLabel(session: Session): string {
  if (session === 'trading') return '交易中'
  if (session === 'break') return '午间休市'
  if (session === 'pre') return '盘前'
  if (session === 'closed') return '已收盘'
  return ''
}
