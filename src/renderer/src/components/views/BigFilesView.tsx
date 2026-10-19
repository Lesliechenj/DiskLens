// 大文件榜单：全盘最大的 300 个文件，可排序、可翻页
// 小白最实用的第二屏——"到底是谁把我的盘塞满了"，一眼看到具体文件

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
import { extInfo } from '../../../../shared/extCategories'
import { riskOf } from '../../../../shared/risk'
import { categoryColor } from '../../lib/chartCommon'
import { locatePath } from '../../lib/actions'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

type SortKey = 'size' | 'name' | 'mtime'

const PAGE = 100

export function BigFilesView(): React.JSX.Element {
  const insights = useInsights()
  const selected = useScanStore((state) => state.selected)
  const select = useScanStore((state) => state.select)
  const openMenu = useNodeMenu()
  const [sortKey, setSortKey] = useState<SortKey>('size')
  const [asc, setAsc] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const rows = useMemo(() => {
    const files = insights?.largestFiles ?? []
    const sorted = [...files].sort((a, b) => {
      const diff =
        sortKey === 'size'
          ? a.size - b.size
          : sortKey === 'mtime'
            ? a.mtime - b.mtime
            : a.name.localeCompare(b.name, 'zh-CN')
      return asc ? diff : -diff
    })
    return sorted.slice(0, limit)
  }, [insights, sortKey, asc, limit])

  if (!insights) {
    return (
      <div className="view">
        <EmptyState
          icon="list"
          title="还没有扫描结果"
          hint="扫描一次，这里会列出最占地方的文件。"
        />
      </div>
    )
  }

  const total = insights.totalSize
  const shownSize = rows.reduce((sum, file) => sum + file.size, 0)

  const toggleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setAsc((value) => !value)
    } else {
      setSortKey(key)
      setAsc(key === 'name')
    }
  }

  const sortMark = (key: SortKey): React.JSX.Element | null =>
    sortKey === key ? (
      <Icon name={asc ? 'arrow-up' : 'chevron-down'} size={11} className="sort-mark" />
    ) : null

  return (
    <div className="view view-scroll">
      <div className="view-bar">
        <div className="view-bar-left">
          <span className="view-bar-stat">
            最大的文件 · 合计 <b>{formatBytes(shownSize)}</b>（占全盘{' '}
            <b>{formatPercent(shownSize, total)}%</b>）
          </span>
        </div>
        <span className="view-bar-hint">点一行看详情与操作 · 双击定位到资源管理器</span>
      </div>

      <div className="table">
        <div className="table-head files-grid">
          <button className="th" onClick={() => toggleSort('name')}>
            文件 {sortMark('name')}
          </button>
          <button className="th num" onClick={() => toggleSort('size')}>
            大小 {sortMark('size')}
          </button>
          <span className="th num">占全盘</span>
          <button className="th" onClick={() => toggleSort('mtime')}>
            修改时间 {sortMark('mtime')}
          </button>
          <span className="th">位置</span>
          <span className="th center">操作</span>
        </div>

        {rows.map((file, index) => {
          const risk = riskOf(file)
          const info = extInfo(file.name)
          const active = selected?.path === file.path
          return (
            <div
              key={file.path}
              className={`tr files-grid${active ? ' selected' : ''}`}
              role="row"
              tabIndex={0}
              onClick={() => select(file)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  select(file)
                }
              }}
              onDoubleClick={() => void locatePath(file.path)}
              onContextMenu={(event) => {
                event.preventDefault()
                select(file)
                void openMenu(file)
              }}
              title={file.path}
            >
              <span className="td file-name">
                <span className="rank">{index + 1}</span>
                <i className="cat-dot" style={{ background: categoryColor(info.category) }} />
                <span className="ellipsis">{file.name}</span>
                <span className="tag tiny">{info.label}</span>
                {risk.level !== 'caution' && (
                  <span className={`tag tiny risk-${risk.level}`} title={risk.hint}>
                    {risk.icon} {risk.label}
                  </span>
                )}
              </span>
              <span className="td num strong">{formatBytes(file.size)}</span>
              <span className="td num muted">{formatPercent(file.size, total)}%</span>
              <span className="td muted nowrap" title={formatTime(file.mtime)}>
                {formatRelativeTime(file.mtime)}
              </span>
              <span className="td path">{file.path}</span>
              <span className="td center">
                <button
                  className="icon-btn xs"
                  title="在资源管理器中定位"
                  onClick={(event) => {
                    event.stopPropagation()
                    void locatePath(file.path)
                  }}
                >
                  <Icon name="locate" size={13} />
                </button>
              </span>
            </div>
          )
        })}
        {rows.length === 0 && <p className="muted pad">这个范围里没有文件。</p>}
      </div>

      <div className="table-foot">
        <span className="muted">
          显示 {formatCount(rows.length)} / {formatCount(insights.largestFiles.length)} 个大文件（从{' '}
          {formatCount(insights.totalFiles)} 个文件里挑的）
        </span>
        {limit < insights.largestFiles.length && (
          <button className="btn ghost sm" onClick={() => setLimit((value) => value + PAGE * 2)}>
            再显示 {Math.min(PAGE * 2, insights.largestFiles.length - limit)} 个
          </button>
        )}
      </div>

      <p className="view-note">
        <Icon name="info" size={13} />
        这里只列最大的 300
        个文件；找具体某个文件用右上角搜索（Ctrl+F）。想看某个文件的操作，点一下这一行。
      </p>
    </div>
  )
}
