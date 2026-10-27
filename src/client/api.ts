/**
 * 行情客户端。
 *
 * 首选宿主代理（`api/dsh-stock/*`，document-relative —— GUI 用 `<base href="./">`
 * 提供服务，子路径部署也能正确解析）；宿主半区不可用时退化为浏览器直连腾讯接口
 * （两个端点都带 `Access-Control-Allow-Origin: *`，且解析逻辑与宿主侧完全共用）。
 */
import type { IntradaySeries, MinuteResponse, Quote, QuotesResponse } from '../core/types.ts'
import { fetchIntraday, fetchQuotes } from '../host/tencent.ts'

const QUOTES_PATH = 'api/dsh-stock/quotes'
const MINUTE_PATH = 'api/dsh-stock/minute'

const HOST_TIMEOUT_MS = 12_000

/**
 * 带超时的 JSON 请求。
 * @param url - 目标地址。
 * @returns 解析后的 JSON。
 */
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(HOST_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as T
}

export interface QuoteClient {
  quotes(codes: readonly string[]): Promise<Quote[]>
  minute(code: string): Promise<IntradaySeries>
  /** 最近一次成功取数走的是宿主代理还是浏览器直连。 */
  transport(): 'host' | 'direct'
}

/**
 * 创建客户端实例。
 * @returns 行情客户端。
 */
export function createQuoteClient(): QuoteClient {
  let host: 'unknown' | 'ok' | 'down' = 'unknown'

  return {
    transport: () => (host === 'down' ? 'direct' : 'host'),

    async quotes(codes) {
      if (codes.length === 0) return []
      if (host !== 'down') {
        try {
          const body = await getJson<QuotesResponse>(`${QUOTES_PATH}?codes=${encodeURIComponent(codes.join(','))}`)
          if (body.ok && body.quotes.length > 0) {
            host = 'ok'
            return body.quotes
          }
          throw new Error(body.error ?? '行情请求失败')
        } catch (error) {
          if (host === 'ok') throw error
          host = 'down'
        }
      }
      return await fetchQuotes(codes)
    },

    async minute(code) {
      if (host !== 'down') {
        try {
          const body = await getJson<MinuteResponse>(`${MINUTE_PATH}?code=${encodeURIComponent(code)}`)
          if (body.ok && body.series !== undefined) {
            host = 'ok'
            return body.series
          }
          throw new Error(body.error ?? '分时请求失败')
        } catch (error) {
          if (host === 'ok') throw error
          host = 'down'
        }
      }
      return await fetchIntraday(code)
    },
  }
}
