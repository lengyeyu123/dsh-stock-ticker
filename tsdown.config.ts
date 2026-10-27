/**
 * Standalone tsdown config for dsh-stock-ticker.
 *
 * DSH 的 browser 半区不是普通 ESM 模块，而是闭包工厂产物：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 * 外部依赖（react / cordis / slots ...）通过 loader 注入的 `require`
 * 从 shell 的冻结模块表里解析，所以 external 列表必须与
 * shared/web-platform.ts 的 PLATFORM_MODULES 完全一致。
 *
 * 本插件不使用 CSS Modules（全部走内联样式），因此不需要 lightningcss 那一层。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { UserConfig } from 'tsdown'

/** 与 package.json 的 name 一致，会写进 __ModuleLoader__.load 的 id。 */
const PLUGIN_ID = 'dsh-stock-ticker'

/** shell 冻结模块表（不可增减：表外模块必须内联，否则运行时 require 必抛）。 */
const PLATFORM_MODULES: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

function packageVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: string }
    return typeof manifest.version === 'string' ? manifest.version : ''
  } catch {
    return ''
  }
}

/** host 半区：ESM，产出 lib/index.js，cordis 由 profile 树提供。 */
const hostHalf: UserConfig = {
  name: PLUGIN_ID,
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: ['@deepseek-ai/cordis'],
}

/** browser 半区：CJS + 闭包工厂外壳，产出 lib/client.js。 */
const clientHalf: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...PLATFORM_MODULES],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    __DSH_PKG_VERSION__: JSON.stringify(packageVersion()),
  },
  // 模块表内的保持 external；表外依赖一律内联。
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [hostHalf, clientHalf]
