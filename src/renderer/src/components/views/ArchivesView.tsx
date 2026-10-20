// 压缩包视图：一眼看到哪些压缩包/镜像最占地方，ZIP 还能直接看里面有什么
// 和「重复文件」互补：重复看内容，压缩包看"是不是下载完忘了删/没解压"

import { useMemo, useState } from 'react'
import { useScanStore } from '../../store/scanStore'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import {
  formatBytes,
  formatCount,
  formatPercent,
  formatRelativeTime,
  formatTime
} from '../../../../shared/format'
import type { ArchiveInfo, ArchiveInspection } from '../../../../shared/types'
import { collectArchives, ARCHIVE_LABELS } from '../../lib/archives'
import { locatePath, openPath } from '../../lib/actions'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

const PAGE = 120

export function ArchivesView(): React.JSX.Element {
  const result = useScanStore((state) => state.result)
  const treeVersion = useScanStore((state) => state.treeVersion)
  const openMenu = useNodeMenu()
  const [ext, setExt] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [inspection, setInspection] = useState<{
    info: ArchiveInfo
    loading: boolean
    data: ArchiveInspection | null
  } | null>(null)

  const stats = useMemo(
    () => (result ? collectArchives(result.root) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 树就地修改，靠 treeVersion 重算
    [result, treeVersion]
  )

  if (!result || !stats) {
    return (
      <div className="view">
        <EmptyState
          icon="archive"
          title="还没有扫描结果"
          hint="扫描一次，这里会列出所有压缩包和光盘镜像，并按大小排序。"
        />
      </div>
    )
  }

  const keywordLower = keyword.trim().toLowerCase()
  const rows = stats.archives
    .filter((item) => (ext ? item.ext === ext : true))
    .filter((item) =>
      keywordLower
        ? item.name.toLowerCase().includes(keywordLower) ||
          item.path.toLowerCase().includes(keywordLower)
        : true
    )
    .slice(0, limit)

  const inspect = async (info: ArchiveInfo): Promise<void> => {
    setInspection({ info, loading: true, data: null })
    const data = await window.api.inspectArchive(info.path).catch((error) => ({
      path: info.path,
      entries: [],
      totalSize: info.size,
      unpackedBytes: 0,
      truncated: false,
      error: error instanceof Error ? error.message : String(error)
    }))
    setInspection({ info, loading: false, data })
  }

  return (
    <div className="view view-scroll">
      <div className="archive-hero">
        <div className="archive-hero-main">
          <span className="archive-hero-label">压缩包 / 镜像一共占</span>
          <strong className="archive-hero-size">{formatBytes(stats.totalSize)}</strong>
          <span className="archive-hero-sub">
            {formatCount(stats.totalCount)} 个 · 占本次扫描{' '}
            {formatPercent(stats.totalSize, result.root.size)}%
          </span>
        </div>
        <div className="archive-hero-note">
          <Icon name="info" size={13} />
          下载完装好的安装包、解压完的压缩包，通常可以清掉原件。
        </div>
      </div>

      <div className="view-bar">
        <div className="view-bar-left">
          <div className="archive-filters">
            <button className={`chip${ext === null ? ' active' : ''}`} onClick={() => setExt(null)}>
              全部 {formatCount(stats.totalCount)}
            </button>
            {stats.byExt.map((item) => (
              <button
                key={item.ext}
                className={`chip${ext === item.ext ? ' active' : ''}`}
                onClick={() => setExt(ext === item.ext ? null : item.ext)}
                title={`${formatBytes(item.size)} · ${formatCount(item.count)} 个`}
              >
                .{item.ext} {formatCount(item.count)}
              </button>
            ))}
          </div>
        </div>
        <div className="view-bar-right">
          <input
            className="search-input compact"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜压缩包名字"
            spellCheck={false}
          />
        </div>
      </div>

      {stats.archives.length === 0 ? (
        <EmptyState
          icon="archive"
          title="没有找到压缩包"
          hint="这个范围里没有 zip / rar / 7z / iso 等文件。"
        />
      ) : (
        <>
          <div className="table">
            <div className="table-head archives-grid">
              <span className="th">压缩包</span>
              <span className="th num">大小</span>
              <span className="th">类型</span>
              <span className="th">修改时间</span>
              <span className="th">位置</span>
              <span className="th center">操作</span>
            </div>
            {rows.map((item) => (
              <div
                key={item.path}
                className="tr archives-grid"
                onDoubleClick={() => void openPath(item.path)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  void openMenu({
                    name: item.name,
                    path: item.path,
                    size: item.size,
                    type: 'file',
                    mtime: item.mtime
                  })
                }}
                title={item.path}
              >
                <span className="td file-name">
                  <Icon name="archive" size={14} />
                  <span className="ellipsis">{item.name}</span>
                </span>
                <span className="td num strong">{formatBytes(item.size)}</span>
                <span className="td muted">
                  {ARCHIVE_LABELS[item.ext] ?? item.ext.toUpperCase()}
                </span>
                <span className="td muted nowrap" title={formatTime(item.mtime)}>
                  {formatRelativeTime(item.mtime)}
                </span>
                <span className="td path">{item.path}</span>
                <span className="td center">
                  {item.ext === 'zip' && (
                    <button
                      className="btn ghost xs"
                      onClick={() => void inspect(item)}
                      title="看看 ZIP 里面有什么"
                    >
                      <Icon name="eye" size={12} /> 内容
                    </button>
                  )}
                  <button
                    className="icon-btn xs"
                    title="打开压缩包"
                    onClick={() => void openPath(item.path)}
                  >
                    <Icon name="external" size={13} />
                  </button>
                  <button
                    className="icon-btn xs"
                    title="在资源管理器中定位"
                    onClick={() => void locatePath(item.path)}
                  >
                    <Icon name="locate" size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="table-foot">
            <span className="muted">
              显示 {formatCount(rows.length)} / {formatCount(stats.archives.length)}{' '}
              个（按大小排序）
            </span>
            {limit < stats.archives.length && (
              <button
                className="btn ghost sm"
                onClick={() => setLimit((value) => value + PAGE * 2)}
              >
                再显示 {Math.min(PAGE * 2, stats.archives.length - limit)} 个
              </button>
            )}
          </div>
        </>
      )}

      <p className="view-note">
        <Icon name="alert" size={13} />
        「压缩包」不等于垃圾：有些是你要留的资料。清理前先打开确认，重要压缩包请先备份。
      </p>

      {inspection && (
        <div className="modal-overlay" onMouseDown={() => setInspection(null)}>
          <div
            className="modal archive-modal"
            role="dialog"
            aria-modal="true"
            aria-label="压缩包内容"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <h3>
                <Icon name="archive" size={16} /> {inspection.info.name}
              </h3>
              <button
                className="icon-btn xs"
                onClick={() => setInspection(null)}
                title="关闭"
                aria-label="关闭"
              >
                <Icon name="close" size={14} />
              </button>
            </header>
            <div className="archive-modal-body">
              {inspection.loading && <p className="muted">正在读取压缩包目录…</p>}
              {!inspection.loading && inspection.data?.error && (
                <p className="trash-error">{inspection.data.error}</p>
              )}
              {!inspection.loading && inspection.data && !inspection.data.error && (
                <>
                  <p className="archive-summary">
                    共 {formatCount(inspection.data.entries.length)} 项 · 解压后约{' '}
                    {formatBytes(inspection.data.unpackedBytes)} · 压缩包{' '}
                    {formatBytes(inspection.data.totalSize)}
                  </p>
                  <div className="archive-entries">
                    {inspection.data.entries.slice(0, 800).map((entry) => (
                      <div key={entry.name} className="archive-entry">
                        <Icon name={entry.isDir ? 'folder' : 'file'} size={12} />
                        <span className="ellipsis">{entry.name}</span>
                        <span className="muted">
                          {entry.isDir ? '目录' : formatBytes(entry.size)}
                        </span>
                      </div>
                    ))}
                    {inspection.data.entries.length > 800 && (
                      <p className="muted pad-sm">只显示前 800 项，完整内容请用系统工具打开。</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <footer className="modal-foot">
              <button className="btn ghost sm" onClick={() => void openPath(inspection.info.path)}>
                <Icon name="external" size={13} /> 用系统工具打开
              </button>
              <button className="btn primary sm" onClick={() => setInspection(null)}>
                关闭
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
