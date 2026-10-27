/**
 * 代码归一化：用户可能输入 600519 / SH600519 / 600519.SH / 700 / 00700 /
 * AAPL / AAPL.OQ / usAAPL 中的任意一种，统一收敛到腾讯行情的代码形式。
 */
import type { Market } from './types.ts'

const MARKET_PREFIX = /^(sh|sz|bj|hk|us)([0-9A-Za-z._-]+)$/i

/** 交易所后缀：.SH / .OQ / .N 之类。 */
const EXCHANGE_SUFFIX = /^([0-9A-Za-z._-]+)\.(sh|sz|bj|hk|us|oq|n|o|nq|am|pk|ny)$/i

/** 美股后缀映射回市场前缀。 */
const US_TAILS = new Set(['oq', 'n', 'o', 'nq', 'am', 'pk', 'ny'])

/**
 * 把任意写法的标的代码归一化成 `sh600519` / `hk00700` / `usAAPL`。
 * @param input - 用户输入。
 * @returns 归一化代码；无法识别时返回 null。
 */
export function normalizeSymbol(input: string): string | null {
  const raw = input.trim().replace(/\s+/g, '')
  if (raw === '') return null

  const suffixed = EXCHANGE_SUFFIX.exec(raw)
  if (suffixed !== null) {
    const body = (suffixed[1] ?? '').toUpperCase()
    const tail = (suffixed[2] ?? '').toLowerCase()
    const prefix = US_TAILS.has(tail) ? 'us' : tail
    return body === '' ? null : `${prefix}${body}`
  }

  const prefixed = MARKET_PREFIX.exec(raw)
  if (prefixed !== null) {
    const prefix = (prefixed[1] ?? '').toLowerCase()
    const body = (prefixed[2] ?? '').toUpperCase()
    return body === '' ? null : `${prefix}${body}`
  }

  // 纯 6 位数字：按 A 股板块推断交易所。
  if (/^\d{6}$/.test(raw)) {
    const head = raw[0]
    if (head === '6' || head === '9' || head === '5') return `sh${raw}`
    if (head === '4' || head === '8') return `bj${raw}`
    return `sz${raw}`
  }

  // 1-5 位数字：港股。
  if (/^\d{1,5}$/.test(raw)) return `hk${raw.padStart(5, '0')}`

  // 纯字母（可带 . -）：美股。
  if (/^[A-Za-z][A-Za-z.\-]{0,9}$/.test(raw)) return `us${raw.toUpperCase()}`

  return null
}

/**
 * 读取归一化代码的市场前缀。
 * @param code - 归一化代码。
 * @returns 市场标识。
 */
export function marketOf(code: string): Market {
  const prefix = code.slice(0, 2).toLowerCase()
  if (prefix === 'sh' || prefix === 'sz' || prefix === 'bj' || prefix === 'hk') return prefix
  return 'us'
}

/**
 * 去掉市场前缀，得到交易所内代码。
 * @param code - 归一化代码。
 * @returns 交易所内代码。
 */
export function symbolOf(code: string): string {
  return code.slice(2)
}

/**
 * 该市场是否以「手」计量成交量（A 股 / 北交所）。
 * @param market - 市场标识。
 * @returns 需要 ×100 折算成股时为 true。
 */
export function isLotMarket(market: Market): boolean {
  return market === 'sh' || market === 'sz' || market === 'bj'
}

/**
 * 市场的计价货币。
 * @param market - 市场标识。
 * @returns 货币代码。
 */
export function currencyOf(market: Market): 'CNY' | 'HKD' | 'USD' {
  if (market === 'hk') return 'HKD'
  if (market === 'us') return 'USD'
  return 'CNY'
}
