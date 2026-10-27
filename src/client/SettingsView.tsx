/**
 * 设置视图：配置方案 + 逐项参数。
 *
 * 「配置方案」是这一版新增的核心：一组参数可以起名存下来，
 * 点一下整组套用；用户能自建、覆盖、改名、删除，内置方案只读。
 */
import { useState } from 'react'
import type { Palette } from './theme.ts'
import {
  INTERVAL_CHOICES,
  MAX_PROFILE_NAME,
  MAX_INTERVAL_MS,
  MIN_INTERVAL_MS,
  activeProfile,
  isProfileDirty,
  type ChartMode,
  type ColorMode,
  type Density,
  type Profile,
  type StockStore,
} from './store.ts'
import { Field, IconButton, Section, Segmented, Switch } from './ui.tsx'

export interface SettingsViewProps {
  store: StockStore
  palette: Palette
}

/**
 * 间隔的展示文案。
 * @param ms - 毫秒。
 * @returns 如 `5s`。
 */
function intervalLabel(ms: number): string {
  return `${String(Math.round(ms / 1000))}s`
}

/**
 * 一组参数的摘要，用来在方案行下方做副标题。
 * @param profile - 方案。
 * @returns 摘要文案。
 */
function profileSummary(profile: Profile): string {
  const { intervalMs, chartMode, colorMode, density } = profile.settings
  return [
    intervalLabel(intervalMs),
    chartMode === 'bar' ? '柱状' : '折线',
    colorMode === 'cn' ? '红涨绿跌' : '绿涨红跌',
    density === 'compact' ? '紧凑' : '标准',
  ].join(' · ')
}

/**
 * 设置视图。
 * @param props - store 与调色板。
 * @returns 设置面板。
 */
