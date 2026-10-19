import { useMemo } from 'react'
import { useScanStore } from '../store/scanStore'
import { formatBytes, formatCount } from '../../../shared/format'
import type { ScanNode } from '../../../shared/types'
import { buildLevelData } from './treemapData'
import { topFilesOfTree } from '../lib/treeOps'
import { riskOf } from '../lib/risk'

interface TopListProps {
  /** level 模式：当前层节点；tree 模式：整棵树的根 */
  node: ScanNode
  /** level = 本层直接子项 Top N；tree = 全盘文件 Top N */
  mode: 'level' | 'tree'
  title: string
}

/** Top N 排行榜：小白看排行榜比看色块图直观；行点击即可选中/进入 */
export function TopList({ node, mode, title }: TopListProps): React.JSX.Element | null {
  const { visibleTypes, extFilter, selectedFile, selectFile, pushView } = useScanStore()

  const items = useMemo(() => {
    if (mode === 'tree') {
      return topFilesOfTree(node, 10).map((n) => ({ node: n, total: node.size }))
    }
    // level 模式：跟随筛选条件，"其他"合并块没有 node，不进排行
    return buildLevelData(node, { types: visibleTypes, ext: extFilter })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .filter((d) => d.node)
      .map((d) => ({ node: d.node!, total: node.size }))
  }, [node, mode, visibleTypes, extFilter])

  const maxSize = items.reduce((m, i) => Math.max(m, i.node.size), 0)
  if (items.length === 0) return null

  return (
    <div className="top-list">
      <div className="top-list-head">
        <b>{title}</b>
        <span>点目录进入下一层，点文件弹出操作面板</span>
      </div>
      {items.map((item, index) => {
        const isDir = item.node.type === 'dir'
        const selected = selectedFile?.path === item.node.path
        const pct = item.total > 0 ? ((item.node.size / item.total) * 100).toFixed(1) : '0.0'
        return (
          <button
            key={item.node.path}
            className={`top-row ${selected ? 'selected' : ''}`}
            title={item.node.path}
            onClick={() => {
              if (isDir) {
                pushView(item.node)
                selectFile(null)
              } else {
                selectFile(item.node)
              }
            }}
          >
            <span className="top-rank">{index + 1}</span>
            <span className="top-risk">{riskOf(item.node).icon}</span>
            <span className="top-name">{item.node.name}</span>
            <span className="top-bar">
              <i style={{ width: `${maxSize > 0 ? (item.node.size / maxSize) * 100 : 0}%` }} />
            </span>
            <span className="top-pct">{pct}%</span>
            <span className="top-size">{formatBytes(item.node.size)}</span>
          </button>
        )
      })}
      <div className="top-list-foot">
        共 {formatCount(items.length)} 项 · 占比相对于
        {items[0].node.type === 'file' ? '全盘' : '本层'}总量
      </div>
    </div>
  )
}
