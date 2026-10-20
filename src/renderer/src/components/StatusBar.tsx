// 状态栏：一眼看到"这次扫了什么、扫了多少、跳过了什么"
// 成熟软件的细节：底部永远有一行真话，而不是啥都没有

import { useScanStore } from '../store/scanStore'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { formatBytes, formatCount, formatDuration } from '../../../shared/format'
import { formatPathList } from '../../../shared/paths'
import { Icon } from './icons'

export function StatusBar(): React.JSX.Element {
  const status = useScanStore((state) => state.status)
  const progress = useScanStore((state) => state.progress)
  const result = useScanStore((state) => state.result)
  const error = useScanStore((state) => state.error)
  const info = useSettingsStore((state) => state.info)
  const openSkipped = useUiStore((state) => state.openSkipped)

  const version = info?.version ? `v${info.version}` : '—'

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        {status === 'scanning' && (
          <>
            <span className="pulse-dot" />
            <span>
              正在扫描 · 已遍历 {formatCount(progress?.files ?? 0)} 个文件 /{' '}
              {formatCount(progress?.dirs ?? 0)} 个目录 · {formatBytes(progress?.bytes ?? 0)}
            </span>
          </>
        )}
        {status === 'error' && (
          <>
            <Icon name="alert" size={12} />
            <span className="err-text">{error ?? '扫描失败'}</span>
          </>
        )}
        {status === 'done' && result && (
          <>
            <Icon name="check" size={12} />
            <span title={result.roots.join('; ')}>
              {result.multi ? `全部磁盘（${formatPathList(result.roots, 3)}）` : result.root.path}
            </span>
            <span className="dim">·</span>
            <span>{formatBytes(result.root.size)}</span>
            <span className="dim">·</span>
            <span>扫描到 {formatCount(result.stats.files)} 个文件</span>
            <span className="dim">·</span>
            <span>{formatCount(result.stats.dirs)} 个目录</span>
            <span className="dim">·</span>
            <span>耗时 {formatDuration(result.durationMs)}</span>
            {result.excluded > 0 && (
              <>
                <span className="dim">·</span>
                <span title="命中排除清单，没扫进去">{result.excluded} 个目录已排除</span>
              </>
            )}
            {result.skippedCount > 0 && (
              <>
                <span className="dim">·</span>
                <button
                  className="link warn-text"
                  title="无权限或已被删除，自动跳过。点开看具体是哪些"
                  onClick={openSkipped}
                >
                  {formatCount(result.skippedCount)} 项跳过
                </button>
              </>
            )}
          </>
        )}
        {status === 'idle' && (
          <>
            <Icon name="info" size={12} />
            <span>选一个磁盘或文件夹开始扫描 · 删除只进回收站 · 仅供参考，重要文件请自行备份</span>
          </>
        )}
      </div>
      <div className="statusbar-right">
        <span>DiskLens {version}</span>
        {info?.isDev && <span className="dim">dev</span>}
        <span className="dim">{info?.platform ?? ''}</span>
      </div>
    </footer>
  )
}
