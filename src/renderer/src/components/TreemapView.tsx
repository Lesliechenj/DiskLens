import { useCallback, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useScanStore } from '../store/scanStore'
import { formatBytes, formatCount } from '../../../shared/format'
import { buildTreemapOption, type TreemapDatum } from './treemapData'

/** Treemap 主视图：面包屑 + 一层数据 + 点击下钻 */
export function TreemapView(): React.JSX.Element {
  const { breadcrumb, pushView, popTo } = useScanStore()
  const current = breadcrumb[breadcrumb.length - 1]

  const option = useMemo(() => (current ? buildTreemapOption(current) : {}), [current])

  const handleClick = useCallback(
    (params: { data?: unknown }) => {
      const datum = params.data as TreemapDatum | undefined
      if (datum?.type === 'dir' && datum.node) {
        pushView(datum.node)
      }
    },
    [pushView]
  )

  if (!current) return <></>

  const childCount = (current.children ?? []).filter((c) => c.size > 0).length

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
        当前层 <b>{formatCount(childCount)}</b> 个直接子项 · 合计{' '}
        <b>{formatBytes(current.size)}</b> · 块越大占地方越多，点目录块可进入下一层
      </p>
      <ReactECharts
        option={option}
        style={{ height: 440, width: '100%' }}
        onEvents={{ click: handleClick }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}
