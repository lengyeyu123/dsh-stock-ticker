# dsh-stock-ticker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-stock-ticker.svg)](https://www.npmjs.com/package/dsh-stock-ticker)
[![CI](https://github.com/lengyeyu123/dsh-stock-ticker/actions/workflows/ci.yml/badge.svg)](https://github.com/lengyeyu123/dsh-stock-ticker/actions/workflows/ci.yml)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.1--rc.3-2f6bff)](https://github.com/anywhere-labs/dsh-desktop)

DSH Desktop / DeepSeek Harness 的自选股行情插件。侧栏常驻一条实时报价，点开是浮层面板：
自选列表 → 点任意标的 → 分时图 / 日K / 周K / 月K，支持 A 股、港股、美股。
面板里的刷新频率、图表形态、涨跌配色、密度可以存成自己的「配置方案」，一键切换盯盘 / 省流。

> 仓库：<https://github.com/lengyeyu123/dsh-stock-ticker>

- 数据源：腾讯行情（`qt.gtimg.cn` + `web.ifzq.gtimg.cn`），免费、无需 API Key
- 双半区：宿主侧代理 + 浏览器侧 UI，宿主不可用时浏览器直连兜底
- 涨跌配色默认遵循 A 股习惯：**红涨绿跌**，可切绿涨红跌

| 自选列表 | 个股详情 | 配置方案 |
| :---: | :---: | :---: |
| ![](preview/panel-list.png) | ![](preview/panel-detail.png) | ![](preview/panel-settings.png) |

免构建预览：直接打开 `preview/stock-panel-preview.html`（直连真实行情）。
若浏览器拦截跨域，用 `python -m http.server` 起个本地服务再访问；断网时加 `?mock=1` 看离线演示数据，
`?theme=dark` 切深色，`?tone=us` 看绿涨红跌，`?density=compact` 看紧凑列表，`?view=settings` 直接打开设置页，
`?kind=day` 直接开日K（也支持 `week` / `month`），`?bare=1` 隐藏说明文字便于截图，`#code=sh600519` 直接打开某个标的。

## 配置方案

偏好分成两层，都只存在浏览器 `localStorage`（键 `dsh.stock-ticker.prefs.v2`，旧版 `v1` 首次读取时自动迁移）：

- **当前参数**：刷新频率、图表形态、涨跌配色、列表密度、侧栏轮播。
- **配置方案**：一组参数的命名快照。内置「标准 / 盯盘 / 省流」三套且只读；
  点「+ 新建」把当前参数存成自己的方案，之后可以重命名、删除，改过参数后能「保存」回方案或「另存为」新方案。

宿主半区不落盘、不鉴权、不保存任何用户数据。

## 功能

| 能力 | 说明 |
| --- | --- |
| 实时报价 | 默认 5s 一轮，快捷档位 3s / 5s / 10s / 30s / 60s，也可填 1～600 秒的任意值；窗口不可见时自动停轮询，回到前台立刻补一次 |
| 配置方案 | 内置「标准 / 盯盘 / 省流」三套；可新建自己的方案（刷新频率、图表形态、涨跌配色、密度、侧栏轮播一起存），点一下整组套用，改过的参数可存回方案或另存为新方案 |
| 自选管理 | 输入 `600519` / `sh600519` / `600519.SH` / `700` / `AAPL` / `AAPL.OQ` 都能识别；支持空格 / 逗号批量粘贴；行内可置顶、移出 |
| 分时图 | 价格折线 + 均价虚线 + 昨收零轴 + 右侧百分比轴 + 十字光标读数 |
| K 线 | 日K / 周K / 月K 蜡烛图，带 MA5 / MA10 / MA20 与成交量；A 股走前复权，港美股用原始价 |
| 柱状图 | 分时视图切「柱状」→ 每分钟价格相对昨收的涨跌柱；下方常驻成交量柱（按分钟涨跌上色） |
| 涨跌配色 | 红涨绿跌（A 股习惯）/ 绿涨红跌（欧美习惯）一键切换，图表、列表、侧栏入口同步 |
| 列表密度 | 标准 / 紧凑两档，紧凑模式省掉副标题行，一屏多看两三只 |
| 交易时段 | 详情页按市场本地时间显示「交易中 / 午间休市 / 盘前 / 已收盘」 |
| 侧栏入口 | 挂在 `sidebar.footer.action` 槽位，轮播自选标的的涨跌幅；悬停暂停轮播，可整体关闭 |
| 行情页 | 同时注册 `settings.section` 一级页面，作为大屏看板与槽位缺失时的兜底 |

## 目录结构

```
dsh-stock-ticker/
├── cordis.patch.yml          # 插件行清单，dsh plugin 靠它挂载
├── package.json              # dsh.bundle.patch + dsh.client 声明
├── tsdown.config.ts          # 双半区构建（host: ESM / client: __ModuleLoader__ 闭包工厂）
├── icon.svg
├── preview/
│   └── stock-panel-preview.html   # 免构建的界面预览（直连真实行情）
└── src/
    ├── index.ts              # host 半区入口：注册 /api/dsh-stock/*
    ├── core/
    │   ├── types.ts          # 跨半区契约
    │   └── symbol.ts         # 代码归一化
    ├── host/
    │   ├── tencent.ts        # 腾讯行情抓取、GBK 解码、单位折算、TTL 缓存
    │   └── routes.ts         # HTTP 路由
    └── client/
        ├── index.ts          # browser 半区入口：槽位注册 + 浮层挂载
        ├── store.ts          # 极简可观察 store + 偏好/配置方案持久化
        ├── api.ts            # 宿主代理优先、浏览器直连兜底
        ├── theme.ts          # 亮/暗主题探测、调色板、涨跌配色方向
        ├── styles.ts         # 面板级样式（focus-visible / 滚动条 / 减弱动效）
        ├── format.ts         # 数字/成交量/成交额/相对时间/交易时段
        ├── locales.ts        # 文案字典
        ├── ui.tsx            # 图标、图标按钮、分段选择、开关、设置分组
        ├── StockDock.tsx     # 轮询循环 + 浮层容器
        ├── StockTickerButton.tsx  # 侧栏入口按钮
        ├── StockPanel.tsx    # 列表 / 详情 / 设置三视图外壳
        ├── SettingsView.tsx  # 配置方案与逐项参数
        ├── StockPage.tsx     # 一级页面落位
        ├── IntradayChart.tsx # 分时图 / 柱状图（纯 SVG 手绘）
        └── CandleChart.tsx   # K 线蜡烛图 + 均线（纯 SVG 手绘）
```

## 安装

### 从 npm 安装（推荐）

```bash
dsh plugin --profile <profile-name> add dsh-stock-ticker
```

包地址：<https://www.npmjs.com/package/dsh-stock-ticker>

装完重启 DSH Desktop（或重新加载当前工作配置），侧栏底部会出现「自选行情」按钮。

### 从 GitHub 安装（跟最新代码）

```bash
dsh plugin --profile <profile-name> add github:lengyeyu123/dsh-stock-ticker
```

npm 装 git 依赖时会自动跑 `prepare`（类型检查 + 构建），不需要手动 build。
每个版本的 [Releases](https://github.com/lengyeyu123/dsh-stock-ticker/releases) 里也挂了打包好的 tarball，离线环境可以本地装。

### 本地开发

```bash
git clone https://github.com/lengyeyu123/dsh-stock-ticker.git
cd dsh-stock-ticker
npm install
npm run build          # 产出 lib/index.js + lib/client.js + lib/types/

# 链接进当前 profile
dsh plugin --profile <profile-name> add "link:<绝对路径>/dsh-stock-ticker"
```

> `lib/` 和 `node_modules/` 不进版本库，所以 clone 下来必须先 `npm install && npm run build`。
> 用 `link:` 安装时也必须指向**已构建**的目录。

### 卸载

```bash
dsh plugin --profile <profile-name> remove dsh-stock-ticker
```

## 开发与发布

```bash
npm run typecheck   # tsc --noEmit
npm run build       # 产出 lib/index.js + lib/client.js + lib/types/
npm run clean       # 删掉 lib/
```

仓库自带两个 workflow：

| workflow | 触发 | 做什么 |
| --- | --- | --- |
| `ci.yml` | push / PR 到 `main` | Node 22 与 24 双版本跑类型检查 + 构建，并校验产物约定（`client.js` 必须是 `__ModuleLoader__` 闭包工厂、只能 `require` 冻结模块表里的依赖、类型声明要能对上 `exports`） |
| `release.yml` | 推送 `v*` tag | 校验 tag 与 `package.json` 版本一致，跑类型检查 + 构建，发布到 npm（该版本已存在则跳过），再建 GitHub Release 并附 tarball |

发布步骤：

1. 仓库 Settings → Secrets and variables → Actions 里加 `NPM_TOKEN`
   （npm 的 **Automation** token；Granular token 需要给这个包 read/write 权限）
2. `npm version patch && git push --follow-tags`
3. workflow 自动发布带 provenance 的包，并建 Release

> 不想维护 token 可以改用 npm 的 **Trusted Publishing**（OIDC）：在 npm 包设置里绑定本仓库和 `release.yml`，
> 然后把 publish 步骤的 `NODE_AUTH_TOKEN` 删掉即可，workflow 已经带了 `id-token: write`。

## HTTP 接口

宿主半区只做代理，不落盘、不鉴权、不保存用户数据（自选股在浏览器 `localStorage` 里）。

| 路由 | 说明 |
| --- | --- |
| `GET /api/dsh-stock/quotes?codes=sh600519,hk00700,usAAPL` | 批量实时快照，单次上限 40 个 |
| `GET /api/dsh-stock/minute?code=sh600519` | 单只标的当日分时序列 |
| `GET /api/dsh-stock/kline?code=sh600519&period=day&count=60` | 单只标的 K 线，`period` 取 `day` / `week` / `month`，`count` 20～240 |

响应体：

```jsonc
// quotes
{ "ok": true, "quotes": [{ "code": "sh600519", "name": "贵州茅台", "price": 1355.9, "changePct": 0.44, ... }] }

// minute
{ "ok": true, "series": { "code": "sh600519", "prevClose": 1349.98, "points": [{ "time": "09:30", "price": 1343.88, "avg": 1343.88, "volume": 21000 }] } }

// kline
{ "ok": true, "series": { "code": "sh600519", "period": "day", "candles": [{ "date": "2026-10-27", "open": 1343.88, "close": 1355.9, "high": 1357, "low": 1338.01, "volume": 3866900 }] } }
```

## 数据源与单位折算

两个端点都返回 `Access-Control-Allow-Origin: *`，所以浏览器侧也能直连；宿主代理的价值在于
GBK 解码、单位统一和 TTL 缓存（快照 2.5s / 分时 8s）。

| 市场 | 快照接口 | 分时接口 | K 线接口 | 成交量单位 | 成交额单位 |
| --- | --- | --- | --- | --- | --- |
| A 股 / 北交所 | `qt.gtimg.cn/q=` | `minute/query` | `fqkline/get`（`qfqday` / `qfqweek` / `qfqmonth`） | 手（×100 → 股） | 万元（×10000 → 元） |
| 港股 | 同上 | `minute/query` | `fqkline/get`（`day` / `week` / `month`） | 股 | 元 |
| 美股 | 同上 | `UsMinute/query` | `fqkline/get`（`day` / `week` / `month`） | 股 | 美元 |

美股 K 线要带交易所后缀（`usAAPL.OQ`），归一化后的 `usAAPL` 只能拿到残缺历史，
所以宿主侧会先用快照里的原始代码补后缀，再请求 K 线；后缀结果会缓存，不额外增加请求。
美股分时在未开盘时只会返回一个点，此时面板会显示「暂无分时数据（可能未开盘或已休市）」。

## 构建产物约定

DSH 的 browser 半区不是普通 ESM，而是闭包工厂产物：

```js
window.__ModuleLoader__.load({ id: 'dsh-stock-ticker', factory: (require) => { ... } })
```

外部依赖通过 loader 注入的 `require` 从 shell 的冻结模块表解析，所以 `tsdown.config.ts` 里的
`PLATFORM_MODULES` 必须与 shell 的 `web-platform.ts` 完全一致：

```
react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
zod, @tanstack/react-virtual, @deepseek-ai/dsh-client-store,
@deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-primitives,
@deepseek-ai/dsh-client-ui-dockkit
```

表外依赖一律内联 —— 本插件只用 `react` 与 `react-dom/client`，没有第三方图表库（分时图是纯 SVG 手绘）。

## 已知限制

- 腾讯接口是公开免费接口，没有 SLA；高频轮询可能被限流，默认 5s 已经比较保守。
- 配置方案与自选都只存在当前浏览器的 `localStorage`，换设备或清缓存会丢，暂不做云端同步。
- 交易时段按本地时间粗略推断，节假日仍需按休市看待（标签只作参考，不影响取数）。
- 不支持分笔、五档盘口与分钟级 K 线（m5 / m15 / m30 / m60），这些要另接 `kline/mkline`。
- 不支持分笔、五档盘口、K 线切换（这些要另接 `kline/mkline`，且该端点当前需要换 host）。
- 美股分时依赖 `UsMinute/query`，盘前盘后数据不完整。
- 侧栏槽位 `sidebar.footer.action` 在不同 shell 版本上可能不存在；不存在时插件仍可通过
  设置页的「自选行情」进入。

## 许可证

[MIT](LICENSE) © 2026 lengyeyu123

行情数据版权归腾讯及各交易所所有，本插件仅做个人行情展示用途。
