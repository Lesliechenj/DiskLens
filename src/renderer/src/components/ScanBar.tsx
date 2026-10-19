// 扫描栏：输入/选择路径 + 开始扫描 + 实时进度 + 取消
// 状态机就四种：idle / scanning / done / error，每种都有明确的下一步

import { useScanStore } from '../store/scanStore'
import { useStartScan } from '../hooks/useStartScan'
import { formatBytes, formatCount, formatDuration } from '../../../shared/format'
import { Icon } from './icons'

export function ScanBar(): React.JSX.Element {
  const status = useScanStore((state) => state.status)
  const progress = useScanStore((state) => state.progress)
  const error = useScanStore((state) => state.error)
  const reset = useScanStore((state) => state.reset)
  const path = useScanStore((state) => state.input)
  const setPath = useScanStore((state) => state.setInput)
  const startScan = useStartScan()

  const scanning = status === 'scanning'
  const elapsed = progress?.elapsedMs ?? 0

  const handlePick = async (): Promise<void> => {
    const picked = await window.api.selectDirectory()
    if (!picked) return
    setPath(picked)
    await startScan(picked)
  }

  return (
    <div className={`scanbar${scanning ? ' scanning' : ''}`}>
      <div className="scanbar-row">
        <div className="path-field">
          <Icon name="search" size={14} className="path-field-icon" />
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !scanning) void startScan(path)
            }}
            placeholder="输入要扫描的路径（如 C:/Users/你的名字/Downloads），或点右侧选文件夹"
            spellCheck={false}
            disabled={scanning}
            aria-label="扫描路径"
          />
          {path && !scanning && (
            <button
              className="field-clear"
              title="清空"
              onClick={() => setPath('')}
              aria-label="清空路径"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        <button className="btn" onClick={() => void handlePick()} disabled={scanning}>
          <Icon name="folder-open" size={14} /> 选文件夹
        </button>

        {scanning ? (
          <button
            className="btn danger"
            onClick={() => window.api.cancelScan()}
            title="停止这次扫描（已扫到的结果不会保留）"
          >
            <Icon name="stop" size={14} /> 取消扫描
          </button>
        ) : (
          <button
            className="btn primary"
            onClick={() => void startScan(path)}
            disabled={!path.trim()}
          >
            <Icon name="search" size={14} /> 开始扫描
          </button>
        )}
      </div>

      {scanning && (
        <div className="scan-progress">
          <div className="progress-track">
            <div className="progress-indeterminate" />
          </div>
          <div className="progress-stats">
            <span>
              <b>{formatCount(progress?.files ?? 0)}</b> 个文件
            </span>
            <span>
              <b>{formatCount(progress?.dirs ?? 0)}</b> 个目录
            </span>
            <span>
              已扫描 <b>{formatBytes(progress?.bytes ?? 0)}</b>
            </span>
            <span>
              用了 <b>{formatDuration(elapsed)}</b>
            </span>
            <span className="progress-current" title={progress?.currentPath}>
              {progress?.currentPath ?? '正在准备…'}
            </span>
          </div>
        </div>
      )}

      {status === 'error' && error && (
        <div className="scan-error">
          <Icon name="alert" size={14} />
          <span>{error}</span>
          <button className="btn ghost sm" onClick={reset}>
            知道了
          </button>
        </div>
      )}
    </div>
  )
}
