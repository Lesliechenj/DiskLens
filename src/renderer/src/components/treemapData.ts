import type { EChartsOption } from 'echarts'
import { formatBytes, formatTime } from '../../../shared/format'
import type { ScanNode } from '../../../shared/types'
import {
  buildLevelData,
  escapeHtml,
  pickColor,
  sizeRatio,
  type ChartDatum,
  type LevelFilter
} from './chartCommon'

export { buildLevelData, type ChartDatum, type LevelFilter } from './chartCommon'

/** 构造当前层的 Treemap option（纯函数，可单测） */
export function buildTreemapOption(node: ScanNode, filter: LevelFilter = {}): EChartsOption {
  const data = buildLevelData(node, filter)
  const maxSize = data.reduce((max, d) => Math.max(max, d.value), 0)
  const seriesData = data.map((d) => ({
    ...d,
    itemStyle: { color: pickColor(d.type, sizeRatio(d, maxSize)) }
  }))

  return {
    animationDurationUpdate: 300,
    tooltip: {
      backgroundColor: 'rgba(27, 27, 31, 0.95)',
      borderColor: '#414853',
      textStyle: { color: 'rgba(255, 255, 245, 0.86)', fontSize: 13 },
      formatter: (params) => {
        const d = (params as { data?: ChartDatum }).data
        if (!d) return ''
        const lines = [`<b>${escapeHtml(d.name)}</b>`, `大小：${formatBytes(d.value)}`]
        if (d.type === 'dir') lines.push('类型：目录（点击进入下一层）')
        else if (d.type === 'other') lines.push('类型：小文件合并')
        else lines.push('类型：文件')
        lines.push(`路径：${escapeHtml(d.path)}`)
        if (d.mtime) lines.push(`修改：${formatTime(d.mtime)}`)
        return lines.join('<br/>')
      }
    },
    series: [
      {
        type: 'treemap',
        data: seriesData,
        leafDepth: 1,
        roam: false,
        breadcrumb: { show: false }, // 用自己的面包屑（小白友好）
        itemStyle: { borderColor: '#1b1b1f', borderWidth: 2, gapWidth: 2 },
        label: {
          show: true,
          color: 'rgba(255, 255, 245, 0.92)',
          fontSize: 12,
          formatter: '{b}'
        },
        upperLabel: { show: false },
        emphasis: {
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: true, fontWeight: 700 }
        }
      }
    ]
  }
}
