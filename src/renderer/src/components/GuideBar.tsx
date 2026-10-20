// 新手引导条：永远告诉用户"现在第几步、下一步点哪里"
// 只在「新手模式」显示，老用户可以在设置里关掉

import { useMemo } from 'react'
import { useScanStore } from '../store/scanStore'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { useCleanupTotal } from '../hooks/useDerived'
import { useStartScan } from '../hooks/useStartScan'
import { formatBytes } from '../../../shared/format'
import { Icon } from './icons'

export function GuideBar(): React.JSX.Element | null {
  const beginner = useSettingsStore((state) => state.settings.beginnerMode)
  const drives = useSettingsStore((state) => state.drives)
  const status = useScanStore((state) => state.status)
  const result = useScanStore((state) => state.result)
  const view = useScanStore((state) => state.view)
  const setView = useScanStore((state) => state.setView)
  const openWizard = useUiStore((state) => state.openWizard)
  const cleanupTotal = useCleanupTotal()
  const startScan = useStartScan()

  const step = useMemo(() => {
    if (!result) return 1
    if (view === 'cleanup') return 3
    return 2
  }, [result, view])

  if (!beginner) return null

  const scanAll = (): void => {
    const paths = drives.filter((drive) => !drive.removable).map((drive) => drive.path)
    if (paths.length > 0) void startScan(paths)
    else void startScan('C:/')
  }

  return (
    <div className="guide-bar">
      <div className="guide-steps" aria-label="使用步骤">
        <span className={`guide-step${step >= 1 ? ' active' : ''}${result ? ' done' : ''}`}>
          <b>1</b> 扫描
        </span>
        <span className={`guide-step${step >= 2 ? ' active' : ''}`}>
          <b>2</b> 看能清什么
        </span>
        <span className={`guide-step${step >= 3 ? ' active' : ''}`}>
          <b>3</b> 一键清理
        </span>
      </div>

      <div className="guide-copy">
        {status === 'scanning' ? (
          <span>正在扫描，马上就好…</span>
        ) : !result ? (
          <span>第一次用？点右边「扫描全部磁盘」，DiskLens 会自动找出能安全清理的东西。</span>
        ) : view !== 'cleanup' ? (
          <span>
            扫描完成。已经找到 <b>{formatBytes(cleanupTotal)}</b> 可以安全清理的内容。
          </span>
        ) : (
          <span>
            下面就是推荐清理项。不确定的话，直接点「一键清理推荐项」，不会动你的文档和照片。
          </span>
        )}
      </div>

      <div className="guide-actions">
        <button className="btn ghost sm" onClick={openWizard} title="用 3 步向导完成扫描和清理">
          <Icon name="sparkle" size={13} /> 新手向导
        </button>
        {status === 'scanning' ? (
          <button className="btn danger sm" onClick={() => window.api.cancelScan()}>
            <Icon name="stop" size={13} /> 取消扫描
          </button>
        ) : !result ? (
          <button className="btn primary sm" onClick={scanAll}>
            <Icon name="drive" size={13} /> 扫描全部磁盘
          </button>
        ) : view !== 'cleanup' ? (
          <button className="btn primary sm" onClick={() => setView('cleanup')}>
            <Icon name="broom" size={13} /> 看看能清什么
          </button>
        ) : (
          <button className="btn primary sm" onClick={openWizard}>
            <Icon name="sparkle" size={13} /> 一键清理推荐项
          </button>
        )}
      </div>
    </div>
  )
}
