// 自有 ECharts React 封装（替代 echarts-for-react）。
// 存在原因：echarts-for-react 的 ESM 入口静态 import 全量 echarts，
// 按需引入会被它拖全量回来——包体积从 ~1MB 涨到 3.3MB。
// 自持 init/dispose/resize/事件，逻辑透明可控。
import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import type { ECharts as EChartsType } from 'echarts/core'
import echarts from '../lib/echarts'

interface EChartProps {
  option: EChartsOption
  /** 容器高度（px），宽度 100% */
  height?: number
  /** echarts 事件名 → 处理函数，如 { click: (params) => … } */
  onEvents?: Record<string, (params: never) => void>
}

export function EChart({ option, height = 440, onEvents }: EChartProps): React.JSX.Element {
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

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(div)

    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // option 变化 → 整体替换（notMerge：防筛选项变少时残留旧块）
  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  // 事件绑定跟随 onEvents 对象变化
  useEffect(() => {
    const chart = chartRef.current
    const events = eventsRef.current
    if (!chart || !events) return
    const names = Object.keys(events)
    for (const name of names) {
      chart.on(name, events[name] as never)
    }
    return () => {
      for (const name of names) chart.off(name)
    }
  }, [onEvents])

  return <div ref={divRef} style={{ width: '100%', height }} />
}
