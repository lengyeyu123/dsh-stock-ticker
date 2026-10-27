/**
 * 面板级样式。
 *
 * 组件全部用内联样式，只有内联表达不了的东西才落到这张表里：
 * `:focus-visible` 描边、占位符颜色、滚动条、减弱动效。
 * 表是全局的（只注入一次），所有选择器都收在 `[data-dsh-stock-panel]` 下，
 * 不会污染 shell 的其它区域。
 */

const STYLE_ID = 'dsh-stock-ticker-panel-style'

const CSS = `
[data-dsh-stock-panel] button { font-family: inherit; }
[data-dsh-stock-panel] button:focus-visible,
[data-dsh-stock-panel] input:focus-visible,
[data-dsh-stock-panel] [role="switch"]:focus-visible {
  outline: 2px solid var(--stk-focus, #2f6bff);
  outline-offset: 1px;
}
[data-dsh-stock-panel] input::placeholder { color: var(--stk-faint, #8b95a3); }
[data-dsh-stock-panel] ::-webkit-scrollbar { width: 8px; height: 8px; }
[data-dsh-stock-panel] ::-webkit-scrollbar-track { background: transparent; }
[data-dsh-stock-panel] ::-webkit-scrollbar-thumb {
  background: var(--stk-scroll, rgba(128, 128, 128, 0.28));
  border: 2px solid transparent;
  border-radius: 8px;
  background-clip: padding-box;
}
[data-dsh-stock-panel] ::-webkit-scrollbar-thumb:hover { background-color: var(--stk-scroll-strong, rgba(128, 128, 128, 0.45)); }
@media (prefers-reduced-motion: reduce) {
  [data-dsh-stock-panel] * {
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
  }
}
`

/**
 * 注入面板样式，重复调用安全。
 */
export function ensurePanelStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
