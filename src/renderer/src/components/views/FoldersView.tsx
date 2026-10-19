// 文件夹榜：全盘最大的目录，一眼看出"哪个文件夹是重灾区"
// 点一行直接下钻到那个目录（面包屑自动铺好），比一格格点色块快得多

import { useMemo, useState } from 'react'
import { useScanStore } from '../../store/scanStore'
import { useInsights } from '../../hooks/useDerived'
import {
  formatBytes,
  formatCount,
  formatPercent,
  formatRelativeTime,
  formatTime
} from '../../../../shared/format'
import { findNodeByPath } from '../../lib/insights'
import { categoryColor } from '../../lib/chartCommon'
import { categoryOfNode } from '../../lib/chartCommon'
import { locatePath } from '../../lib/actions'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

const PAGE = 60

export function FoldersView(): React.JSX.Element {
  const insights = useInsights()
  const result = useScanStore((state) => state.result)
  const select = useScanStore((state) => state.select)
  const jumpTo = useScanStore((state) => state.jumpTo)
  const selected = useScanStore((state) => state.selected)
  const openMenu = useNodeMenu()
  const [limit, setLimit] = useState(PAGE)

  const rows = useMemo(() => (insights?.largestDirs ?? []).slice(0, limit), [insights, limit])

  if (!insights || !result) {
    return (
      <div className="view">
        <EmptyState
          icon="tree"
          title="还没有扫描结果"
          hint="扫描一次，这里会列出最占地方的文件夹。"
        />
      </div>
    )
  }

  const total = insights.totalSize

  const enter = (path: string): void => {
    const found = findNodeByPath(result.root, path)
    if (!found) return
    jumpTo(found.ancestors, found.node)
    select(null)
  }

  return (
    <div className="view view-scroll">
      <div className="view-bar">
        <div className="view-bar-left">
          <span className="view-bar-stat">最大的文件夹 · 点一行进入该目录</span>
        </div>
        <span className="view-bar-hint">「直接文件」= 这个目录里躺着的文件个数（不含子目录）</span>
      </div>

      <div className="table">
        <div className="table-head dirs-grid">
          <span className="th">#</span>
          <span className="th">文件夹</span>
          <span className="th num">占用</span>
          <span className="th num">占全盘</span>
          <span className="th num">直接文件</span>
          <span className="th num">子目录</span>
          <span className="th">最近改动</span>
          <span className="th">路径</span>
          <span className="th center">操作</span>
        </div>
        {rows.map((row, index) => {
          const dir = row.node
          const active = selected?.path === dir.path
          const category = categoryOfNode(dir)
          return (
            <div
              key={dir.path}
              className={`tr dirs-grid${active ? ' selected' : ''}`}
              role="row"
              tabIndex={0}
              onClick={() => select(dir)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  select(dir)
                }
              }}
              onDoubleClick={() => enter(dir.path)}
              onContextMenu={(event) => {
                event.preventDefault()
                select(dir)
                void openMenu(dir)
              }}
              title={`${dir.path}\n双击进入这个目录`}
            >
              <span className="td rank">{index + 1}</span>
              <span className="td file-name">
                <Icon name="folder" size={14} />
                <i className="cat-dot" style={{ background: categoryColor(category) }} />
                <span className="ellipsis">{dir.name}</span>
              </span>
              <span className="td num strong">{formatBytes(dir.size)}</span>
              <span className="td num muted">{formatPercent(dir.size, total)}%</span>
              <span className="td num muted">{formatCount(row.fileCount)}</span>
              <span className="td num muted">{formatCount(row.dirCount)}</span>
              <span className="td muted nowrap" title={formatTime(dir.mtime)}>
                {formatRelativeTime(dir.mtime)}
              </span>
              <span className="td path">{dir.path}</span>
              <span className="td center">
                <button
                  className="icon-btn xs"
                  title="进入这个目录"
                  onClick={(event) => {
                    event.stopPropagation()
                    enter(dir.path)
                  }}
                >
                  <Icon name="chevron-right" size={13} />
                </button>
                <button
                  className="icon-btn xs"
                  title="在资源管理器中定位"
                  onClick={(event) => {
                    event.stopPropagation()
                    void locatePath(dir.path)
                  }}
                >
                  <Icon name="locate" size={13} />
                </button>
              </span>
            </div>
          )
        })}
        {rows.length === 0 && <p className="muted pad">这个范围里没有子目录。</p>}
      </div>

      <div className="table-foot">
        <span className="muted">
          显示 {formatCount(rows.length)} / {formatCount(insights.largestDirs.length)} 个文件夹（共{' '}
          {formatCount(insights.totalDirs)} 个目录）
        </span>
        {limit < insights.largestDirs.length && (
          <button className="btn ghost sm" onClick={() => setLimit((value) => value + PAGE * 2)}>
            再显示 {Math.min(PAGE * 2, insights.largestDirs.length - limit)} 个
          </button>
        )}
      </div>
    </div>
  )
}
