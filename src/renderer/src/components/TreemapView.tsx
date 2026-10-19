import { useCallback, useMemo } from 'react'
import { useScanStore } from '../store/scanStore'
import { formatBytes, formatCount } from '../../../shared/format'
import { buildTreemapOption, type ChartDatum } from './treemapData'
import { FileActionPanel } from './FileActionPanel'
import { EChart } from './EChart'
import { TopList } from './TopList'

/** Treemap 主视图：面包屑 + 一层数据 + 点击下钻（F2）；点文件块弹出操作面板（F5） */
export function TreemapView(): React.JSX.Element {
  const { breadcrumb, pushView, popTo, visibleTypes, extFilter, selectFile, selectedFile } =
    useScanStore()
  const current = breadcrumb[breadcrumb.length - 1]

  const filter = useMemo(() => ({ types: visibleTypes, ext: extFilter }), [visibleTypes, extFilter])
  const option = useMemo(
    () => (current ? buildTreemapOption(current, filter, selectedFile?.path ?? null) : {}),
    [current, filter, selectedFile]
  )

  const handleClick = useCallback(
    (params: { data?: unknown }) => {
      const datum = params.data as ChartDatum | undefined
      if (datum?.type === 'dir' && datum.node) {
        pushView(datum.node)
        selectFile(null)
      } else if (datum?.type === 'file' && datum.node) {
        // 文件块 → 选中并弹出操作面板（定位/回收站）
        selectFile(datum.node)
      }
    },
    [pushView, selectFile]
  )

  if (!current) return <></>

  const allCount = (current.children ?? []).length
  const visibleCount = (current.children ?? []).filter((c) => c.size > 0).length
  const filtered = allCount !== visibleCount || extFilter !== null

  return (
    <div className="treemap-view">
      <nav className="breadcrumb" aria-label="目录层级">
        {breadcrumb.map((node, index) => (
          <span key={node.path}>
            {index > 0 && <span className="sep">›</span>}
            <button
              className={`crumb ${index === breadcrumb.length - 1 ? 'current' : ''}`}
              title={node.path}
              onClick={() => popTo(index)}
              disabled={index === breadcrumb.length - 1}
            >
              {node.name || node.path}
            </button>
          </span>
        ))}
      </nav>
      <p className="level-hint">
        当前层 <b>{formatCount(visibleCount)}</b> 个直接子项（共 {formatCount(allCount)} 个）
        {filtered && <span className="filtered-flag"> · 已按条件过滤</span>} · 合计{' '}
        <b>{formatBytes(current.size)}</b> · 块越大占地方越多，点目录块进入下一层，点文件块看预览和操作
      </p>
      {/* 操作面板常驻图表上方：选中即出现，不用翻页找 */}
      <FileActionPanel />
      <EChart option={option} height={440} onEvents={{ click: handleClick as never }} />
      <TopList node={current} mode="level" title="本层最大的 10 个" />
    </div>
  )
}
