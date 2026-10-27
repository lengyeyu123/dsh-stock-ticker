/**
 * 面板内部复用的小控件：图标、图标按钮、分段选择、开关、设置分组。
 *
 * 全部走内联样式 + 传入的调色板，保证跟着 shell 主题走；
 * 只保留键盘可达性所需的 `:focus-visible`（见 styles.ts）。
 */
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Palette } from './theme.ts'

/** 可用图标。 */
export type IconName =
  | 'settings'
  | 'refresh'
  | 'close'
  | 'chevron-left'
  | 'plus'
  | 'trash'
  | 'pin'
  | 'pencil'
  | 'check'

const ICONS: Record<IconName, ReactNode> = {
  settings: (
    <>
      <path d="M2.5 5h5.2M11.3 5h2.2M2.5 11h2.2M8.3 11h5.2" />
      <circle cx="9.5" cy="5" r="1.7" />
      <circle cx="6.5" cy="11" r="1.7" />
    </>
  ),
  refresh: (
    <>
      <path d="M13 7.2A5 5 0 1 1 11.4 3.6" />
      <path d="M13 2.6v3.2H9.8" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  'chevron-left': <path d="M10 3.5 5.5 8l4.5 4.5" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  trash: <path d="M3.2 4.8h9.6M6.4 4.8V3.2h3.2v1.6M5.2 4.8l.5 7.4h4.6l.5-7.4" />,
  pin: <path d="M8 13V4.2M4.6 7.6 8 4.2l3.4 3.4" />,
  pencil: <path d="M3 13h2.3l6.9-6.9-2.3-2.3L3 10.7V13z" />,
  check: <path d="M3.4 8.4 6.3 11.3 12.6 5" />,
}

/**
 * 线性图标。
 * @param props - 图标名与尺寸。
 * @returns SVG。
 */
export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      {ICONS[name]}
    </svg>
  )
}

export interface IconButtonProps {
  label: string
  icon: IconName
  onClick(event: React.MouseEvent<HTMLButtonElement>): void
  palette: Palette
  /** 悬停/激活时的强调色。 */
  tone?: string
  active?: boolean
  size?: number
}

/**
 * 图标按钮：24×24 命中区，悬停有底色，必带 aria-label。
 * @param props - 图标、标签、回调、调色板。
 * @returns 按钮。
 */
export function IconButton({ label, icon, onClick, palette, tone, active = false, size = 14 }: IconButtonProps) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      data-no-drag=""
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={() => { setHover(true) }}
      onMouseLeave={() => { setHover(false) }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        padding: 0,
        border: 'none',
        borderRadius: 6,
        background: hover || active ? palette.hover : 'transparent',
        color: active ? (tone ?? palette.accent) : (hover ? (tone ?? palette.text) : palette.subtext),
        cursor: 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedProps<T extends string> {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange(value: T): void
  palette: Palette
  ariaLabel: string
}

/**
 * 分段选择。
 * @param props - 选项、当前值、回调。
 * @returns 分段控件。
 */
export function Segmented<T extends string>({ value, options, onChange, palette, ariaLabel }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', border: `1px solid ${palette.border}`, borderRadius: 8, overflow: 'hidden' }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => { onChange(option.value) }}
            style={{
              border: 'none',
              padding: '4px 11px',
              fontSize: 11,
              lineHeight: 1.6,
              cursor: 'pointer',
              background: active ? palette.accent : 'transparent',
              color: active ? '#fff' : palette.subtext,
              transition: 'background 120ms ease',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export interface SwitchProps {
  checked: boolean
  onChange(checked: boolean): void
  label: string
  palette: Palette
}

/**
 * 开关。
 * @param props - 状态、回调、无障碍标签。
 * @returns 开关按钮。
 */
export function Switch({ checked, onChange, label, palette }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { onChange(!checked) }}
      style={{
        position: 'relative',
        width: 32,
        height: 18,
        padding: 0,
        border: 'none',
        borderRadius: 9,
        background: checked ? palette.accent : palette.border,
        cursor: 'pointer',
        transition: 'background 140ms ease',
        flex: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,.24)',
          transform: checked ? 'translateX(14px)' : 'translateX(0)',
          transition: 'transform 140ms ease',
        }}
      />
    </button>
  )
}

export interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
  palette: Palette
  style?: CSSProperties
}

/**
 * 设置项：左标题右控件。
 * @param props - 标题、说明、控件。
 * @returns 一行设置。
 */
export function Field({ label, hint, children, palette, style }: FieldProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.text }}>{label}</div>
        {hint !== undefined && (
          <div style={{ fontSize: 10.5, color: palette.faint, marginTop: 2, lineHeight: 1.5 }}>{hint}</div>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * 设置分组。
 * @param props - 标题与内容。
 * @returns 分组块。
 */
export function Section({ title, action, children, palette }: {
  title: string
  action?: ReactNode
  children: ReactNode
  palette: Palette
}) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 500, color: palette.faint }}>{title}</h3>
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </section>
  )
}
