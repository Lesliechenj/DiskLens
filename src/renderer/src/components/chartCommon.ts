// DiskLens 图表共享数据层：Treemap 与饼图同源
// 一份 ScanNode 树 → 两种渲染；筛选全部在前端完成，不重扫

import type { ScanNode } from '../../../shared/types'

/** 同层直接子节点超过此数时，最小的合并为"其他"，防止图碎成渣 */
export const MAX_CHILDREN = 200

/** 图表渲染数据（挂原始节点引用用于点击下钻） */
export interface ChartDatum {
  name: string
  value: number
  path: string
  mtime: number
  type: 'file' | 'dir' | 'other'
  /** 原始节点引用（"其他"合并块没有） */
  node?: ScanNode
}

/** 当前层筛选条件：类型 + 扩展名（均可为空 = 不筛） */
export interface LevelFilter {
  /** 展示哪些类型的直接子节点；undefined = 全部 */
  types?: ('dir' | 'file')[]
  /** 仅看某扩展名（小写，不含点）；undefined/null = 不限 */
  ext?: string | null
}

// 配色（深色背景）：目录蓝系 / 文件橙系，块越大颜色越亮；"其他"灰色
export const DIR_COLORS = ['#1e3a6e', '#2b4f9e', '#3b6fd4', '#5a8ae8']
export const FILE_COLORS = ['#7a5230', '#a06a3a', '#c88a4a', '#e0a458']
export const OTHER_COLOR = '#5a5f6a'

export function pickColor(type: ChartDatum['type'], ratio: number): string {
  if (type === 'other') return OTHER_COLOR
  const palette = type === 'dir' ? DIR_COLORS : FILE_COLORS
  // ratio ∈ [0,1]，越大越亮
  const index = Math.min(palette.length - 1, Math.floor(ratio * palette.length))
  return palette[index]
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 取小写扩展名（不含点）；无扩展名/点开头的隐藏文件返回 '' */
export function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return '' // 无点 / ".gitignore" 这类点开头
  return name.slice(dot + 1).toLowerCase()
}

/** 把某一层的直接子节点转成图表数据（只转当前层，不带下层） */
export function buildLevelData(node: ScanNode, filter: LevelFilter = {}): ChartDatum[] {
  const { types, ext } = filter
  let kids = node.children ?? []
  // 0 字节文件/空目录不占面积，过滤掉（否则图里是隐形块）
  kids = kids.filter((c) => c.size > 0)
  if (types && types.length < 2) {
    kids = kids.filter((c) => types.includes(c.type))
  }
  if (ext) {
    // 扩展名筛选只可能命中文件；目录整体隐藏（ hint 会说明）
    kids = kids.filter((c) => c.type === 'file' && extOf(c.name) === ext)
  }

  if (kids.length <= MAX_CHILDREN) {
    return kids.map(toDatum)
  }

  // 超出上限：保留最大的 MAX_CHILDREN - 1 个，其余合并为"其他"
  const sorted = [...kids].sort((a, b) => b.size - a.size)
  const kept = sorted.slice(0, MAX_CHILDREN - 1)
  const rest = sorted.slice(MAX_CHILDREN - 1)
  const data = kept.map(toDatum)
  data.push({
    name: `其他 ${rest.length} 个小文件`,
    value: rest.reduce((s, c) => s + c.size, 0),
    path: node.path,
    mtime: 0,
    type: 'other'
  })
  return data
}

function toDatum(c: ScanNode): ChartDatum {
  return { name: c.name, value: c.size, path: c.path, mtime: c.mtime, type: c.type, node: c }
}

/** 按最大值算 ratio（用于同层内按大小分档配色） */
export function sizeRatio(d: ChartDatum, maxSize: number): number {
  return maxSize > 0 ? d.value / maxSize : 0
}
