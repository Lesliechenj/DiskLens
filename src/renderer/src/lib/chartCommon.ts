// 图表共享数据层：面积图 / 旭日图 / 类型构成同源
// 一份 ScanNode 树 → 多种渲染；筛选全部在前端完成，不重扫
// 配色按"文件大类"走：视频紫、图片蓝、音频粉……目录取子树里占地最大的那一类

import type { ScanNode, NodeType } from '../../../shared/types'
import { CATEGORY_META, extInfo, extOf, type ExtCategory } from '../../../shared/extCategories'

/** 同层直接子节点超过此数时，最小的合并为"其他"，防止图碎成渣 */
export const MAX_CHILDREN = 220

/** 图表渲染数据（挂原始节点引用用于点击下钻） */
export interface ChartDatum {
  name: string
  value: number
  path: string
  mtime: number
  type: 'file' | 'dir' | 'other'
  /** 原始节点引用（"其他"合并块没有） */
  node?: ScanNode
  /** 语义分类（决定配色；"其他"合并块为 other） */
  category: ExtCategory
  /** 目录直接子项数（tooltip 用） */
  childCount?: number
}

/** 当前层筛选条件（均可为空 = 不筛） */
export interface LevelFilter {
  /** 展示哪些类型的直接子节点；undefined = 全部 */
  types?: NodeType[]
  /** 仅看某大类（视频/图片/…）；null/undefined = 不限 */
  category?: ExtCategory | null
  /** 仅看某扩展名（小写，不含点）；null/undefined = 不限 */
  ext?: string | null
  /** 小于此字节数的直接子项不显示（0 = 不过滤） */
  minSize?: number
}

/** "其他"合并块的灰色 */
export const OTHER_COLOR = '#5b6270'

