// 文件年龄分析：按"最后修改时间"给全树分桶，并挑出"又大又旧"的文件
// 回答小白另一个高频问题："这些东西我是不是早就不用了？"
// 纯函数，一次遍历；桶内 TopN 用有界插入，百万文件也不会全排序

import type { ScanNode } from '../../../shared/types'

const DAY = 24 * 60 * 60 * 1000

/** 年龄分桶（天数区间左闭右开） */
export interface AgeBucketDef {
  key: string
  label: string
  /** 超过多少天（含） */
  minDays: number
  /** 小于多少天（不含）；Infinity = 没有上限 */
  maxDays: number
  /** 一句话解释 */
  hint: string
}

export const AGE_BUCKETS: AgeBucketDef[] = [
  { key: 'week', label: '7 天内', minDays: 0, maxDays: 7, hint: '最近一周动过' },
  { key: 'month', label: '1 个月内', minDays: 7, maxDays: 30, hint: '最近一个月动过' },
  { key: 'quarter', label: '1–3 个月', minDays: 30, maxDays: 90, hint: '几个月没动了' },
  { key: 'half', label: '3–6 个月', minDays: 90, maxDays: 180, hint: '半年内动过' },
  { key: 'year', label: '6–12 个月', minDays: 180, maxDays: 365, hint: '快一年没动了' },
  { key: 'three', label: '1–3 年', minDays: 365, maxDays: 365 * 3, hint: '很久没动了' },
  { key: 'older', label: '3 年以上', minDays: 365 * 3, maxDays: Infinity, hint: '大概率是旧资料' }
]

/** 每个桶里保留多少个"最大的文件"给 UI 展示/筛选 */
const BUCKET_FILE_LIMIT = 80
/** 每个"旧文件阈值"保留多少个最大文件 */
const OLD_FILE_LIMIT = 300

/** 可选"旧文件"阈值（年） */
export const OLD_THRESHOLDS = [1, 2, 3, 5] as const
export type OldThreshold = (typeof OLD_THRESHOLDS)[number]

export interface AgeBucket extends AgeBucketDef {
  /** 该桶总大小 */
  size: number
  /** 该桶文件数 */
  count: number
  /** 该桶里最大的若干个文件（按大小降序） */
  files: ScanNode[]
}

export interface OldFileStat {
  /** 超过阈值（年）的文件总数 */
  count: number
  /** 超过阈值的总大小 */
  size: number
  /** 其中最大的若干个（按大小降序，最多 OLD_FILE_LIMIT 个） */
  files: ScanNode[]
}

export interface AgeStats {
  /** 全树合计（和扫描结果一致） */
  totalSize: number
  totalFiles: number
  /** 各年龄桶（顺序固定） */
  buckets: AgeBucket[]
  /** 1/2/3/5 年以上的统计 */
  old: Record<OldThreshold, OldFileStat>
  /** 统计基准时间（毫秒） */
  now: number
}

/** 有界插入：保持按 size 降序，只留 limit 个 */
function insertTop(list: ScanNode[], node: ScanNode, limit: number): void {
  if (limit <= 0) return
  if (list.length >= limit && node.size <= list[list.length - 1].size) return
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].size >= node.size) lo = mid + 1
    else hi = mid
  }
  list.splice(lo, 0, node)
  if (list.length > limit) list.pop()
}

/** 年龄（天）；mtime 缺失按"很旧"处理 */
export function ageDaysOf(mtime: number, now = Date.now()): number {
  if (!mtime) return Number.POSITIVE_INFINITY
  return Math.max(0, (now - mtime) / DAY)
}

/** 人话年龄：3 年 2 个月 / 18 天 / 今天 */
export function formatAge(mtime: number, now = Date.now()): string {
  if (!mtime) return '未知'
  const days = ageDaysOf(mtime, now)
  if (days < 1) return '今天'
  if (days < 30) return `${Math.floor(days)} 天`
  if (days < 365) return `${Math.floor(days / 30)} 个月`
  const years = Math.floor(days / 365)
  const months = Math.floor((days - years * 365) / 30)
  return months > 0 ? `${years} 年 ${months} 个月` : `${years} 年`
}

/** 一次遍历算出年龄分布 + 旧文件榜 */
export function computeAgeStats(root: ScanNode, now = Date.now()): AgeStats {
  const buckets: AgeBucket[] = AGE_BUCKETS.map((def) => ({
    ...def,
    size: 0,
    count: 0,
    files: []
  }))
  const old = Object.fromEntries(
    OLD_THRESHOLDS.map((year) => [year, { count: 0, size: 0, files: [] as ScanNode[] }])
  ) as Record<OldThreshold, OldFileStat>

  let totalSize = 0
  let totalFiles = 0
  const stack: ScanNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'file') {
      totalFiles++
      totalSize += node.size
      const days = ageDaysOf(node.mtime, now)

      let bucket = buckets[buckets.length - 1]
      for (const candidate of buckets) {
        if (days < candidate.maxDays) {
          bucket = candidate
          break
        }
      }
      bucket.size += node.size
      bucket.count++
      insertTop(bucket.files, node, BUCKET_FILE_LIMIT)

      for (const year of OLD_THRESHOLDS) {
        if (days < year * 365) continue
        old[year].count++
        old[year].size += node.size
        insertTop(old[year].files, node, OLD_FILE_LIMIT)
      }
    } else {
      for (const kid of node.children ?? []) stack.push(kid)
    }
  }

  return { totalSize, totalFiles, buckets, old, now }
}
