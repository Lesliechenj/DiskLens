import type { EChartsOption } from 'echarts'
import { formatBytes, formatTime } from '../../../shared/format'
import type { ScanNode } from '../../../shared/types'

/** 同层直接子节点超过此数时，最小的合并为"其他"，防止 treemap 碎成渣 */
export const MAX_CHILDREN = 200

/** Treemap 渲染数据（挂原始节点引用用于点击下钻） */
export interface TreemapDatum {
  name: string
  value: number
  path: string
  mtime: number
  type: 'file' | 'dir' | 'other'
  node?: ScanNode
}

// 配色（深色背景）：目录蓝系 / 文件橙系，块越大颜色越亮；"其他"灰色
const DIR_COLORS = ['#1e3a6e', '#2b4f9e', '#3b6fd4', '#5a8ae8']
const FILE_COLORS = ['#7a5230', '#a06a3a', '#c88a4a', '#e0a458']
const OTHER_COLOR = '#5a5f6a'

function pickColor(type: TreemapDatum['type'], ratio: number): string {
  if (type === 'other') return OTHER_COLOR
  const palette = type === 'dir' ? DIR_COLORS : FILE_COLORS
  // ratio ∈ [0,1]，越大越亮
  const index = Math.min(palette.length - 1, Math.floor(ratio * palette.length))
  return palette[index]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 把某一层的直接子节点转成 Treemap 数据。
 * 只转当前层（不带下层 children）——下钻时重建数据，
 * 保证每屏只回答"这层谁最大"，百万文件也不卡。
 */
export function buildLevelData(node: ScanNode): TreemapDatum[] {
  // 0 字节文件/空目录不占面积，过滤掉（否则 treemap 里是隐形块）
  const kids = (node.children ?? []).filter((c) => c.size > 0)

  if (kids.length <= MAX_CHILDREN) {
    return kids.map((c) => ({
      name: c.name,
      value: c.size,
      path: c.path,
      mtime: c.mtime,
      type: c.type,
      node: c
    }))
  }

  // 超出上限：保留最大的 MAX_CHILDREN - 1 个，其余合并为"其他"
  const sorted = [...kids].sort((a, b) => b.size - a.size)
  const kept = sorted.slice(0, MAX_CHILDREN - 1)
  const rest = sorted.slice(MAX_CHILDREN - 1)
  const data: TreemapDatum[] = kept.map((c) => ({
    name: c.name,
    value: c.size,
    path: c.path,
    mtime: c.mtime,
    type: c.type,
    node: c
  }))
  data.push({
    name: `其他 ${rest.length} 个小文件`,
    value: rest.reduce((s, c) => s + c.size, 0),
    path: node.path,
    mtime: 0,
    type: 'other'
  })
  return data
}

/** 构造当前层的 Treemap option（纯函数，可单测） */
export function buildTreemapOption(node: ScanNode): EChartsOption {
  const data = buildLevelData(node)
  const maxSize = data.reduce((max, d) => Math.max(max, d.value), 0)
  const seriesData = data.map((d) => ({
    ...d,
    itemStyle: { color: pickColor(d.type, maxSize > 0 ? d.value / maxSize : 0) }
  }))

  return {
    animationDurationUpdate: 300,
    tooltip: {
      backgroundColor: 'rgba(27, 27, 31, 0.95)',
      borderColor: '#414853',
      textStyle: { color: 'rgba(255, 255, 245, 0.86)', fontSize: 13 },
      formatter: (params) => {
        const d = (params as { data?: TreemapDatum }).data
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
