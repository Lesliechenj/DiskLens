// 关于：版本、能干什么、安全承诺、开源协议

import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { Icon } from './icons'

export function AboutDialog(): React.JSX.Element | null {
  const open = useUiStore((state) => state.aboutOpen)
  const close = useUiStore((state) => state.closeAbout)
  const info = useSettingsStore((state) => state.info)

  if (!open) return null

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={close}>
      <div
        className="modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-label="关于 DiskLens"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h3>
            <Icon name="info" size={16} /> 关于 DiskLens
          </h3>
          <button className="icon-btn xs" onClick={close} title="关闭" aria-label="关闭关于">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="about-body">
          <div className="about-brand">
            <span className="brand-mark big" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <defs>
                  <linearGradient id="aboutGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#5b8def" />
                    <stop offset="100%" stopColor="#7c5cff" />
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#aboutGrad)" />
                <circle cx="11" cy="11" r="4.2" fill="none" stroke="#fff" strokeWidth="1.7" />
                <path
                  d="m14.4 14.4 3.1 3.1"
                  stroke="#fff"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <div>
              <h2>DiskLens</h2>
              <p>给电脑小白的磁盘空间可视化工具：块越大 = 占地方越多，一眼看懂，安全清理。</p>
            </div>
          </div>

          <ul className="about-facts">
            <li>
              <span>版本</span>
              <b>v{info?.version ?? '—'}</b>
            </li>
            <li>
              <span>运行环境</span>
              <b>
                Electron {info?.electron ?? '—'} · {info?.platform ?? '—'}
              </b>
            </li>
            <li>
              <span>技术栈</span>
              <b>Electron + React + TypeScript + ECharts</b>
            </li>
            <li>
              <span>开源协议</span>
              <b>MIT</b>
            </li>
          </ul>

          <div className="about-promise">
            <h4>
              <Icon name="shield" size={14} /> 安全承诺
            </h4>
            <ul>
              <li>只能进回收站：删除走系统回收站（可恢复），不提供直接删除</li>
              <li>删前二次确认，并提示重要文件自行备份</li>
              <li>系统关键目录默认排除，扫描时直接跳过</li>
            </ul>
          </div>

          <p className="about-foot">DiskLens 仅供参考，清理前请自行确认重要文件已备份。</p>
        </div>

        <footer className="modal-foot">
          <span className="muted">MIT © DiskLens Contributors</span>
          <button className="btn primary sm" onClick={close}>
            知道了
          </button>
        </footer>
      </div>
    </div>
  )
}
