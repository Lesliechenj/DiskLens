// 目录树视图（对齐 WinDirStat 的 Directory List）：
// 从根目录往下逐层展开，每行给出大小 / 占父级 / 直接子项数 / 修改时间。
// 和"文件夹榜"的区别：榜单是扁平的 TopN，目录树能沿着层级一路钻到最深处。
// 只渲染"展开后可见"的行，并给单目录/总行数设上限，百万文件也不会把 DOM 压垮。

import { useCallback, useMemo, useState } from 'react'
import { useScanStore } from '../../store/scanStore'
import {
  formatBytes,
  formatCount,
  formatPercent,
  formatRelativeTime,
  formatTime
} from '../../../../shared/format'
import type { ScanNode } from '../../../../shared/types'
import { categoryColor, categoryOfNode } from '../../lib/chartCommon'
import { locatePath } from '../../lib/actions'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

type SortKey = 'size' | 'name' | 'items' | 'mtime'

/** 每个目录最多展开多少个子项（超出的用一行"还有 N 项"提示，避免 DOM 爆炸） */
const CHILD_LIMIT = 400
/** 整棵可见树最多渲染多少行 */
const ROW_LIMIT = 2500

interface NodeRow {
  kind: 'node'
  node: ScanNode
  depth: number
  /** 父节点大小（算"占父级"用） */
  parentSize: number
  expanded: boolean
  /** 这个目录展开后是否还有没显示的子项 */
  hiddenChildren: number
}

interface MoreRow {
  kind: 'more'
  parent: ScanNode
  depth: number
  count: number
}

type TreeRow = NodeRow | MoreRow

/** 遍历栈元素：节点行 / "还有 N 项"提示行 */
type StackItem =
  | { kind: 'node'; node: ScanNode; depth: number; parentSize: number }
  | { kind: 'more'; parent: ScanNode; depth: number; count: number }

function compareNodes(a: ScanNode, b: ScanNode, key: SortKey, asc: boolean): number {
  const diff =
    key === 'size'
      ? a.size - b.size
      : key === 'items'
        ? (a.children?.length ?? 0) - (b.children?.length ?? 0)
        : key === 'mtime'
          ? a.mtime - b.mtime
          : a.name.localeCompare(b.name, 'zh-CN')
  return asc ? diff : -diff
}

