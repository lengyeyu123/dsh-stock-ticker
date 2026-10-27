/**
 * host 半区入口：在 DSH 宿主进程里注册行情代理路由。
 *
 * 只依赖官方 `webServer` 服务，不碰任何 Desktop 内部实现，
 * 因此在 `dsh web` 和 DSH Desktop 里都能加载。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeMinuteRoute, makeQuotesRoute } from './host/routes.ts'

export const name = 'dsh-stock-ticker'

/** 只需要 HTTP 路由注册能力。 */
export const inject = ['webServer']

/**
 * 挂载 /api/dsh-stock/quotes 与 /api/dsh-stock/minute。
 * @param ctx - 宿主上下文。
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register(makeQuotesRoute()),
      ctx.webServer.register(makeMinuteRoute()),
    ]
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // 路由 fiber 已随宿主关闭。
        }
      }
    }
  }, 'dsh-stock-ticker: 行情路由')
}
