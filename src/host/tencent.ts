/**
 * 腾讯行情数据源适配层。
 *
 * 两个端点：
 *   1. 实时快照  https://qt.gtimg.cn/q=<codes>          —— GBK 编码、`~` 分隔
 *   2. 分时序列  https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=    （A股 / 港股 / 指数）
 *                https://web.ifzq.gtimg.cn/appstock/app/UsMinute/query?code=  （美股）
 *
 * 两个端点都返回 `Access-Control-Allow-Origin: *`，但 GBK 解码、单位折算和
 * 缓存仍然放在宿主侧做，浏览器半区只拿归一化后的 JSON。
 */
import type { Candle, Currency, IntradayPoint, IntradaySeries, KlinePeriod, KlineSeries, Market, Quote } from '../core/types.ts'
import { currencyOf, isLotMarket, marketOf, normalizeSymbol, symbolOf } from '../core/symbol.ts'

const QT_ENDPOINT = 'https://qt.gtimg.cn/q='
const MINUTE_ENDPOINT = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?code='
const US_MINUTE_ENDPOINT = 'https://web.ifzq.gtimg.cn/appstock/app/UsMinute/query?code='
const KLINE_ENDPOINT = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='

const REQUEST_HEADERS: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  referer: 'https://gu.qq.com/',
  accept: '*/*',
}

const QUOTE_TIMEOUT_MS = 8_000
const MINUTE_TIMEOUT_MS = 10_000
const KLINE_TIMEOUT_MS = 10_000
const QUOTE_TTL_MS = 2_500
const MINUTE_TTL_MS = 8_000
const KLINE_TTL_MS = 30_000

/** 单次请求允许的最大标的数量，避免 URL 过长。 */
const MAX_BATCH = 60

interface CacheEntry<T> {
  at: number
  value: T
}

const quoteCache = new Map<string, CacheEntry<Quote[]>>()
const minuteCache = new Map<string, CacheEntry<IntradaySeries>>()
const klineCache = new Map<string, CacheEntry<KlineSeries>>()

/** usAAPL → usAAPL.OQ：K 线接口需要带交易所后缀，缓存一次即可。 */
const usSymbolCache = new Map<string, string>()

/**
 * 安全转数字。
 * @param raw - 原始字符串。
 * @returns 有限数值；无法解析时返回 0。
 */
function num(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/**
 * 把各市场的行情时间统一成 `YYYY-MM-DD HH:mm:ss`。
 * @param raw - 数据源时间字段。
 * @returns 归一化时间；无法解析时原样返回。
 */
function normalizeTime(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} `
      + `${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`
  }
  if (digits.length === 12) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} `
      + `${digits.slice(8, 10)}:${digits.slice(10, 12)}`
  }
  return raw
}

/**
 * 解析 `qt.gtimg.cn` 的单行记录。
 * @param line - 形如 `v_sh600519="1~贵州茅台~600519~..."`。
 * @returns 快照；格式不合法时返回 null。
 */
function parseQuoteLine(line: string): Quote | null {
  // 记录行形如 `v_sh600519="1~贵州茅台~...~";`，结尾带分号。
  const match = /^v_([^=]+)="([\s\S]*)"\s*;?\s*$/.exec(line.trim())
  if (match === null) return null
  // 保留美股代码的大写（usAAPL），否则前端按 code 查表会落空。
  const code = normalizeSymbol(match[1] ?? '') ?? (match[1] ?? '').toLowerCase()
  const fields = (match[2] ?? '').split('~')
  if (fields.length < 35) return null

  const market: Market = marketOf(code)
  const lot = isLotMarket(market)
  const price = num(fields[3])
  const prevClose = num(fields[4])
  const change = num(fields[31])
  const changePct = num(fields[32])

  return {
    code,
    market,
    symbol: symbolOf(code),
    name: (fields[1] ?? '').trim() || symbolOf(code),
    price,
    prevClose,
    open: num(fields[5]),
    high: num(fields[33]),
    low: num(fields[34]),
    change: change !== 0 || price === 0 ? change : price - prevClose,
    changePct: changePct !== 0 || price === 0 ? changePct : (prevClose === 0 ? 0 : ((price - prevClose) / prevClose) * 100),
    // A 股成交量单位是「手」，成交额单位是「万元」；港美股的成交量是股、成交额是元。
    volume: lot ? num(fields[6]) * 100 : num(fields[6]),
    amount: lot ? num(fields[37]) * 10_000 : num(fields[37]),
    turnoverRate: num(fields[38]),
    pe: num(fields[39]),
    currency: currencyOf(market) as Currency,
    time: normalizeTime(fields[30] ?? ''),
    stale: price <= 0,
  }
}

