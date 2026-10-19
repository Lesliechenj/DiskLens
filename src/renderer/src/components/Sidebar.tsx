// 侧栏：磁盘列表（盘符 + 占用条）+ 最近扫描 + 快捷入口
// 需求文档决策 1：首页就该看到"哪个盘满了"，点一下直接进图表

import { Icon } from './icons'
import { useSettingsStore } from '../store/settingsStore'
import { useScanStore } from '../store/scanStore'
import { useUiStore, toast } from '../store/uiStore'
import { useStartScan } from '../hooks/useStartScan'
import { useCleanupGroups, useCleanupTotal } from '../hooks/useDerived'
import { driveTitle, driveUsageLevel, driveUsageRatio } from '../../../shared/drives'
import { formatBytes, formatCount, formatRelativeTime } from '../../../shared/format'
import { baseNameOf } from '../../../shared/paths'
import { exportReport } from '../lib/exportReport'

export function Sidebar(): React.JSX.Element {
  const drives = useSettingsStore((state) => state.drives)
  const drivesLoading = useSettingsStore((state) => state.drivesLoading)
  const drivesUpdatedAt = useSettingsStore((state) => state.drivesUpdatedAt)
  const refreshDrives = useSettingsStore((state) => state.refreshDrives)
  const recentPaths = useSettingsStore((state) => state.settings.recentPaths)
  const excludes = useSettingsStore((state) => state.settings.excludes)
  const openSettings = useUiStore((state) => state.openSettings)
  const result = useScanStore((state) => state.result)
  const setView = useScanStore((state) => state.setView)
  const view = useScanStore((state) => state.view)
  const startScan = useStartScan()
  const cleanupGroups = useCleanupGroups()
  const cleanupTotal = useCleanupTotal()

  const hasResult = !!result

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <section className="side-section">
          <div className="side-head">
            <h2>
              <Icon name="drive" size={14} /> 磁盘
            </h2>
            <button
              className="icon-btn xs"
              onClick={() => void refreshDrives()}
              title="重新读取磁盘容量"
              aria-label="刷新磁盘列表"
            >
              <Icon name="refresh" size={13} />
            </button>
          </div>
          {drivesLoading && drives.length === 0 && <p className="side-hint">正在读取磁盘…</p>}
          {!drivesLoading && drives.length === 0 && (
            <p className="side-hint">
              没读到磁盘，或者读取被系统拦住了。可以直接在下方选文件夹扫。
            </p>
          )}
          <div className="drive-list">
            {drives.map((drive) => {
              const ratio = driveUsageRatio(drive)
              const level = driveUsageLevel(drive)
              const name = drive.volumeName || driveTitle(drive)
              return (
                <button
                  key={drive.path}
                  className="drive-item"
                  onClick={() => void startScan(drive.path)}
                  title={`扫描 ${drive.path}（共 ${formatBytes(drive.totalBytes)}，可用 ${formatBytes(drive.freeBytes)}）`}
                >
                  <span className={`drive-badge ${level}`}>{drive.label.replace(':', '')}</span>
                  <span className="drive-body">
                    <span className="drive-name">
                      {name}
                      {drive.removable && <span className="tag tiny">可移动</span>}
                    </span>
                    <span className="drive-meter">
                      <i className={level} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
                    </span>
                    <span className="drive-meta">
                      可用 {formatBytes(drive.freeBytes)} / 共 {formatBytes(drive.totalBytes)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          {drivesUpdatedAt > 0 && (
            <p className="side-foot">容量更新于 {formatRelativeTime(drivesUpdatedAt)}</p>
          )}
        </section>

        <section className="side-section">
          <div className="side-head">
            <h2>
              <Icon name="clock" size={14} /> 最近扫描
            </h2>
          </div>
          {recentPaths.length === 0 ? (
            <p className="side-hint">还没有扫过东西。点上面的磁盘，或选一个文件夹。</p>
          ) : (
            <div className="recent-list">
              {recentPaths.map((path) => (
                <button
                  key={path}
                  className="recent-item"
                  onClick={() => void startScan(path)}
                  title={`重新扫描 ${path}`}
                >
                  <Icon name="folder" size={14} />
                  <span className="recent-name">{baseNameOf(path) || path}</span>
                  <span className="recent-path">{path}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="side-section">
          <div className="side-head">
            <h2>
              <Icon name="sparkle" size={14} /> 快捷入口
            </h2>
          </div>
          <button
            className={`side-action ${view === 'cleanup' && hasResult ? 'active' : ''}`}
            disabled={!hasResult}
            onClick={() => setView('cleanup')}
            title={hasResult ? '看看哪些东西可以安全清掉' : '先扫描一次，才有清理建议'}
          >
            <Icon name="broom" size={15} />
            <span className="side-action-text">清理建议</span>
            {hasResult && cleanupTotal > 0 && (
              <span className="side-action-badge">{formatBytes(cleanupTotal)}</span>
            )}
          </button>
          <button
            className="side-action"
            disabled={!hasResult}
            onClick={() => void exportReport()}
            title={hasResult ? '把大文件清单导出成 CSV（Excel 能直接打开）' : '先扫描一次才能导出'}
          >
            <Icon name="export" size={15} />
            <span className="side-action-text">导出报告</span>
          </button>
          <button className="side-action" onClick={openSettings}>
            <Icon name="settings" size={15} />
            <span className="side-action-text">设置与排除清单</span>
          </button>
        </section>

        {hasResult && (
          <section className="side-section">
            <div className="side-head">
              <h2>
                <Icon name="shield" size={14} /> 本次扫描
              </h2>
            </div>
            <ul className="side-stats">
              <li>
                <span>文件</span>
                <b>{formatCount(result.stats.files)}</b>
              </li>
              <li>
                <span>目录</span>
                <b>{formatCount(result.stats.dirs)}</b>
              </li>
              <li>
                <span>可清理</span>
                <b>{cleanupGroups.length > 0 ? formatBytes(cleanupTotal) : '—'}</b>
              </li>
              <li>
                <span>排除清单</span>
                <b>{excludes.length} 项</b>
              </li>
            </ul>
          </section>
        )}
      </div>

      <div className="sidebar-foot">
        <span className="foot-note">
          删除只进回收站，可恢复 ·{' '}
          <button className="link" onClick={openSettings}>
            排除清单
          </button>
        </span>
        <button
          className="link subtle"
          onClick={() => toast('info', 'DiskLens 仅供参考，重要文件请自行备份')}
        >
          仅供参考
        </button>
      </div>
    </aside>
  )
}
