// 面积图（主视图）：块越大 = 占地方越多
// 点目录下钻、点文件看详情；图例可点（只看这类），筛选条件全部前端生效

import { useCallback, useMemo } from 'react'
import { useScanStore, useCurrentNode } from '../../store/scanStore'
import { useDark } from '../../store/settingsStore'
import { formatBytes, formatCount } from '../../../../shared/format'
import { CATEGORY_META } from '../../../../shared/extCategories'
import { buildLevelData, buildTreemapOption, type ChartDatum } from '../../lib/treemapData'
import { presentCategories } from '../../lib/chartCommon'
import { categoryColor } from '../../lib/chartCommon'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import { EChart } from '../EChart'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

export function TreemapView(): React.JSX.Element {
  const current = useCurrentNode()
  const filters = useScanStore((state) => state.filters)
  const selected = useScanStore((state) => state.selected)
  const select = useScanStore((state) => state.select)
  const pushView = useScanStore((state) => state.pushView)
  const setCategory = useScanStore((state) => state.setCategory)
  const dark = useDark()
  const openMenu = useNodeMenu()

  const levelFilter = useMemo(
    () => ({
      types: filters.types,
      category: filters.category,
      ext: filters.ext,
      minSize: filters.minSize
    }),
    [filters]
  )

  const data = useMemo(
    () => (current ? buildLevelData(current, levelFilter) : []),
    [current, levelFilter]
  )

  const option = useMemo(
    () =>
      current
        ? buildTreemapOption(current, levelFilter, { selectedPath: selected?.path ?? null, dark })
        : {},
    [current, levelFilter, selected, dark]
  )

  const categories = useMemo(() => presentCategories(data), [data])

  const handleClick = useCallback(
    (params: unknown) => {
      const datum = (params as { data?: ChartDatum }).data
      if (!datum?.node) return
      if (datum.node.type === 'dir') {
        pushView(datum.node)
        select(null)
      } else {
        select(datum.node)
      }
    },
    [pushView, select]
  )

  const handleContext = useCallback(
    (params: unknown) => {
      const datum = (params as { data?: ChartDatum }).data
      if (!datum?.node) return
      select(datum.node)
      void openMenu(datum.node)
    },
    [select, openMenu]
  )

  const events = useMemo(
    () => ({ click: handleClick as never, contextmenu: handleContext as never }),
    [handleClick, handleContext]
  )

  if (!current) return <></>

  const shownSize = data.reduce((sum, item) => sum + item.value, 0)
  const allChildren = (current.children ?? []).filter((child) => child.size > 0).length
  const filtered =
    data.length < allChildren ||
    filters.category !== null ||
    filters.ext !== null ||
    filters.minSize > 0 ||
    filters.types.length < 2

  return (
    <div className="view view-chart">
      <div className="view-bar">
        <div className="view-bar-left">
          <span className="view-bar-stat">
            <b>{formatCount(data.length)}</b> 项 · 合计 <b>{formatBytes(shownSize)}</b>
          </span>
          {filtered && (
            <span className="pill warn">
              <Icon name="alert" size={11} /> 已按筛选过滤
            </span>
          )}
        </div>
        <div className="view-bar-right legend">
          {categories.map((category) => {
            const meta = CATEGORY_META[category]
            const active = filters.category === category
            return (
              <button
                key={category}
                className={`legend-item${active ? ' active' : ''}`}
                onClick={() => setCategory(active ? null : category)}
                title={active ? `取消只看「${meta.label}」` : `只看「${meta.label}」：${meta.hint}`}
              >
                <i style={{ background: categoryColor(category) }} />
                {meta.label}
              </button>
            )
          })}
        </div>
        <span className="view-bar-hint">
          {current.name || current.path} · 合计 {formatBytes(current.size)}
        </span>
      </div>

      <div className="view-chart-body">
        {data.length === 0 ? (
          <EmptyState
            icon="folder-open"
            title="这一层没有能显示的内容"
            hint={
              filters.category || filters.ext || filters.minSize > 0
                ? '当前筛选条件下空了。清掉筛选条件再看看。'
                : '目录是空的，或者里面的东西都小于"最小显示大小"阈值。'
            }
            action={
              filters.category || filters.ext || filters.minSize > 0
                ? { label: '清空筛选', onClick: () => useScanStore.getState().resetFilters() }
                : undefined
            }
          />
        ) : (
          <EChart option={option} onEvents={events} />
        )}
      </div>
    </div>
  )
}