/**
 * 拉取一批实时快照。
 * @param codes - 已归一化的代码列表。
 * @returns 快照数组，顺序不保证与入参一致。
 */
export async function fetchQuotes(codes: readonly string[]): Promise<Quote[]> {
  const wanted = [...new Set(codes)].slice(0, MAX_BATCH)
  if (wanted.length === 0) return []

  const key = wanted.join(',')
  const cached = quoteCache.get(key)
  if (cached !== undefined && Date.now() - cached.at < QUOTE_TTL_MS) return cached.value

  const response = await fetch(QT_ENDPOINT + wanted.join(','), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`腾讯行情返回 HTTP ${String(response.status)}`)

  // qt.gtimg.cn 是 GBK 编码，Node 的 full-icu 构建支持 'gbk' 解码。
  const buffer = await response.arrayBuffer()
  const text = new TextDecoder('gbk').decode(buffer)

  const quotes: Quote[] = []
  for (const line of text.split('\n')) {
    const quote = parseQuoteLine(line)
    if (quote !== null) quotes.push(quote)
  }
  if (quotes.length === 0) throw new Error('腾讯行情未返回可解析的标的')

  quoteCache.set(key, { at: Date.now(), value: quotes })
  return quotes
}

/**
 * 拉取单只标的的当日分时序列。
 * @param code - 已归一化的代码。
 * @returns 分时序列。
 */
export async function fetchIntraday(code: string): Promise<IntradaySeries> {
  const cached = minuteCache.get(code)
  if (cached !== undefined && Date.now() - cached.at < MINUTE_TTL_MS) return cached.value

  const market = marketOf(code)
  const url = (market === 'us' ? US_MINUTE_ENDPOINT : MINUTE_ENDPOINT) + code
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(MINUTE_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`腾讯分时返回 HTTP ${String(response.status)}`)

  const payload = await response.json() as {
    code?: number
    data?: Record<string, { data?: { data?: unknown[]; date?: string } }>
  }
  const node = payload.data?.[code]
  const rows = node?.data?.data
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('该标的暂无分时数据（可能未开盘或已休市）')
  }

  const lot = isLotMarket(market)
  const points: IntradayPoint[] = []
  let prevVolume = 0
  let priceSum = 0

  for (const raw of rows) {
    if (typeof raw !== 'string') continue
    const parts = raw.trim().split(/\s+/)
    if (parts.length < 3) continue
    const stamp = parts[0] ?? ''
    if (stamp.length < 4) continue

    const price = num(parts[1])
    if (price <= 0) continue

    const cumVolume = num(parts[2])
    const cumAmount = num(parts[3])
    const volume = Math.max(0, cumVolume - prevVolume)
    prevVolume = cumVolume

    // A 股 cumVolume 单位是手，cumAmount 单位是元；港美股都是「股 / 元」。
    const tradedShares = lot ? cumVolume * 100 : cumVolume
    priceSum += price
    const avg = cumAmount > 0 && tradedShares > 0
      ? cumAmount / tradedShares
      : priceSum / (points.length + 1)

    points.push({
      time: `${stamp.slice(0, 2)}:${stamp.slice(2, 4)}`,
      price,
      avg,
      volume,
      amount: cumAmount,
    })
  }

  if (points.length === 0) throw new Error('该标的暂无有效分时点')

  // 昨收是分时图的零轴：优先用实时快照，取不到时退化为首个分时价。
  let prevClose = points[0]?.price ?? 0
  let name = code
  try {
    const [quote] = await fetchQuotes([code])
    if (quote !== undefined) {
      if (quote.prevClose > 0) prevClose = quote.prevClose
      name = quote.name
    }
  } catch {
    // 快照失败不影响分时展示。
  }

  const rawDate = node?.data?.date ?? ''
  const date = /^\d{8}$/.test(rawDate)
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : new Date().toISOString().slice(0, 10)

  const series: IntradaySeries = {
    code,
    name,
    date,
    prevClose,
    points,
    currency: currencyOf(market),
    market,
  }
  minuteCache.set(code, { at: Date.now(), value: series })
  return series
}

