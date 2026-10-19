// 旭日图：从当前层往外铺两圈，一眼看穿"这一层里还有谁在吃空间"
// 点内圈目录下钻，点外圈选中

import { useCallback, useMemo } from 'react'
import { useCurrentNode, useScanStore } from '../../store/scanStore'
import { useDark } from '../../store/settingsStore'
import { formatBytes, formatCount } from '../../../../shared/format'
import { findNodeByPath } from '../../lib/insights'
import { buildSunburstOption, type SunburstDatum } from '../../lib/sunburstData'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import { EChart } from '../EChart'
import { EmptyState } from '../ui/EmptyState'

export function SunburstView(): React.JSX.Element {
  const current = useCurrentNode()
  const filters = useScanStore((state) => state.filters)
  const selected = useScanStore((state) => state.selected)
  const select = useScanStore((state) => state.select)
  const jumpTo = useScanStore((state) => state.jumpTo)
  const result = useScanStore((state) => state.result)
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

  const option = useMemo(
    () =>
      current
        ? buildSunburstOption(current, levelFilter, { dark, selectedPath: selected?.path ?? null })
        : {},
    [current, levelFilter, dark, selected]
  )

  const handleClick = useCallback(
    (params: unknown) => {
      const datum = (params as { data?: SunburstDatum }).data
      if (!datum || !result) return
      if (datum.aggregate) return
      // 目录：铺好祖先链再进一层，面包屑始终准确
      if (datum.drillPath) {
        const found = findNodeByPath(result.root, datum.drillPath)
        if (!found) return
        jumpTo(found.ancestors, found.node)
        select(null)
      }
    },
    [result, jumpTo, select]
  )

  const handleContext = useCallback(
    (params: unknown) => {
      const datum = (params as { data?: SunburstDatum }).data
      if (!datum || !result || datum.aggregate) return
      const found = findNodeByPath(result.root, datum.path)
      if (!found) return
      select(found.node)
      void openMenu(found.node)
    },
    [result, select, openMenu]
  )

  const events = useMemo(
    () => ({ click: handleClick as never, contextmenu: handleContext as never }),
    [handleClick, handleContext]
  )

  if (!current) return <></>

  const childCount = current.children?.length ?? 0
  const ringSize = current.children?.reduce((sum, kid) => sum + kid.size, 0) ?? 0

  return (
    <div className="view view-chart">
      <div className="view-bar">
        <div className="view-bar-left">
          <span className="view-bar-stat">
            <b>{formatCount(childCount)}</b> 个直接子项 · 合计 <b>{formatBytes(ringSize)}</b>
          </span>
        </div>
        <span className="view-bar-hint">内圈 = 这一层，外圈 = 再往下一层 · 点目录块进入下一层</span>
      </div>
      <div className="view-chart-body">
        {childCount === 0 ? (
          <EmptyState
            icon="folder-open"
            title="这一层没有子项"
            hint="回去上一层，或者换个目录看看。"
          />
        ) : (
          <EChart option={option} onEvents={events} />
        )}
      </div>
    </div>
  )
}
