/**
 * /api/dsh-stock/* 宿主路由。
 *
 * 只做行情代理与归一化，不落盘、不鉴权、不缓存用户数据 ——
 * 自选股列表保存在浏览器半区的 localStorage 里，宿主是无状态的。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { normalizeSymbol } from '../core/symbol.ts'
import type { KlinePeriod, KlineResponse, MinuteResponse, QuotesResponse } from '../core/types.ts'
import { fetchIntraday, fetchKline, fetchQuotes } from './tencent.ts'

/** 路由前缀。 */
export const STOCK_API_PREFIX = '/api/dsh-stock'

/** 一次最多查询的标的数。 */
const MAX_CODES = 40

/** 允许的 K 线周期。 */
const PERIODS: readonly KlinePeriod[] = ['day', 'week', 'month']

/** K 线默认根数与上下限。 */
const DEFAULT_COUNT = 60
const MIN_COUNT = 20
const MAX_COUNT = 240

/**
 * 写出 JSON 响应。
 * @param res - 响应对象。
 * @param status - HTTP 状态码。
 * @param body - 响应体。
 */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

/**
 * 读取查询参数。
 * @param req - 请求对象。
 * @returns 解析后的 URL。
 */
function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://127.0.0.1')
}

/**
 * 实时报价路由：`GET /api/dsh-stock/quotes?codes=sh600519,hk00700,usAAPL`
 * @returns 路由定义。
 */
export function makeQuotesRoute(): WebRoute {
  return {
    kind: 'exact',
    path: `${STOCK_API_PREFIX}/quotes`,
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const raw = requestUrl(req).searchParams.get('codes') ?? ''
      const codes = raw
        .split(',')
        .map((item) => normalizeSymbol(item))
        .filter((item): item is string => item !== null)
        .slice(0, MAX_CODES)

      if (codes.length === 0) {
        writeJson(res, 400, { ok: false, quotes: [], error: '缺少有效的 codes 参数' } satisfies QuotesResponse)
        return
      }

      try {
        const quotes = await fetchQuotes(codes)
        writeJson(res, 200, { ok: true, quotes } satisfies QuotesResponse)
      } catch (error) {
        writeJson(res, 502, {
          ok: false,
          quotes: [],
          error: error instanceof Error ? error.message : '行情请求失败',
        } satisfies QuotesResponse)
      }
    },
  }
}

/**
 * 分时路由：`GET /api/dsh-stock/minute?code=sh600519`
 * @returns 路由定义。
 */
export function makeMinuteRoute(): WebRoute {
  return {
    kind: 'exact',
    path: `${STOCK_API_PREFIX}/minute`,
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const raw = requestUrl(req).searchParams.get('code') ?? ''
      const code = normalizeSymbol(raw)
      if (code === null) {
        writeJson(res, 400, { ok: false, error: '缺少有效的 code 参数' } satisfies MinuteResponse)
        return
      }

      try {
        const series = await fetchIntraday(code)
        writeJson(res, 200, { ok: true, series } satisfies MinuteResponse)
      } catch (error) {
        writeJson(res, 502, {
          ok: false,
          error: error instanceof Error ? error.message : '分时请求失败',
        } satisfies MinuteResponse)
      }
    },
  }
}

/**
 * K 线路由：`GET /api/dsh-stock/kline?code=sh600519&period=day&count=60`
 * @returns 路由定义。
 */
export function makeKlineRoute(): WebRoute {
  return {
    kind: 'exact',
    path: `${STOCK_API_PREFIX}/kline`,
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const url = requestUrl(req)
      const code = normalizeSymbol(url.searchParams.get('code') ?? '')
      if (code === null) {
        writeJson(res, 400, { ok: false, error: '缺少有效的 code 参数' } satisfies KlineResponse)
        return
      }

      const rawPeriod = url.searchParams.get('period') ?? 'day'
      const period = PERIODS.find((item) => item === rawPeriod)
      if (period === undefined) {
        writeJson(res, 400, { ok: false, error: 'period 只支持 day / week / month' } satisfies KlineResponse)
        return
      }

      const rawCount = Number(url.searchParams.get('count') ?? DEFAULT_COUNT)
      const count = Number.isFinite(rawCount)
        ? Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(rawCount)))
        : DEFAULT_COUNT

      try {
        const series = await fetchKline(code, period, count)
        writeJson(res, 200, { ok: true, series } satisfies KlineResponse)
      } catch (error) {
        writeJson(res, 502, {
          ok: false,
          error: error instanceof Error ? error.message : 'K 线请求失败',
        } satisfies KlineResponse)
      }
    },
  }
}