export function TreeView(): React.JSX.Element {
  const result = useScanStore((state) => state.result)
  const selected = useScanStore((state) => state.selected)
  const select = useScanStore((state) => state.select)
  const openMenu = useNodeMenu()

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(result ? [result.root.path] : [])
  )
  const [sortKey, setSortKey] = useState<SortKey>('size')
  const [asc, setAsc] = useState(false)

  const toggle = useCallback((path: string): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const { rows, truncated } = useMemo(() => {
    if (!result) return { rows: [] as TreeRow[], truncated: false }
    const root = result.root
    const rows: TreeRow[] = []
    let truncated = false

    // 显式栈：按显示顺序压栈（LIFO 所以要反着压）
    const stack: StackItem[] = [{ kind: 'node', node: root, depth: 0, parentSize: root.size }]
    while (stack.length > 0) {
      const item = stack.pop()!
      if (rows.length >= ROW_LIMIT) {
        truncated = true
        break
      }
      if (item.kind === 'more') {
        rows.push({
          kind: 'more',
          parent: item.parent,
          depth: item.depth,
          count: item.count
        })
        continue
      }

      const node = item.node
      const isDir = node.type === 'dir'
      const isExpanded = isDir && expanded.has(node.path)
      const kids = isDir && isExpanded ? [...(node.children ?? [])] : []

      rows.push({
        kind: 'node',
        node,
        depth: item.depth,
        parentSize: item.parentSize,
        expanded: isExpanded,
        hiddenChildren: kids.length > CHILD_LIMIT ? kids.length - CHILD_LIMIT : 0
      })

      if (kids.length === 0) continue
      kids.sort((a, b) => compareNodes(a, b, sortKey, asc))
      const shown = kids.slice(0, CHILD_LIMIT)

      // "还有 N 项"排在子项之后：先压它，再反着压子项
      if (kids.length > CHILD_LIMIT) {
        stack.push({
          kind: 'more',
          parent: node,
          depth: item.depth + 1,
          count: kids.length - CHILD_LIMIT
        })
      }
      for (let index = shown.length - 1; index >= 0; index -= 1) {
        stack.push({
          kind: 'node',
          node: shown[index],
          depth: item.depth + 1,
          parentSize: node.size
        })
      }
    }
    return { rows, truncated }
  }, [result, expanded, sortKey, asc])

  if (!result) {
    return (
      <div className="view">
        <EmptyState
          icon="tree"
          title="还没有扫描结果"
          hint="扫描一个磁盘或文件夹，这里会像资源管理器一样列出整棵目录树。"
        />
      </div>
    )
  }

  const toggleSort = (key: SortKey): void => {
    if (key === sortKey) setAsc((value) => !value)
    else {
      setSortKey(key)
      setAsc(key === 'name')
    }
  }

  const sortMark = (key: SortKey): React.JSX.Element | null =>
    sortKey === key ? (
      <Icon name={asc ? 'arrowUp' : 'chevronDown'} size={10} className="sort-mark" />
    ) : null

  /** 展开当前可见的所有目录一层（"再钻一层"） */
  const expandVisible = (): void => {
    setExpanded((current) => {
      const next = new Set(current)
      for (const row of rows) {
        if (row.kind === 'node' && row.node.type === 'dir') next.add(row.node.path)
      }
      return next
    })
  }

  const collapseAll = (): void => setExpanded(new Set([result.root.path]))

  const enter = (node: ScanNode): void => {
    if (node.type !== 'dir') return
    toggle(node.path)
  }

  return (
    <div className="view view-scroll">
      <div className="view-bar">
        <div className="view-bar-left">
          <span className="view-bar-stat">
            目录树 · 共 <b>{formatCount(result.stats.dirs)}</b> 个目录 /{' '}
            <b>{formatCount(result.stats.files)}</b> 个文件
          </span>
        </div>
        <div className="view-bar-right">
          <button
            className="btn ghost sm"
            onClick={expandVisible}
            title="把当前看到的目录都展开一层"
          >
            <Icon name="chevronDown" size={12} /> 展开一层
          </button>
          <button className="btn ghost sm" onClick={collapseAll} title="只保留根目录一层">
            <Icon name="arrowUp" size={12} /> 全部收起
          </button>
        </div>
        <span className="view-bar-hint">双击目录展开/收起 · 点一行看详情 · 右键更多操作</span>
      </div>

      <div className="table">
        <div className="table-head tree-grid">
          <button className="th" onClick={() => toggleSort('name')}>
            名称 {sortMark('name')}
          </button>
          <button className="th num" onClick={() => toggleSort('size')}>
            大小 {sortMark('size')}
          </button>
          <span className="th num">占父级</span>
          <button className="th num" onClick={() => toggleSort('items')}>
            直接子项 {sortMark('items')}
          </button>
          <button className="th" onClick={() => toggleSort('mtime')}>
            最近修改 {sortMark('mtime')}
          </button>
          <span className="th center">操作</span>
        </div>

        {rows.map((row) => {
          if (row.kind === 'more') {
            return (
              <div
                key={`more:${row.parent.path}`}
                className="tr tree-grid tree-more"
                style={{ paddingLeft: 12 + row.depth * 16 }}
              >
                <span className="td muted">
                  还有 {formatCount(row.count)} 项没显示（单目录最多展开 {CHILD_LIMIT} 项）
                </span>
              </div>
            )
          }

          const node = row.node
          const isDir = node.type === 'dir'
          const active = selected?.path === node.path
          const category = categoryOfNode(node)
          return (
            <div
              key={node.path}
              className={`tr tree-grid${active ? ' selected' : ''}`}
              role="row"
              tabIndex={0}
              style={{ paddingLeft: 6 + row.depth * 16 }}
              onClick={() => select(node)}
              onDoubleClick={() => {
                if (isDir) enter(node)
                else if (node.path) void locatePath(node.path)
              }}
              onContextMenu={(event) => {
                if (!node.path) return
                event.preventDefault()
                select(node)
                void openMenu(node)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  select(node)
                }
                if (event.key === 'ArrowRight' && isDir && !row.expanded) {
                  event.preventDefault()
                  toggle(node.path)
                }
                if (event.key === 'ArrowLeft' && isDir && row.expanded) {
                  event.preventDefault()
                  toggle(node.path)
                }
              }}
              title={node.path ? `${node.path}\n双击${isDir ? '展开/收起' : '定位'}` : '全部磁盘'}
            >
              <span className="td tree-name">
                {isDir ? (
                  <button
                    className="tree-caret"
                    onClick={(event) => {
                      event.stopPropagation()
                      toggle(node.path)
                    }}
                    title={row.expanded ? '收起' : '展开'}
                    aria-label={row.expanded ? '收起目录' : '展开目录'}
                  >
                    <Icon name={row.expanded ? 'chevronDown' : 'chevronRight'} size={12} />
                  </button>
                ) : (
                  <span className="tree-caret placeholder" />
                )}
                <Icon
                  name={row.depth === 0 ? 'drive' : isDir ? 'folder' : 'file'}
                  size={14}
                  className="tree-kind"
                />
                {isDir && <i className="cat-dot" style={{ background: categoryColor(category) }} />}
                <span className="ellipsis">{node.name || node.path}</span>
              </span>
              <span className="td num strong">{formatBytes(node.size)}</span>
              <span className="td num muted">{formatPercent(node.size, row.parentSize)}%</span>
              <span className="td num muted">{formatCount(node.children?.length ?? 0)}</span>
              <span className="td muted nowrap" title={formatTime(node.mtime)}>
                {node.mtime ? formatRelativeTime(node.mtime) : '—'}
              </span>
              <span className="td center">
                {node.path && (
                  <button
                    className="icon-btn xs"
                    title="在资源管理器中定位"
                    onClick={(event) => {
                      event.stopPropagation()
                      void locatePath(node.path)
                    }}
                  >
                    <Icon name="locate" size={13} />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div className="table-foot">
        <span className="muted">
          显示 {formatCount(rows.filter((row) => row.kind === 'node').length)} 行
          {truncated && `（结果太多，只渲染前 ${ROW_LIMIT} 行，用搜索定位更准）`}
        </span>
        <span className="muted">
          根目录：{result.root.path} · 合计 {formatBytes(result.root.size)}
        </span>
      </div>

      <p className="view-note">
        <Icon name="info" size={13} />
        目录树适合「顺着文件夹一层层找」；想按大小排行看「文件夹」视图，想一眼看整盘分布看「面积图」。
      </p>
    </div>
  )
}
