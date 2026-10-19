// 首次扫描时的整屏进度：大一点、清楚一点，告诉用户"在干活、干了多少"
// 有了结果之后再扫描就用扫描栏的细进度条，不打断看图

import { useScanStore } from '../store/scanStore'
import { formatBytes, formatCount, formatDuration } from '../../../shared/format'
import { Icon } from './icons'

export function ScanningPanel(): React.JSX.Element {
  const progress = useScanStore((state) => state.progress)
  const result = useScanStore((state) => state.result)
  const rootPath = progress?.currentPath ?? result?.root.path ?? ''

  return (
    <div className="scanning-panel">
      <div className="scanning-spinner" aria-hidden="true" />
      <h2>正在扫描…</h2>
      <p className="scanning-path" title={rootPath}>
        {rootPath || '正在准备扫描'}
      </p>
      <div className="scanning-stats">
        <div>
          <b>{formatCount(progress?.files ?? 0)}</b>
          <span>文件</span>
        </div>
        <div>
          <b>{formatCount(progress?.dirs ?? 0)}</b>
          <span>目录</span>
        </div>
        <div>
          <b>{formatBytes(progress?.bytes ?? 0)}</b>
          <span>已扫描</span>
        </div>
        <div>
          <b>{formatDuration(progress?.elapsedMs ?? 0)}</b>
          <span>已用时</span>
        </div>
      </div>
      <button className="btn ghost sm" onClick={() => window.api.cancelScan()}>
        <Icon name="stop" size={13} /> 取消扫描
      </button>
      <p className="scanning-note">大磁盘需要一点时间。扫的时候可以随时取消，不会留下半个结果。</p>
    </div>
  )
}
