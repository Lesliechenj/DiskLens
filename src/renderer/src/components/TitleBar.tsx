// 自定义标题栏：品牌 + 窗口拖拽区 + 主题/设置开关
// Windows 上右侧留给系统窗口按钮（titleBarOverlay），用 padding 避让

import { Icon, MorphingIcon } from './icons'
import { useSettingsStore } from '../store/settingsStore'
import { useScanStore } from '../store/scanStore'
import { useUiStore } from '../store/uiStore'
import { formatBytes } from '../../../shared/format'

export function TitleBar(): React.JSX.Element {
  const dark = useSettingsStore((state) => state.dark)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const status = useScanStore((state) => state.status)
  const progress = useScanStore((state) => state.progress)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const openSettings = useUiStore((state) => state.openSettings)
  const openAbout = useUiStore((state) => state.openAbout)
  const openHelp = useUiStore((state) => state.openHelp)
  const platform = window.electron?.process?.platform ?? 'win32'
  const reserveControls = platform === 'win32' || platform === 'linux'

  return (
    <header className={`titlebar${reserveControls ? ' with-controls' : ''}`}>
      <div className="titlebar-left no-drag">
        <button
          className="icon-btn"
          onClick={() => toggleSidebar()}
          title={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          aria-label="切换侧栏"
        >
          <MorphingIcon name={sidebarOpen ? 'chevronLeft' : 'chevronRight'} size={16} />
        </button>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#5b8def" />
                  <stop offset="100%" stopColor="#7c5cff" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#brandGrad)" />
              <circle cx="11" cy="11" r="4.2" fill="none" stroke="#fff" strokeWidth="1.7" />
              <path d="m14.4 14.4 3.1 3.1" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <span className="brand-name">DiskLens</span>
          <span className="brand-sub">磁盘空间一眼看懂</span>
        </div>
      </div>

      <div className="titlebar-drag" />

      <div className="titlebar-right no-drag">
        {status === 'scanning' && (
          <span className="titlebar-scanning">
            <span className="pulse-dot" />
            扫描中 {progress ? `· ${formatBytes(progress.bytes)}` : ''}
          </span>
        )}
        <button
          className="icon-btn"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          title={dark ? '切换到浅色主题' : '切换到深色主题'}
          aria-label="切换主题"
        >
          <MorphingIcon name={dark ? 'sun' : 'moon'} size={16} />
        </button>
        <button className="icon-btn" onClick={openSettings} title="设置" aria-label="设置">
          <Icon name="settings" size={16} />
        </button>
        <button
          className="icon-btn"
          onClick={openHelp}
          title="新手帮助（F1）"
          aria-label="新手帮助"
        >
          <Icon name="help" size={16} />
        </button>
        <button className="icon-btn" onClick={openAbout} title="关于 DiskLens" aria-label="关于">
          <Icon name="info" size={16} />
        </button>
      </div>
    </header>
  )
}
