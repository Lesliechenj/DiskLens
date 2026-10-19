// 类型构成视图数据层：全树按大类聚合 → 环形图 option
// 回答小白那句"我的盘到底被什么东西吃掉了"

import type { EChartsOption } from 'echarts'
import { formatBytes, formatCount, formatPercent } from '../../../shared/format'
import type { IconName } from '../../../shared/iconNames'
import { CATEGORY_META, type ExtCategory } from '../../../shared/extCategories'
import type { CategoryStat, Insights } from './insights'
import { categoryColor, escapeHtml, pickTextColor, pickTooltipTheme } from './chartCommon'

/** 环形图保留的切片数，其余合并成"其他" */
const MAX_SLICES = 7

export interface CategorySlice extends CategoryStat {
  label: string
  icon: IconName
}

/** 构造环形图 option（纯函数，可单测） */
export function buildCategoryDonutOption(insights: Insights, dark = true): EChartsOption {
  const sorted = [...insights.categories].filter((c) => c.size > 0)
  const kept = sorted.slice(0, MAX_SLICES)
  const rest = sorted.slice(MAX_SLICES)
  const slices: CategorySlice[] = kept.map((c) => ({
    ...c,
    label: CATEGORY_META[c.category].label,
    icon: CATEGORY_META[c.category].icon
  }))
  if (rest.length > 0) {
    slices.push({
      category: 'other',
      size: rest.reduce((s, c) => s + c.size, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
      label: '其他几类',
      icon: 'other'
    })
  }

  const totalSize = insights.totalSize
  const seriesData = slices.map((slice) => ({
    name: slice.label,
    value: slice.size,
    itemStyle: { color: categoryColor(slice.category as ExtCategory) },
    /** 点击回传用 */
    category: slice.category
  }))

  return {
    animationDurationUpdate: 320,
    title: {
      text: formatBytes(totalSize),
      subtext: `${formatCount(insights.totalFiles)} 个文件`,
      left: 'center',
      top: '40%',
      textStyle: { color: pickTextColor(dark), fontSize: 20, fontWeight: 700 },
      subtextStyle: { color: pickTextColor(dark), fontSize: 12, opacity: 0.6 }
    },
    tooltip: {
      ...pickTooltipTheme(dark),
      formatter: (params) => {
        const p = params as {
          name: string
          value: number
          percent?: number
          data?: { category?: string }
        }
        const category = p.data?.category as ExtCategory | undefined
        const slice = slices.find((s) => s.label === p.name)
        const lines = [
          `<b>${escapeHtml(p.name)}</b>`,
          `大小：${formatBytes(p.value)}（${formatPercent(p.value, totalSize)}%）`,
          `个数：${formatCount(slice?.count ?? 0)}`
        ]
        if (category && category !== 'other') lines.push(CATEGORY_META[category].hint)
        return lines.join('<br/>')
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '76%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        padAngle: 1.5,
        itemStyle: { borderRadius: 4, borderColor: dark ? '#141821' : '#ffffff', borderWidth: 2 },
        label: {
          show: true,
          formatter: '{b}\n{d}%',
          color: pickTextColor(dark),
          fontSize: 11,
          lineHeight: 15
        },
        labelLine: { length: 8, length2: 10, smooth: true },
        labelLayout: { hideOverlap: true },
        emphasis: {
          scaleSize: 6,
          label: { show: true, fontWeight: 700 }
        },
        data: seriesData
      }
    ]
  }
}

/** 类型构成表要展示的行（全量，交给视图做 TopN/滚动） */
export function buildCategoryRows(insights: Insights): CategorySlice[] {
  return insights.categories
    .filter((c) => c.size > 0)
    .map((c) => ({
      ...c,
      label: CATEGORY_META[c.category].label,
      icon: CATEGORY_META[c.category].icon
    }))
}
