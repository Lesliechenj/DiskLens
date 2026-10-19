// 自有 ECharts React 封装（不再引 echarts-for-react）
// 原因：echarts-for-react 的 ESM 入口静态 import 全量 echarts，按需引入会被它拖回全量
// 自己管 init / setOption / resize / dispose / 事件，逻辑透明可控

import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import type { ECharts as EChartsType } from 'echarts/core'
import echarts from '../lib/echarts'

interface EChartProps {
  option: EChartsOption
  /** echarts 事件名 → 处理函数，如 { click: (params) => … } */
  onEvents?: Record<string, (params: never) => void>
  className?: string
}

export function EChart({ option, onEvents, className }: EChartProps): React.JSX.Element {
  const divRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  // 事件处理器放 ref：换 handler 不重建绑定（渲染期不碰 ref，放 effect 里更新）
  const eventsRef = useRef(onEvents)
  useEffect(() => {
    eventsRef.current = onEvents
  }, [onEvents])

  // 初始化 / 销毁（只跑一次）
  useEffect(() => {
    const div = divRef.current
    if (!div) return
    const chart = echarts.init(div, null, { renderer: 'canvas' })
    chartRef.current = chart

    const observer = new ResizeObserver(() => {
      // 容器尺寸变化（侧栏折叠、窗口缩放、详情面板开合）都要跟着重排
      chart.resize()
    })
    observer.observe(div)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // option 变化 → 整体替换（notMerge：筛选条件变少时不留旧块）
  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  // 事件绑定跟随 onEvents 对象变化
  useEffect(() => {
    const chart = chartRef.current
    const events = eventsRef.current
    if (!chart || !events) return
    const names = Object.keys(events)
    for (const name of names) chart.on(name, events[name] as never)
    return () => {
      for (const name of names) chart.off(name)
    }
  }, [onEvents])

  return <div ref={divRef} className={className ? `echart ${className}` : 'echart'} />
}
