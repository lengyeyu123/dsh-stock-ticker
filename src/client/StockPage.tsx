/**
 * 设置页落位：把同一个行情面板放进 shell 的一级设置导航。
 *
 * 侧栏槽位在部分 shell 版本里可能不存在，这个页面是兜底入口，
 * 同时也是一个空间更大的行情看板。
 */
import type { QuoteClient } from './api.ts'
import type { StockStore } from './store.ts'
import { StockPanel } from './StockPanel.tsx'

export interface StockPageProps {
  store: StockStore
  client: QuoteClient
}

/**
 * 行情页面。
 * @param props - store 与行情客户端。
 * @returns 页面。
 */
export function StockPage({ store, client }: StockPageProps) {
  return (
    <div style={{ padding: '18px 20px 28px' }}>
      <StockPanel store={store} client={client} variant="page" />
    </div>
  )
}