/**
 * K 线接口要求美股代码带交易所后缀（`usAAPL.OQ`），
 * 归一化后的 `usAAPL` 只能拿到残缺的历史，这里用快照里的原始代码补上。
 * @param code - 已归一化的代码。
 * @returns 可直接拼进 K 线接口的代码。
 */
async function resolveQueryCode(code: string): Promise<string> {
  if (marketOf(code) !== 'us') return code
  const cached = usSymbolCache.get(code)
  if (cached !== undefined) return cached

  try {
    const response = await fetch(QT_ENDPOINT + code, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    })
    if (!response.ok) return code
    const text = new TextDecoder('gbk').decode(await response.arrayBuffer())
    const match = /^v_[^=]+="([\s\S]*?)"/m.exec(text)
    if (match === null) return code
    const full = ((match[1] ?? '').split('~')[2] ?? '').trim()
    if (!/^[A-Za-z][A-Za-z.\-]*\.[A-Za-z]{1,3}$/.test(full)) return code
    const resolved = `us${full.toUpperCase()}`
    usSymbolCache.set(code, resolved)
    return resolved
  } catch {
    return code
  }
}

/**
 * 拉取单只标的的 K 线。
 * @param code - 已归一化的代码。
 * @param period - 日 / 周 / 月。
 * @param count - 需要的根数。
 * @returns K 线序列，按时间升序。
 */
export async function fetchKline(code: string, period: KlinePeriod, count = 60): Promise<KlineSeries> {
  const key = `${code}:${period}:${String(count)}`
  const cached = klineCache.get(key)
  if (cached !== undefined && Date.now() - cached.at < KLINE_TTL_MS) return cached.value

  const query = await resolveQueryCode(code)
  const url = `${KLINE_ENDPOINT}${query},${period},,,${String(count)},qfq`
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(KLINE_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`腾讯 K 线返回 HTTP ${String(response.status)}`)

  const payload = await response.json() as {
    code?: number
    data?: Record<string, Record<string, unknown>>
  }
  const node = payload.data?.[query] ?? Object.values(payload.data ?? {})[0]
  if (node === undefined) throw new Error('该标的暂无 K 线数据')

  // A 股走前复权（qfqday / qfqweek / qfqmonth），港美股只有原始 day / week / month。
  const rows = node[`qfq${period}`] ?? node[period]
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('该标的暂无 K 线数据')

  const market = marketOf(code)
  const lot = isLotMarket(market)
  const candles: Candle[] = []
  for (const raw of rows) {
    if (!Array.isArray(raw) || raw.length < 6) continue
    const [date, open, close, high, low, volume] = raw as unknown[]
    const candle: Candle = {
      date: String(date ?? '').slice(0, 10),
      open: num(String(open ?? '')),
      close: num(String(close ?? '')),
      high: num(String(high ?? '')),
      low: num(String(low ?? '')),
      // K 线里的成交量同样是「手」，统一折算成股。
      volume: lot ? num(String(volume ?? '')) * 100 : num(String(volume ?? '')),
    }
    if (candle.close <= 0 || candle.high <= 0) continue
    candles.push(candle)
  }
  if (candles.length === 0) throw new Error('该标的暂无 K 线数据')
  candles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const qt = node.qt as Record<string, unknown[]> | undefined
  const rawName = qt?.[query]?.[1]
  let name = typeof rawName === 'string' ? rawName.trim() : ''
  if (name === '') {
    try {
      const [quote] = await fetchQuotes([code])
      name = quote?.name ?? code
    } catch {
      name = code
    }
  }

  const series: KlineSeries = {
    code,
    name,
    period,
    candles,
    market,
    currency: currencyOf(market),
  }
  klineCache.set(key, { at: Date.now(), value: series })
  return series
}
