// 面积图（Treemap）数据层：当前层直接子项 → ECharts option
// 纯函数，可单测；颜色按文件大类走，块越大越亮

import type { EChartsOption } from 'echarts'
import { formatBytes, formatRelativeTime, formatTime } from '../../../shared/format'
import type { ScanNode } from '../../../shared/types'
import { CATEGORY_META } from '../../../shared/extCategories'
import { RISK, riskOf } from '../../../shared/risk'
import {
  buildLevelData,
  categoryColor,
  escapeHtml,
  pickTooltipTheme,
  pickTextColor,
  shadeByRatio,
  sizeRatio,
  type ChartDatum,
  type LevelFilter
} from './chartCommon'

export { buildLevelData, type ChartDatum, type LevelFilter } from './chartCommon'

interface TreemapBuildOptions {
  /** 选中块的路径（白框锁住，点完也知道操作的是哪块） */
  selectedPath?: string | null
  /** 深色/浅色主题（图例、描边、文字色不同） */
  dark?: boolean
}

/** 构造当前层的 Treemap option（纯函数，可单测） */
export function buildTreemapOption(
  node: ScanNode,
  filter: LevelFilter = {},
  options: TreemapBuildOptions = {}
): EChartsOption {
  const { selectedPath = null, dark = true } = options
  const data = buildLevelData(node, filter)
  const maxSize = data.reduce((max, d) => Math.max(max, d.value), 0)
  const textColor = pickTextColor(dark)
  const borderColor = dark ? '#0f1218' : '#ffffff'

  const seriesData = data.map((d) => ({
    ...d,
    itemStyle: {
      color:
        d.type === 'other'
          ? dark
            ? '#4a505c'
            : '#cfd6e2'
          : shadeByRatio(categoryColor(d.category), sizeRatio(d, maxSize)),
      // 选中块：持久白框（不靠 hover，小白点完也知道点的是哪块）
      ...(selectedPath !== null && d.path === selectedPath
        ? { borderColor: dark ? '#ffffff' : '#1f2937', borderWidth: 3 }
        : {})
    }
  }))

  return {
    animationDurationUpdate: 260,
    tooltip: {
      ...pickTooltipTheme(dark),
      formatter: (params) => {
        const d = (params as { data?: ChartDatum }).data
        if (!d) return ''
        const share = node.size > 0 ? ((d.value / node.size) * 100).toFixed(1) : '0.0'
        const lines = [
          `<b>${escapeHtml(d.name)}</b>`,
          `大小：${formatBytes(d.value)}（占本层 ${share}%）`
        ]
        if (d.type === 'dir') {
          lines.push(`类型：目录 · 里面 ${d.childCount ?? 0} 个直接子项`)
          lines.push('点击可进入下一层')
        } else if (d.type === 'other') {
          lines.push('类型：小内容合并（点不动，可换更细的筛选条件）')
        } else {
          lines.push(
            `类型：${CATEGORY_META[d.category]?.label ?? '其他'} · ${
              d.category === 'other' ? '未知后缀' : (CATEGORY_META[d.category]?.hint ?? '')
            }`
          )
        }
        if (d.node) {
          const risk = riskOf(d.node)
          lines.push(`风险：${risk.icon} ${risk.label} —— ${risk.hint}`)
        }
        lines.push(`路径：${escapeHtml(d.path)}`)
        if (d.mtime) lines.push(`修改：${formatTime(d.mtime)}（${formatRelativeTime(d.mtime)}）`)
        return lines.join('<br/>')
      }
    },
    series: [
      {
        type: 'treemap',
        data: seriesData,
        leafDepth: 1,
        roam: false,
        breadcrumb: { show: false }, // 用自己的面包屑（小白友好，还能点任意层）
        nodeClick: false, // 点击事件交给我们自己处理（下钻/选中）
        itemStyle: { borderColor, borderWidth: 2, gapWidth: 2 },
        label: {
          show: true,
          color: textColor,
          fontSize: 12,
          // 风险图标直接标在块上（"其他"合并块不标）
          formatter: (params) => {
            const d = (params as { data?: ChartDatum }).data
            if (!d) return ''
            const risk = d.node ? riskOf(d.node) : null
            const icon = risk && risk.level !== 'caution' ? `${risk.icon} ` : ''
            return `${icon}${d.name}`
          }
        },
        upperLabel: { show: false },
        emphasis: {
          itemStyle: { borderColor: dark ? '#fff' : '#0f172a', borderWidth: 2 },
          label: { show: true, fontWeight: 700 }
        }
      }
    ]
  }
}

/** 风险图例（UI 展示用） */
export const RISK_LEGEND = [RISK.danger, RISK.caution, RISK.safe]
