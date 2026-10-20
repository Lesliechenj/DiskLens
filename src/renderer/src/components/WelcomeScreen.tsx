// 欢迎页（首页）：磁盘列表 + 拖拽提示 + 能干什么
// 需求文档决策 1：小白打开先看到"哪个盘满了"，点一下就出图

import { useSettingsStore } from '../store/settingsStore'
import { useScanStore } from '../store/scanStore'
import { useUiStore, toast } from '../store/uiStore'
import { useStartScan } from '../hooks/useStartScan'
import { formatBytes, formatCount, formatRelativeTime } from '../../../shared/format'
import { driveLetter, driveTitle, driveUsageLevel, driveUsageRatio } from '../../../shared/drives'
import { Icon } from './icons'

export function WelcomeScreen(): React.JSX.Element {
  const drives = useSettingsStore((state) => state.drives)
  const drivesLoading = useSettingsStore((state) => state.drivesLoading)
  const refreshDrives = useSettingsStore((state) => state.refreshDrives)
  const onboarded = useSettingsStore((state) => state.settings.onboarded)
  const snapshotMeta = useScanStore((state) => state.snapshotMeta)
  const loadResult = useScanStore((state) => state.loadResult)
  const setSnapshotMeta = useScanStore((state) => state.setSnapshotMeta)
  const openWizard = useUiStore((state) => state.openWizard)
  const startScan = useStartScan()

  const pickFolder = async (): Promise<void> => {
    const picked = await window.api.selectDirectory()
    if (picked) await startScan(picked)
  }

  const scanAll = (): void => {
    const paths = drives.filter((drive) => !drive.removable).map((drive) => drive.path)
    if (paths.length > 0) void startScan(paths)
    else void startScan('C:/')
  }

  const restoreSnapshot = async (): Promise<void> => {
    const loaded = await window.api.loadSnapshot().catch(() => null)
    if (!loaded) {
      toast('err', '快照读不出来，重新扫描一次吧')
      return
    }
    loadResult(loaded)
    setSnapshotMeta(null)
    toast('ok', '已恢复上次扫描结果，不用重新扫盘')
  }

  return (
    <div className="welcome">
      <div className="welcome-head">
        <h1>
          哪个盘快满了？<span className="welcome-accent">点一下就出图</span>
        </h1>
        <p className="welcome-sub">
          块越大 = 占地方越多。扫完之后能一眼看出空间去哪了，还能安全清掉缓存和垃圾。
        </p>
        <div className="welcome-actions">
          <button className="btn primary" onClick={scanAll}>
            <Icon name="drive" size={15} /> 扫描全部磁盘
          </button>
          <button className="btn" onClick={openWizard}>
            <Icon name="sparkle" size={15} /> 新手向导（推荐）
          </button>
        </div>
      </div>

      {!onboarded && (
        <div className="welcome-onboarding">
          <div className="welcome-onboarding-icon">
            <Icon name="sparkle" size={20} />
          </div>
          <div className="welcome-onboarding-body">
            <b>第一次用，不知道从哪下手？</b>
            <p>跟着新手向导走 3 步：选磁盘 → 自动扫描 → 只清理推荐项。全程只进回收站。</p>
          </div>
          <button className="btn primary sm" onClick={openWizard}>
            开始 3 步向导 <Icon name="chevronRight" size={13} />
          </button>
        </div>
      )}

      {snapshotMeta && (
        <button className="welcome-snapshot" onClick={() => void restoreSnapshot()}>
          <Icon name="clock" size={18} />
          <span className="welcome-snapshot-body">
            <b>恢复上次扫描结果</b>
            <em>
              {formatRelativeTime(snapshotMeta.createdAt)} · {formatBytes(snapshotMeta.totalBytes)}{' '}
              · {formatCount(snapshotMeta.files)} 个文件，不用重新扫盘
            </em>
          </span>
          <span className="welcome-snapshot-go">
            立即恢复 <Icon name="chevronRight" size={13} />
          </span>
        </button>
      )}

      <div className="welcome-section-head">
        <h2>我的磁盘</h2>
        <button
          className="btn ghost sm"
          onClick={() => void refreshDrives()}
          disabled={drivesLoading}
        >
          <Icon name="refresh" size={13} /> {drivesLoading ? '读取中…' : '刷新容量'}
        </button>
      </div>

      <div className="drive-cards">
        {drives.map((drive) => {
          const ratio = driveUsageRatio(drive)
          const level = driveUsageLevel(drive)
          return (
            <button
              key={drive.path}
              className="drive-card"
              onClick={() => void startScan(drive.path)}
              title={`扫描 ${drive.path}`}
            >
              <div className="drive-card-top">
                <span className={`drive-letter ${level}`}>{driveLetter(drive)}</span>
                <div className="drive-card-name">
                  <strong>{drive.volumeName || driveTitle(drive)}</strong>
                  <span>{drive.removable ? '可移动磁盘' : '本地磁盘'}</span>
                </div>
                {level !== 'normal' && (
                  <span className={`pill ${level}`}>
                    <Icon name="alert" size={11} /> {level === 'danger' ? '快满了' : '偏满'}
                  </span>
                )}
              </div>
              <div className="drive-card-meter">
                <i className={level} style={{ width: `${Math.max(1.5, ratio * 100)}%` }} />
              </div>
              <div className="drive-card-stats">
                <span>
                  可用 <b>{formatBytes(drive.freeBytes)}</b>
                </span>
                <span className="muted">
                  共 {formatBytes(drive.totalBytes)} · 已用 {formatCount(Math.round(ratio * 100))}%
                </span>
              </div>
              <span className="drive-card-cta">
                扫描这个盘 <Icon name="chevronRight" size={13} />
              </span>
            </button>
          )
        })}

        <button className="drive-card ghost" onClick={() => void pickFolder()}>
          <div className="drive-card-top">
            <span className="drive-letter neutral">
              <Icon name="folderOpen" size={16} />
            </span>
            <div className="drive-card-name">
              <strong>只扫一个文件夹</strong>
              <span>比如 Downloads、桌面、某个游戏目录</span>
            </div>
          </div>
          <div className="drive-card-empty">
            <Icon name="folder" size={26} />
          </div>
          <span className="drive-card-cta">
            选择文件夹 <Icon name="chevronRight" size={13} />
          </span>
        </button>
      </div>

      {drives.length === 0 && !drivesLoading && (
        <p className="welcome-hint">
          没读到磁盘列表。可以直接把文件夹拖进窗口，或者点上面的「只扫一个文件夹」。
        </p>
      )}

      <div className="welcome-tips">
        <div className="welcome-tip">
          <span className="tip-icon">
            <Icon name="grid" size={16} />
          </span>
          <div>
            <b>面积图看谁最占</b>
            <p>块越大占地方越多，点目录块一层层钻进去</p>
          </div>
        </div>
        <div className="welcome-tip">
          <span className="tip-icon">
            <Icon name="broom" size={16} />
          </span>
          <div>
            <b>清理建议照单点</b>
            <p>缓存、日志、旧安装包自动挑出来，告诉你还能腾多少</p>
          </div>
        </div>
        <div className="welcome-tip">
          <span className="tip-icon">
            <Icon name="shield" size={16} />
          </span>
          <div>
            <b>删东西只进回收站</b>
            <p>系统目录默认排除，删前二次确认，随时能恢复</p>
          </div>
        </div>
      </div>

      <p className="welcome-drop">
        <Icon name="info" size={13} /> 也可以直接把文件夹拖进这个窗口
      </p>
    </div>
  )
}
