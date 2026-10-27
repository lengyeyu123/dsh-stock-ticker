/**
 * browser 半区入口。
 *
 * 三件事：
 *   1. 注册文案字典（slot 注册需要 locale 命名空间）
 *   2. 往 `sidebar.footer.action` 槽位挂侧栏入口按钮
 *   3. 往 `settings.section` 槽位挂一级行情页（兜底 + 大屏看板）
 * 另外在 body 上常驻一个 React root 承载浮层面板与轮询循环。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createQuoteClient, type QuoteClient } from './api.ts'
import { createStockStore, type StockStore } from './store.ts'
import { ensurePanelStyles } from './styles.ts'
import { NS, en, zh } from './locales.ts'
import { StockDock } from './StockDock.tsx'
import { StockPage } from './StockPage.tsx'
import { StockTickerButton } from './StockTickerButton.tsx'

/** 只需要槽位注册与文案字典。 */
export const inject = ['slots', 'locale']

/** 侧栏入口的槽位键。 */
const SIDEBAR_SLOT = 'sidebar.footer.action'

/** 一级设置页的槽位键。 */
const SETTINGS_SLOT = 'settings.section'

/** 浮层容器的标记，用于 HMR 重挂时去重。 */
const ROOT_ATTR = 'data-dsh-stock-root'

interface SlotRegistry {
  inject?(key: string, callback: () => (() => void) | void): unknown
  register(options: unknown, component: unknown): unknown
}

/**
 * 把组件注册进槽位：优先等槽位声明（slots.inject），
 * 不支持时退回直接注册。两种路径都吞掉注册异常，避免拖垮整个插件。
 * @param ctx - 客户端上下文。
 * @param key - 槽位键。
 * @param options - 槽位注册选项。
 * @param component - 组件。
 */
function seat(ctx: ClientContext, key: string, options: Record<string, unknown>, component: unknown): void {
  const slots = ctx.slots as unknown as SlotRegistry
  const register = (): (() => void) => {
    const dispose = slots.register(options, component)
    return () => {
      try {
        (dispose as () => void)()
      } catch {
        // 槽位 fiber 已随 shell 卸载。
      }
    }
  }

  if (typeof slots.inject === 'function') {
    try {
      slots.inject(key, register)
      return
    } catch {
      // 退回直接注册。
    }
  }
  try {
    register()
  } catch {
    // 该 shell 版本没有这个槽位。
  }
}

/**
 * 插件主体。
 * @param ctx - 客户端上下文。
 */
export function apply(ctx: ClientContext): void {
  const store: StockStore = createStockStore()
  const client: QuoteClient = createQuoteClient()

  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'dsh-stock-ticker: 文案字典')

  // 侧栏入口按钮
  seat(ctx, SIDEBAR_SLOT, {
    name: SIDEBAR_SLOT,
    id: 'dsh-stock-ticker',
    order: 40,
    locale: NS,
    inject: () => ({ store, client }),
  }, StockTickerButton)

  // 一级行情页
  seat(ctx, SETTINGS_SLOT, {
    name: SETTINGS_SLOT,
    id: 'dsh-stock-ticker',
    order: 168,
    locale: NS,
    label: () => '自选行情',
    inject: () => ({ store, client }),
  }, StockPage)

  // 浮层面板 + 轮询循环：常驻 body，不受 shell 重渲染影响
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    ensurePanelStyles()
    const existing = document.querySelector(`[${ROOT_ATTR}]`)
    if (existing !== null) existing.remove()

    const container = document.createElement('div')
    container.setAttribute(ROOT_ATTR, '')
    document.body.appendChild(container)
    const root = createRoot(container)
    root.render(createElement(StockDock, { store, client }))

    return () => {
      root.unmount()
      container.remove()
    }
  }, 'dsh-stock-ticker: 浮层')
}
