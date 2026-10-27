/**
 * 行情数据的跨半区契约（host 产出、client 消费）。
 * 纯类型层，无运行时依赖。
 */

/** 归一化后的市场前缀。 */
export type Market = 'sh' | 'sz' | 'bj' | 'hk' | 'us'

/** 计价货币。 */
export type Currency = 'CNY' | 'HKD' | 'USD'

/** 一条实时快照。 */
export interface Quote {
  /** 归一化代码，如 sh600519 / hk00700 / usAAPL。 */
  code: string
  market: Market
  /** 交易所内的原始代码，如 600519 / 00700 / AAPL。 */
  symbol: string
  name: string
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  /** 涨跌额。 */
  change: number
  /** 涨跌幅，百分数（0.44 表示 +0.44%）。 */
  changePct: number
  /** 成交量，统一折算成「股」。 */
  volume: number
  /** 成交额，统一折算成计价货币单位。 */
  amount: number
  /** 换手率，百分数；部分市场不提供则为 0。 */
  turnoverRate: number
  /** 市盈率；部分市场不提供则为 0。 */
  pe: number
  currency: Currency
  /** 行情时间，格式 YYYY-MM-DD HH:mm:ss。 */
  time: string
  /** 停牌 / 无有效报价。 */
  stale: boolean
}

/** 分时序列中的一个点。 */
export interface IntradayPoint {
  /** HH:mm。 */
  time: string
  price: number
  /** 均价；数据源不提供成交额时退化为累计均价。 */
  avg: number
  /** 该分钟成交量（股）。 */
  volume: number
  /** 该分钟成交额。 */
  amount: number
}

/** 一天的完整分时序列。 */
export interface IntradaySeries {
  code: string
  name: string
  /** 交易日 YYYY-MM-DD。 */
  date: string
  /** 昨收，作为分时图的零轴。 */
  prevClose: number
  points: IntradayPoint[]
  currency: Currency
  market: Market
}

/** /api/dsh-stock/quotes 的响应。 */
export interface QuotesResponse {
  ok: boolean
  quotes: Quote[]
  error?: string
}

/** /api/dsh-stock/minute 的响应。 */
export interface MinuteResponse {
  ok: boolean
  series?: IntradaySeries
  error?: string
}
