import { useCallback, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useScanStore } from '../store/scanStore'
import { formatCount } from '../../../shared/format'
import { buildPieOption, buildTypeData, type PieDatum } from './pieData'

/** 饼图概览：全盘文件类型构成，回答"哪类文件最占"（F3） */
export function PieView(): React.JSX.Element {
  const result = useScanStore((s) => s.result)
  const extFilter = useScanStore((s) => s.extFilter)
  const focusExtension = useScanStore((s) => s.focusExtension)

  const agg = useMemo(() => (result ? buildTypeData(result.root) : null), [result])
  const option = useMemo(
    () => (agg ? buildPieOption(agg, extFilter) : {}),
    [agg, extFilter]
  )

  // 点切片 → 切到面积图并只显示该类型；点"其他"合并块 = 取消筛选
  const handleClick = useCallback(
    (params: { data?: unknown }) => {
      const datum = params.data as PieDatum | undefined
      if (!datum) return
      focusExtension(datum.ext)
    },
    [focusExtension]
  )

  if (!result || !agg) return <></>

  return (
    <div className="pie-view">
      <p className="level-hint">
        全盘共 <b>{formatCount(agg.totalCount)}</b> 个文件 · {agg.typeCount} 种类型 ·{' '}
        点饼图切片可只看该类文件，点"其他"取消
      </p>
      <ReactECharts
        option={option}
        style={{ height: 460, width: '100%' }}
        onEvents={{ click: handleClick }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}