/** 十六进制 → HSL 三元组 */
function hexToHsl(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

/**
 * 按"占本层最大值的比例"给同色系调明度：块越大越亮，一眼看出谁最占地方。
 * ratio ∈ [0,1]
 */
export function shadeByRatio(baseHex: string, ratio: number): string {
  const [h, s] = hexToHsl(baseHex)
  const clamped = Math.min(1, Math.max(0, ratio))
  // 亮度区间 34% → 64%，饱和度小幅提升让色块更精神
  const lightness = 34 + clamped * 30
  const saturation = Math.min(100, s * (0.85 + clamped * 0.2))
  return `hsl(${h.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`
}

/** 分类基色 */
export function categoryColor(category: ExtCategory): string {
  return (CATEGORY_META[category] ?? CATEGORY_META.other).color
}

/**
 * 目录的语义分类：子树里占字节最多的大类（带 WeakMap 缓存，重复下钻不重算）。
 * 文件直接按后缀分类。
 */
const dominantCategoryCache = new WeakMap<ScanNode, ExtCategory>()

/**
 * 预计算整棵树的"代表大类"：一次后序遍历，把子目录的分类合计并给父目录。
 * 为什么需要：面积图第一眼就要按大类上色，如果每个目录各扫一遍子树，
 * 百万文件的盘会变成 O(n·层数)；自底向上合并只有 O(n)。
 */
export function primeCategoryCache(root: ScanNode): void {
  if (dominantCategoryCache.has(root)) return
  const stack: { node: ScanNode; visited: boolean }[] = [{ node: root, visited: false }]
  const totals = new Map<ScanNode, Map<ExtCategory, number>>()

  while (stack.length > 0) {
    const item = stack.pop()!
    if (!item.visited) {
      stack.push({ node: item.node, visited: true })
      for (const kid of item.node.children ?? []) stack.push({ node: kid, visited: false })
      continue
    }
    const node = item.node
    const merged = new Map<ExtCategory, number>()
    if (node.type === 'file') {
      const category = extInfo(node.name).category
      merged.set(category, node.size)
    } else {
      for (const kid of node.children ?? []) {
        const childTotals = totals.get(kid)
        if (!childTotals) continue
        for (const [category, size] of childTotals) {
          merged.set(category, (merged.get(category) ?? 0) + size)
        }
        totals.delete(kid)
      }
    }
    let best: ExtCategory = 'other'
    let bestSize = -1
    for (const [category, size] of merged) {
      if (size > bestSize) {
        best = category
        bestSize = size
      }
    }
    dominantCategoryCache.set(node, best)
    totals.set(node, merged)
  }
}

export function categoryOfNode(node: ScanNode): ExtCategory {
  if (node.type === 'file') return extInfo(node.name).category
  const cached = dominantCategoryCache.get(node)
  if (cached) return cached

  const totals = new Map<ExtCategory, number>()
  const stack: ScanNode[] = [...(node.children ?? [])]
  while (stack.length > 0) {
    const item = stack.pop()!
    if (item.type === 'file') {
      const category = extInfo(item.name).category
      totals.set(category, (totals.get(category) ?? 0) + item.size)
    } else {
      for (const kid of item.children ?? []) stack.push(kid)
    }
  }
  let best: ExtCategory = 'other'
  let bestSize = -1
  for (const [category, size] of totals) {
    if (size > bestSize) {
      best = category
      bestSize = size
    }
  }
  dominantCategoryCache.set(node, best)
  return best
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 把某一层的直接子节点转成图表数据（只转当前层，不带下层） */
export function buildLevelData(node: ScanNode, filter: LevelFilter = {}): ChartDatum[] {
  const { types, category, ext, minSize = 0 } = filter
  let kids = node.children ?? []
  // 0 字节文件/空目录不占面积，过滤掉（否则图里全是隐形块）
  kids = kids.filter((c) => c.size > 0)
  if (minSize > 0) kids = kids.filter((c) => c.size >= minSize)
  if (types && types.length < 2) {
    kids = kids.filter((c) => types.includes(c.type))
  }
  if (ext) {
    // 扩展名筛选只可能命中文件；目录整体隐藏（提示行会说明）
    kids = kids.filter((c) => c.type === 'file' && extOf(c.name) === ext)
  } else if (category) {
    kids = kids.filter((c) => categoryOfNode(c) === category)
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
    name: `其他 ${rest.length} 项小内容`,
    value: rest.reduce((s, c) => s + c.size, 0),
    path: node.path,
    mtime: 0,
    type: 'other',
    category: 'other'
  })
  return data
}

function toDatum(c: ScanNode): ChartDatum {
  return {
    name: c.name,
    value: c.size,
    path: c.path,
    mtime: c.mtime,
    type: c.type,
    node: c,
    category: categoryOfNode(c),
    childCount: c.children?.length ?? 0
  }
}

/** 按最大值算 ratio（用于同层内按大小分档配色） */
export function sizeRatio(d: ChartDatum, maxSize: number): number {
  return maxSize > 0 ? d.value / maxSize : 0
}

/** 图例里要展示的大类（过滤掉当前层没有的） */
export function presentCategories(data: ChartDatum[]): ExtCategory[] {
  const seen = new Set<ExtCategory>()
  for (const d of data) if (d.type !== 'other') seen.add(d.category)
  return [...seen]
}

/** 图表文字色（深色底用浅字，浅色底用深字） */
export function pickTextColor(dark: boolean): string {
  return dark ? 'rgba(240, 244, 252, 0.92)' : 'rgba(24, 32, 48, 0.9)'
}

/** tooltip 配色（跟主题走，避免浅色主题下黑乎乎一块） */
export function pickTooltipTheme(dark: boolean): {
  backgroundColor: string
  borderColor: string
  textStyle: { color: string; fontSize: number; lineHeight?: number }
  extraCssText?: string
} {
  return {
    backgroundColor: dark ? 'rgba(18, 22, 30, 0.96)' : 'rgba(255, 255, 255, 0.98)',
    borderColor: dark ? 'rgba(120, 140, 180, 0.45)' : 'rgba(140, 155, 180, 0.5)',
    textStyle: {
      color: dark ? 'rgba(232, 238, 250, 0.9)' : 'rgba(22, 30, 44, 0.92)',
      fontSize: 12,
      lineHeight: 20
    },
    extraCssText:
      'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.28);padding:10px 12px;max-width:420px;white-space:normal;'
  }
}
