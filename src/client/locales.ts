/**
 * 文案字典。
 *
 * 注册进 shell 的 locale 服务（slot 注册需要 `locale` 命名空间），
 * 组件内部直接用中文字面量，避免依赖 `t()` 的运行时形态。
 */

/** 字典命名空间。 */
export const NS = 'dsh-stock-ticker'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件的文案键并集，register 时逐键校验。 */
    'dsh-stock-ticker': keyof typeof zh
  }
}

export const zh = {
  'stock.title': '自选行情',
  'stock.subtitle': '实时报价 · 分时图 · 柱状图',
  'stock.empty': '还没有自选标的',
  'stock.add': '添加',
  'stock.addPlaceholder': '代码或名称，如 600519 / hk00700 / AAPL',
  'stock.refresh': '刷新',
  'stock.interval': '刷新频率',
  'stock.line': '折线',
  'stock.bar': '柱状',
  'stock.volume': '成交量',
  'stock.back': '返回',
  'stock.remove': '移出自选',
  'stock.error': '行情获取失败',
}

export const en = {
  'stock.title': 'Watchlist',
  'stock.subtitle': 'Live quotes · intraday · bars',
  'stock.empty': 'No symbols yet',
  'stock.add': 'Add',
  'stock.addPlaceholder': 'Symbol, e.g. 600519 / hk00700 / AAPL',
  'stock.refresh': 'Refresh',
  'stock.interval': 'Refresh rate',
  'stock.line': 'Line',
  'stock.bar': 'Bars',
  'stock.volume': 'Volume',
  'stock.back': 'Back',
  'stock.remove': 'Remove',
  'stock.error': 'Quote request failed',
}
