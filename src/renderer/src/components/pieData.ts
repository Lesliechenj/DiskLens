// 饼图数据层：全盘按扩展名聚合，回答"哪类文件最占"（F3）
// 与 Treemap 同源（同一棵 ScanNode 树），前端聚合不重扫

import type { EChartsOption } from 'echarts'
import { formatBytes, formatCount } from '../../../shared/format'
import type { ScanNode } from '../../../shared/types'
import { escapeHtml, extOf, OTHER_COLOR } from './chartCommon'

/** 饼图切片数据 */
export interface PieDatum {
  /** 展示名（如 "MP4" / "无扩展名" / "其他 12 种"） */
  name: string
  /** 小写扩展名（不含点）；'' = 无扩展名；null = "其他"合并块 */
  ext: string | null
  /** 该类型总字节 */
  value: number
  /** 文件个数 */
  count: number
}

export interface TypeAggregation {
  data: PieDatum[]
  /** 全盘文件总字节（饼图分母） */
  totalSize: number
  /** 全盘文件总数 */
  totalCount: number
  /** 去重后的扩展名种数 */
  typeCount: number
}

/** 分类配色（深色背景，9 色轮换；"其他"灰） */
const PIE_COLORS = [
  '#5a8ae8',
  '#e0a458',
  '#4ec9b0',
  '#c678dd',
  '#e06c75',
  '#56b6c2',
  '#d19a66',
  '#98c379',
  '#7f848e'
]

/** 全盘按扩展名聚合：top (topN-1) 种 + "其他"（纯函数，可单测） */
export function buildTypeData(root: ScanNode, topN = 8): TypeAggregation {
  const byExt = new Map<string, { value: number; count: number }>()
  let totalSize = 0
  let totalCount = 0

  // 迭代遍历（深树不爆栈）
  const stack: ScanNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'file') {
      const ext = extOf(node.name)
      const acc = byExt.get(ext) ?? { value: 0, count: 0 }
      acc.value += node.size
      acc.count += 1
      byExt.set(ext, acc)
      totalSize += node.size
      totalCount += 1
    } else if (node.children) {
      for (const c of node.children) stack.push(c)
    }
  }

  const sorted = [...byExt.entries()].sort((a, b) => b[1].value - a[1].value)
  const kept = sorted.slice(0, topN - 1)
  const rest = sorted.slice(topN - 1)

  const data: PieDatum[] = kept.map(([ext, acc]) => ({
    name: ext ? ext.toUpperCase() : '无扩展名',
    ext,
    value: acc.value,
    count: acc.count
  }))
  if (rest.length > 0) {
    data.push({
      name: `其他 ${rest.length} 种`,
      ext: null,
      value: rest.reduce((s, [, acc]) => s + acc.value, 0),
      count: rest.reduce((s, [, acc]) => s + acc.count, 0)
    })
  }

  return { data, totalSize, totalCount, typeCount: byExt.size }
}

/** 构造饼图 option（纯函数，可单测）。agg 由 buildTypeData 预计算；highlightExt：高亮某扩展名切片 */
export function buildPieOption(
  agg: TypeAggregation,
  highlightExt: string | null = null
): EChartsOption {
  const seriesData = agg.data.map((d, i) => ({
    ...d,
    itemStyle: {
      color: d.ext === null ? OTHER_COLOR : PIE_COLORS[i % PIE_COLORS.length],
      borderColor: highlightExt !== null && d.ext === highlightExt ? '#fff' : '#1b1b1f',
      borderWidth: highlightExt !== null && d.ext === highlightExt ? 3 : 2
    }
  }))

  return {
    animationDurationUpdate: 300,
    title: {
      text: formatBytes(agg.totalSize),
      subtext: `${formatCount(agg.totalCount)} 个文件 · ${agg.typeCount} 种类型`,
      left: 'center',
      top: '38%',
      textStyle: { color: 'rgba(255, 255, 245, 0.92)', fontSize: 22, fontWeight: 700 },
      subtextStyle: { color: 'rgba(255, 255, 245, 0.5)', fontSize: 12 }
    },
    tooltip: {
      backgroundColor: 'rgba(27, 27, 31, 0.95)',
      borderColor: '#414853',
      textStyle: { color: 'rgba(255, 255, 245, 0.86)', fontSize: 13 },
      formatter: (params) => {
        const d = (params as { data?: PieDatum }).data
        if (!d) return ''
        const percent = agg.totalSize > 0 ? ((d.value / agg.totalSize) * 100).toFixed(1) : '0.0'
        const lines = [
          `<b>${escapeHtml(d.name)} 文件</b>`,
          `大小：${formatBytes(d.value)}`,
          `占比：${percent}%`,
          `个数：${formatCount(d.count)}`
        ]
        if (d.ext === null) lines.push('（多种小扩展名合并，点击不限筛选）')
        else if (d.ext === '') lines.push('（无扩展名文件，点击只看这类）')
        else lines.push(`（.${escapeHtml(d.ext)}，点击只看这类）`)
        return lines.join('<br/>')
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '52%'],
        data: seriesData,
        label: {
          color: 'rgba(255, 255, 245, 0.85)',
          fontSize: 12,
          formatter: '{b}\n{d}%',
          lineHeight: 15
        },
        labelLayout: { hideOverlap: true },
        itemStyle: { borderColor: '#1b1b1f', borderWidth: 2 },
        emphasis: {
          scaleSize: 6,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: true, fontWeight: 700 }
        }
      }
    ]
  }
}
