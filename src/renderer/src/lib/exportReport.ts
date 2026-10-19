// 导出报告：把"概览 + 类型构成 + 大文件清单"导成 CSV（Excel 双击就能看）
// 主进程负责弹保存框、写文件、防公式注入；这里只管凑数据

import { useScanStore } from '../store/scanStore'
import { toast } from '../store/uiStore'
import { friendlyError } from './errors'
import { computeInsights } from './insights'
import { CATEGORY_META, extInfo } from '../../../shared/extCategories'
import { riskOf } from '../../../shared/risk'
import { baseNameOf } from '../../../shared/paths'
import { formatBytes, formatPercent, formatTime } from '../../../shared/format'

/** 导出当前扫描结果的 CSV 报告；返回保存路径（取消/失败返回 null） */
export async function exportReport(): Promise<string | null> {
  const { result } = useScanStore.getState()
  if (!result) {
    toast('info', '先扫描一次，才有内容可以导出')
    return null
  }
  try {
    const insights = computeInsights(result.root)
    const stamp = new Date().toISOString().slice(0, 10)
    const rows: string[][] = []

    // —— 概要 ——
    rows.push(['扫描路径', result.root.path, '', ''])
    rows.push(['总占用', formatBytes(result.root.size), String(result.root.size), '字节'])
    rows.push(['文件总数', String(result.stats.files), '', '个'])
    rows.push(['目录总数', String(result.stats.dirs), '', '个'])
    rows.push(['扫描耗时', String(result.durationMs), '', '毫秒'])
    rows.push(['跳过路径', String(result.skippedCount), '', '个（无权限或已删除）'])
    rows.push(['排除目录', String(result.excluded), '', '个（命中排除清单）'])
    rows.push(['', '', '', ''])

    // —— 类型构成 ——
    rows.push(['类型构成', '大小', '文件数', '占比%'])
    for (const category of insights.categories) {
      const meta = CATEGORY_META[category.category]
      rows.push([
        meta?.label ?? category.category,
        formatBytes(category.size),
        String(category.count),
        formatPercent(category.size, insights.totalSize)
      ])
    }
    rows.push(['', '', '', ''])

    // —— 大文件清单（Top 300）——
    rows.push(['大文件清单', '大小', '占全盘%', '修改时间', '风险', '文件类型', '路径'])
    for (const file of insights.largestFiles) {
      const risk = riskOf(file)
      rows.push([
        baseNameOf(file.path),
        formatBytes(file.size),
        formatPercent(file.size, insights.totalSize),
        formatTime(file.mtime),
        `${risk.icon} ${risk.label}`,
        extInfo(file.name).label,
        file.path
      ])
    }

    const savedPath = await window.api.exportReport({
      fileName: `DiskLens-${baseNameOf(result.root.path) || '扫描'}-${stamp}`,
      header: ['DiskLens 扫描报告', '大小', '数值', '备注'],
      rows
    })
    if (savedPath) toast('ok', `报告已导出：${savedPath}`)
    return savedPath
  } catch (error) {
    toast('err', friendlyError('导出报告', error))
    return null
  }
}
