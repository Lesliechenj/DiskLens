// 设置：主题 / 排除清单 / 最小显示大小 / 记住上次路径
// 所有改动即时生效并自动保存（不需要"确定"按钮，成熟软件的习惯）

import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { EXCLUDE_ITEMS, DEFAULT_EXCLUDE_NAMES } from '../../../shared/excludes'
import type { ThemeMode } from '../../../shared/types'
import { Icon, type IconName } from './icons'

const THEMES: { key: ThemeMode; label: string; icon: IconName; hint: string }[] = [
  { key: 'dark', label: '深色', icon: 'moon', hint: '夜间/暗环境更舒服' },
  { key: 'light', label: '浅色', icon: 'sun', hint: '白天/亮环境更清楚' },
  { key: 'system', label: '跟随系统', icon: 'monitor', hint: '系统换主题我跟着换' }
]

const MIN_SIZE_OPTIONS = [
  { value: 0, label: '不忽略（全部显示）' },
  { value: 1024, label: '忽略小于 1 KB 的' },
  { value: 64 * 1024, label: '忽略小于 64 KB 的' },
  { value: 1024 * 1024, label: '忽略小于 1 MB 的' },
  { value: 20 * 1024 * 1024, label: '忽略小于 20 MB 的' }
]

export function SettingsDialog(): React.JSX.Element | null {
  const open = useUiStore((state) => state.settingsOpen)
  const close = useUiStore((state) => state.closeSettings)
  const openWizard = useUiStore((state) => state.openWizard)
  const settings = useSettingsStore((state) => state.settings)
  const patch = useSettingsStore((state) => state.patch)

  if (!open) return null

  const toggleExclude = (name: string): void => {
    const next = settings.excludes.includes(name)
      ? settings.excludes.filter((item) => item !== name)
      : [...settings.excludes, name]
    void patch({ excludes: next })
  }

  const groupOf = (group: 'system' | 'dev'): typeof EXCLUDE_ITEMS =>
    EXCLUDE_ITEMS.filter((item) => item.group === group)

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={close}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h3>
            <Icon name="settings" size={16} /> 设置
          </h3>
          <button className="icon-btn xs" onClick={close} title="关闭" aria-label="关闭设置">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <h4>外观</h4>
            <div className="theme-cards">
              {THEMES.map((theme) => (
                <button
                  key={theme.key}
                  className={`theme-card${settings.theme === theme.key ? ' active' : ''}`}
                  onClick={() => void patch({ theme: theme.key })}
                >
                  <Icon name={theme.icon} size={16} />
                  <b>{theme.label}</b>
                  <span>{theme.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h4>
              排除清单
              <span className="h4-hint">勾上的目录扫的时候整棵跳过，防止把系统文件拖进图表</span>
            </h4>
            {(['system', 'dev'] as const).map((group) => (
              <div key={group} className="exclude-group">
                <div className="exclude-group-head">
                  <span>
                    {group === 'system' ? '系统目录（建议保持勾选）' : '开发缓存（按需勾选）'}
                  </span>
                </div>
                <div className="exclude-grid">
                  {groupOf(group).map((item) => (
                    <label key={item.name} className="exclude-item">
                      <input
                        type="checkbox"
                        checked={settings.excludes.includes(item.name)}
                        onChange={() => toggleExclude(item.name)}
                      />
                      <span className="exclude-name">{item.name}</span>
                      <span className="exclude-desc">{item.desc}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="settings-row">
              <button
                className="btn ghost sm"
                onClick={() => void patch({ excludes: [...DEFAULT_EXCLUDE_NAMES] })}
              >
                恢复默认勾选
              </button>
              <button className="btn ghost sm" onClick={() => void patch({ excludes: [] })}>
                全部取消（不推荐）
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h4>新手模式与清理</h4>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.beginnerMode}
                onChange={(event) => void patch({ beginnerMode: event.target.checked })}
              />
              <span>新手模式（推荐）：更大的字、文件路径显示在名字下面、顶部一直提示下一步</span>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.autoSnapshot}
                onChange={(event) => void patch({ autoSnapshot: event.target.checked })}
              />
              <span>扫描完成后自动保存快照（下次打开可以直接恢复，不用重扫）</span>
            </label>
            <label className="settings-field">
              <span>清理时什么时候要管理员授权</span>
              <select
                className="select"
                value={settings.cleanupElevation}
                onChange={(event) =>
                  void patch({
                    cleanupElevation: event.target.value as typeof settings.cleanupElevation
                  })
                }
              >
                <option value="auto">自动（只有系统目录才授权一次）</option>
                <option value="always">每次清理都授权一次</option>
                <option value="never">从不授权（可能删不掉系统缓存）</option>
              </select>
            </label>
            <p className="settings-note">
              授权是<b>整批一次</b>，不会一个文件弹一次。删掉的东西仍然只进回收站。
            </p>
            <div className="settings-row">
              <button
                className="btn ghost sm"
                onClick={() => {
                  close()
                  openWizard()
                }}
              >
                <Icon name="sparkle" size={13} /> 再看一遍新手向导
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h4>显示与记忆</h4>
            <label className="settings-field">
              <span>图表最小显示大小</span>
              <select
                className="select"
                value={settings.minChildSize}
                onChange={(event) => void patch({ minChildSize: Number(event.target.value) })}
              >
                {MIN_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="settings-note">
              只影响图表里显示哪些方块，统计数字永远是全量——所以不会出现「加起来对不上」的情况。
            </p>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.rememberPath}
                onChange={(event) => void patch({ rememberPath: event.target.checked })}
              />
              <span>记住上次扫描的路径（下次打开自动填进输入框）</span>
            </label>
          </section>
        </div>

        <footer className="modal-foot">
          <span className="muted">改动即时生效并自动保存</span>
          <button className="btn primary sm" onClick={close}>
            完成
          </button>
        </footer>
      </div>
    </div>
  )
}
