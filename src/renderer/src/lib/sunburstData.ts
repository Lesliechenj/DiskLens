// 旭日图（Sunburst）数据层：当前层往下两圈 → ECharts option
// 面积图回答"这一层谁最大"，旭日图回答"再往下是谁在顶"——一眼看穿两层结构

import type { EChartsOption } from 'echarts'
import { formatBytes } from '../../../shared/format'
import type { ScanNode } from '../../../shared/types'
import {
  buildLevelData,
  categoryColor,
  categoryOfNode,
  escapeHtml,
  pickTextColor,
  pickTooltipTheme,
  shadeByRatio,
  type LevelFilter
} from './chartCommon'

/** 旭日图节点数据 */
export interface SunburstDatum {
  name: string
  value: number
  path: string
  /** 可下钻的目标节点（目录才有） */
  drillPath?: string
  itemStyle?: { color?: string; borderColor?: string; borderWidth?: number }
  /** 是否为"本目录文件"聚合块（不可下钻） */
  aggregate?: boolean
  category?: string
  children?: SunburstDatum[]
}

/** 深色/浅色主题 */
interface SunburstOptions {
  dark?: boolean
  selectedPath?: string | null
}

/** 把目录的直接子项转成旭日图节点：子目录继续展开，直接文件合并成一圈"文件"块 */
function toSunburstChildren(dir: ScanNode, dark: boolean, depth: number): SunburstDatum[] {
  const kids = dir.children ?? []
  if (kids.length === 0) return []
  const dirs = kids.filter((k) => k.type === 'dir' && k.size > 0)
  const files = kids.filter((k) => k.type === 'file' && k.size > 0)
  const out: SunburstDatum[] = []

  // 文件合并块：再多的散文件也只是一个色块，不让图碎成渣
  if (files.length > 0) {
    const fileSize = files.reduce((s, f) => s + f.size, 0)
    const topFile = files.reduce((a, b) => (b.size > a.size ? b : a), files[0])
    const category = categoryOfNode(topFile)
    out.push({
      name: `${files.length} 个文件`,
      value: fileSize,
      path: dir.path,
      aggregate: true,
      category,
      itemStyle: { color: shadeByRatio(categoryColor(category), 0.72) }
    })
  }

  const maxDir = dirs.reduce((max, d) => Math.max(max, d.size), 0)
  for (const child of dirs) {
    out.push({
      name: child.name,
      value: child.size,
      path: child.path,
      drillPath: child.path,
      category: categoryOfNode(child),
      itemStyle: {
        color: shadeByRatio(categoryColor(categoryOfNode(child)), child.size / (maxDir || 1))
      },
      children: depth > 1 ? toSunburstChildren(child, dark, depth - 1) : undefined
    })
  }
  return out
}

/**
 * 构造旭日图 option：以当前层为圆心，往外铺两圈。
 * 点击内圈目录 = 下钻（面包屑进一层）；点击外圈 = 选中该目录。
 */
export function buildSunburstOption(
  node: ScanNode,
  filter: LevelFilter = {},
  options: SunburstOptions = {}
): EChartsOption {
  const { dark = true, selectedPath = null } = options
  const level = buildLevelData(node, filter)
  const maxSize = level.reduce((max, d) => Math.max(max, d.value), 0)
  const borderColor = dark ? '#0f1218' : '#ffffff'

  const data: SunburstDatum[] = level.map((d) => {
    const base: SunburstDatum = {
      name: d.name,
      value: d.value,
      path: d.path,
      category: d.category,
      itemStyle: {
        color:
          d.type === 'other'
            ? dark
              ? '#4a505c'
              : '#cfd6e2'
            : shadeByRatio(categoryColor(d.category), sizeRatioLocal(d.value, maxSize)),
        borderColor,
        borderWidth: 1
      }
    }
    if (selectedPath && d.path === selectedPath) {
      base.itemStyle = { ...base.itemStyle, borderColor: dark ? '#fff' : '#111827', borderWidth: 3 }
    }
    if (d.node && d.type === 'dir') {
      base.drillPath = d.path
      base.children = toSunburstChildren(d.node, dark, 2)
    }
    return base
  })

  return {
    animationDurationUpdate: 400,
    tooltip: {
      ...pickTooltipTheme(dark),
      formatter: (params) => {
        const d = (params as { data?: SunburstDatum }).data
        if (!d) return ''
        const total = node.size > 0 ? ((d.value / node.size) * 100).toFixed(1) : '0.0'
        const lines = [
          `<b>${escapeHtml(d.name)}</b>`,
          `大小：${formatBytes(d.value)}（占当前层 ${total}%）`
        ]
        if (d.aggregate) lines.push('本目录直接存放的文件合计（点不动，用面积图看单文件）')
        else if (d.drillPath) lines.push('目录 —— 点击进入下一层')
        lines.push(`路径：${escapeHtml(d.path)}`)
        return lines.join('<br/>')
      }
    },
    series: [
      {
        type: 'sunburst',
        data,
        radius: ['16%', '96%'],
        center: ['50%', '50%'],
        sort: undefined,
        nodeClick: false, // 自己接管点击，避免 ECharts 内部状态与面包屑打架
        emphasis: { focus: 'ancestor' },
        itemStyle: { borderColor, borderWidth: 1 },
        label: {
          rotate: 'radial',
          color: pickTextColor(dark),
          fontSize: 11,
          minAngle: 4
        },
        levels: [
          {},
          {
            r0: '16%',
            r: '58%',
            label: { rotate: 0, fontSize: 12, fontWeight: 600 },
            itemStyle: { borderWidth: 2 }
          },
          {
            r0: '58%',
            r: '96%',
            label: { rotate: 'radial', fontSize: 10, minAngle: 6 }
          }
        ]
      }
    ]
  }
}

function sizeRatioLocal(value: number, max: number): number {
  return max > 0 ? value / max : 0
}