export function SettingsView({ store, palette }: SettingsViewProps) {
  const state = store.getState()
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [customSeconds, setCustomSeconds] = useState(() => {
    const preset = INTERVAL_CHOICES.includes(state.settings.intervalMs)
    return preset ? '' : String(Math.round(state.settings.intervalMs / 1000))
  })

  const current = activeProfile(state)
  const dirty = isProfileDirty(state)

  const flash = (message: string | null): void => { setNotice(message) }

  const submitNew = (): void => {
    const error = store.actions.createProfile(draftName)
    if (error !== null) {
      flash(error)
      return
    }
    setDraftName('')
    setCreating(false)
    flash(null)
  }

  const submitRename = (): void => {
    if (renaming === null) return
    const error = store.actions.renameProfile(renaming.id, renaming.name)
    if (error !== null) {
      flash(error)
      return
    }
    setRenaming(null)
    flash(null)
  }

  const commitCustom = (): void => {
    const seconds = Number(customSeconds)
    if (customSeconds.trim() === '' || !Number.isFinite(seconds)) return
    const ms = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(seconds) * 1000))
    store.actions.patchSettings({ intervalMs: ms })
    setCustomSeconds(String(Math.round(ms / 1000)))
  }

  const customActive = !INTERVAL_CHOICES.includes(state.settings.intervalMs)

  return (
    <div style={{ padding: '12px 12px 20px' }}>
      <Section
        title="配置方案"
        palette={palette}
        action={(
          <button
            type="button"
            onClick={() => { setCreating((prev) => !prev); flash(null) }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              border: 'none',
              background: 'transparent',
              color: palette.accent,
              fontSize: 11,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            + 新建
          </button>
        )}
      >
        {creating && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              autoFocus
              value={draftName}
              maxLength={MAX_PROFILE_NAME}
              onChange={(event) => { setDraftName(event.target.value); flash(null) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitNew()
                if (event.key === 'Escape') { setCreating(false); setDraftName(''); flash(null) }
              }}
              placeholder="配置名，如 早盘盯盘"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '6px 9px',
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${palette.border}`,
                background: palette.surfaceAlt,
                color: palette.text,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={submitNew}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                borderRadius: 8,
                border: 'none',
                background: palette.accent,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              创建
            </button>
          </div>
        )}

        <div style={{ border: `1px solid ${palette.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {state.profiles.map((profile, index) => {
            const active = profile.id === state.activeProfileId
            return (
              <div
                key={profile.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => { store.actions.applyProfile(profile.id); flash(null) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    store.actions.applyProfile(profile.id)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  borderTop: index === 0 ? 'none' : `1px solid ${palette.border}`,
                  background: active ? palette.hover : 'transparent',
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    flex: 'none',
                    border: `1.5px solid ${active ? palette.accent : palette.border}`,
                    background: active ? palette.accent : 'transparent',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}
                >
                  {active && (
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3.4 8.4 6.3 11.3 12.6 5" />
                    </svg>
                  )}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {renaming !== null && renaming.id === profile.id ? (
                    <input
                      autoFocus
                      value={renaming.name}
                      maxLength={MAX_PROFILE_NAME}
                      onClick={(event) => { event.stopPropagation() }}
                      onChange={(event) => { setRenaming({ id: profile.id, name: event.target.value }) }}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter') submitRename()
                        if (event.key === 'Escape') { setRenaming(null); flash(null) }
                      }}
                      onBlur={submitRename}
                      style={{
                        width: '100%',
                        padding: '2px 6px',
                        fontSize: 12.5,
                        borderRadius: 6,
                        border: `1px solid ${palette.accent}`,
                        background: palette.surface,
                        color: palette.text,
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, color: palette.text }}>
                        {profile.name}
                      </span>
                      <span
                        style={{
                          fontSize: 9.5,
                          lineHeight: 1.6,
                          padding: '0 4px',
                          borderRadius: 4,
                          color: palette.faint,
                          background: palette.surfaceAlt,
                          border: `1px solid ${palette.border}`,
                        }}
                      >
                        {profile.builtin ? '内置' : '自定义'}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: palette.faint, marginTop: 2 }}>{profileSummary(profile)}</div>
                </div>

                {!profile.builtin && (
                  <span style={{ display: 'flex', gap: 2, flex: 'none' }}>
                    <IconButton
                      label={`重命名 ${profile.name}`}
                      icon="pencil"
                      size={12}
                      palette={palette}
                      onClick={(event) => {
                        event.stopPropagation()
                        setRenaming({ id: profile.id, name: profile.name })
                        flash(null)
                      }}
                    />
                    <IconButton
                      label={`删除 ${profile.name}`}
                      icon="trash"
                      size={12}
                      palette={palette}
                      onClick={(event) => {
                        event.stopPropagation()
                        const error = store.actions.deleteProfile(profile.id)
                        flash(error)
                      }}
                    />
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {current === undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              padding: '7px 10px',
              borderRadius: 8,
              background: palette.surfaceAlt,
              border: `1px solid ${palette.border}`,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: palette.faint, lineHeight: 1.5 }}>
              当前参数还没存成方案
            </span>
            <button
              type="button"
              onClick={() => { setCreating(true); setDraftName('我的配置'); flash(null) }}
              style={{
                border: 'none',
                background: 'transparent',
                color: palette.accent,
                fontSize: 10.5,
                padding: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              存为方案
            </button>
          </div>
        )}

        {dirty && current !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              padding: '7px 10px',
              borderRadius: 8,
              background: `${palette.accent}0f`,
              border: `1px solid ${palette.accent}33`,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: palette.subtext, lineHeight: 1.5 }}>
              已改动「{current.name}」的参数
            </span>
            {!current.builtin && (
              <button
                type="button"
                onClick={() => { flash(store.actions.saveProfile(current.id)) }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: palette.accent,
                  fontSize: 10.5,
                  padding: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                保存
              </button>
            )}
            <button
              type="button"
              onClick={() => { setCreating(true); setDraftName(`${current.name} 副本`); flash(null) }}
              style={{
                border: 'none',
                background: 'transparent',
                color: palette.accent,
                fontSize: 10.5,
                padding: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              另存为
            </button>
          </div>
        )}

        {notice !== null && (
          <div style={{ marginTop: 6, fontSize: 10.5, color: palette.up }}>{notice}</div>
        )}
      </Section>

      <Section title="刷新频率" palette={palette}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {INTERVAL_CHOICES.map((ms) => {
            const active = state.settings.intervalMs === ms
            return (
              <button
                key={ms}
                type="button"
                aria-pressed={active}
                onClick={() => { store.actions.patchSettings({ intervalMs: ms }); setCustomSeconds('') }}
                style={{
                  border: `1px solid ${active ? palette.accent : palette.border}`,
                  background: active ? `${palette.accent}14` : 'transparent',
                  color: active ? palette.accent : palette.subtext,
                  borderRadius: 7,
                  padding: '3px 9px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {intervalLabel(ms)}
              </button>
            )
          })}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 2 }}>
            <input
              value={customSeconds}
              inputMode="numeric"
              placeholder="自定义"
              onChange={(event) => { setCustomSeconds(event.target.value.replace(/[^\d]/g, '')) }}
              onBlur={commitCustom}
              onKeyDown={(event) => { if (event.key === 'Enter') commitCustom() }}
              aria-label="自定义刷新间隔（秒）"
              style={{
                width: 58,
                padding: '3px 7px',
                fontSize: 11,
                borderRadius: 7,
                border: `1px solid ${customActive ? palette.accent : palette.border}`,
                background: customActive ? `${palette.accent}14` : 'transparent',
                color: customActive ? palette.accent : palette.text,
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 10.5, color: palette.faint }}>秒</span>
          </span>
        </div>
        <div style={{ fontSize: 10, color: palette.faint, marginTop: 6, lineHeight: 1.6 }}>
          1～600 秒，窗口不可见时自动暂停轮询
        </div>
      </Section>

      <Section title="图表" palette={palette}>
        <Field label="默认形态" palette={palette}>
          <Segmented<ChartMode>
            ariaLabel="图表形态"
            palette={palette}
            value={state.settings.chartMode}
            onChange={(value) => { store.actions.patchSettings({ chartMode: value }) }}
            options={[{ value: 'line', label: '折线' }, { value: 'bar', label: '柱状' }]}
          />
        </Field>
      </Section>

      <Section title="涨跌配色" palette={palette}>
        <Field
          label="颜色方向"
          hint={state.settings.colorMode === 'cn' ? '红涨绿跌，A 股习惯' : '绿涨红跌，欧美习惯'}
          palette={palette}
        >
          <Segmented<ColorMode>
            ariaLabel="涨跌配色"
            palette={palette}
            value={state.settings.colorMode}
            onChange={(value) => { store.actions.patchSettings({ colorMode: value }) }}
            options={[{ value: 'cn', label: '红涨绿跌' }, { value: 'us', label: '绿涨红跌' }]}
          />
        </Field>
      </Section>

      <Section title="面板" palette={palette}>
        <Field label="列表密度" palette={palette}>
          <Segmented<Density>
            ariaLabel="列表密度"
            palette={palette}
            value={state.settings.density}
            onChange={(value) => { store.actions.patchSettings({ density: value }) }}
            options={[{ value: 'cozy', label: '标准' }, { value: 'compact', label: '紧凑' }]}
          />
        </Field>
        <Field label="侧栏轮播" hint="关掉后固定显示第一只自选" palette={palette}>
          <Switch
            label="侧栏轮播"
            palette={palette}
            checked={state.settings.rotateSidebar}
            onChange={(checked) => { store.actions.patchSettings({ rotateSidebar: checked }) }}
          />
        </Field>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, fontSize: 10, color: palette.faint }}>
        <span>数据源 腾讯行情</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => { store.actions.applyProfile('builtin-standard'); flash(null) }}
          style={{
            border: 'none',
            background: 'transparent',
            color: palette.faint,
            fontSize: 10,
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          恢复默认
        </button>
      </div>
    </div>
  )
}
