// 全树派生统计（纯函数）：一次遍历算出所有视图要用的聚合数据
// 一棵树 → 类型构成 / 扩展名排行 / 大文件 / 文件夹排行，全部前端算，不重扫
// 大树上严禁全排序：TopN 用有界插入，内存与耗时都可控

import type { ScanNode } from '../../../shared/types'
import { extOf, extInfo, type ExtCategory } from '../../../shared/extCategories'

/** 扩展名聚合行 */
export interface ExtStat {
  /** 小写扩展名（不含点）；'' = 无扩展名 */
  ext: string
  /** 人话标签 */
  label: string
  category: ExtCategory
  size: number
  count: number
}

/** 大类聚合行 */
export interface CategoryStat {
  category: ExtCategory
  size: number
  count: number
}

/** 文件夹聚合行（带直接文件数，方便判断"是不是一坨小文件"） */
export interface DirStat {
  node: ScanNode
  /** 直接子文件数 */
  fileCount: number
  /** 直接子目录数 */
  dirCount: number
}

export interface Insights {
  totalSize: number
  totalFiles: number
  totalDirs: number
  categories: CategoryStat[]
  exts: ExtStat[]
  largestFiles: ScanNode[]
  largestDirs: DirStat[]
  /** 树最深几层（UI 显示"层级"用） */
  depth: number
}

/** 大文件/大文件夹榜单取多少个 */
const TOP_FILES = 300
const TOP_DIRS = 500
/** 扩展名种类上限（再多也是一条尾巴，合并成"其他"） */
const TOP_EXTS = 400

/** 有界插入：保持数组按 size 降序，只留 limit 个 */
function insertTop<T>(list: T[], item: T, limit: number, sizeOf: (t: T) => number): void {
  if (limit <= 0) return
  const size = sizeOf(item)
  if (list.length >= limit && size <= sizeOf(list[list.length - 1])) return
  // 二分找插入位置（榜单较短，从尾部线性找也够快，但二分更稳）
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sizeOf(list[mid]) >= size) lo = mid + 1
    else hi = mid
  }
  list.splice(lo, 0, item)
  if (list.length > limit) list.pop()
}

/**
 * 一次遍历算全部统计。
 * 迭代遍历（显式栈）——百万文件的深目录树递归会爆栈。
 */
export function computeInsights(root: ScanNode): Insights {
  const byExt = new Map<string, ExtStat>()
  const byCategory = new Map<ExtCategory, CategoryStat>()
  const largestFiles: ScanNode[] = []
  const largestDirs: DirStat[] = []

  let totalFiles = 0
  let totalDirs = 0
  let depth = 0

  const stack: { node: ScanNode; depth: number }[] = [{ node: root, depth: 0 }]
  while (stack.length > 0) {
    const { node, depth: level } = stack.pop()!
    if (level > depth) depth = level

    if (node.type === 'file') {
      totalFiles++
      insertTop(largestFiles, node, TOP_FILES, (n) => n.size)

      const ext = extOf(node.name)
      const info = extInfo(node.name)
      const extRow = byExt.get(ext)
      if (extRow) {
        extRow.size += node.size
        extRow.count += 1
      } else {
        byExt.set(ext, {
          ext,
          label: info.label,
          category: info.category,
          size: node.size,
          count: 1
        })
      }
      const catRow = byCategory.get(info.category)
      if (catRow) {
        catRow.size += node.size
        catRow.count += 1
      } else {
        byCategory.set(info.category, { category: info.category, size: node.size, count: 1 })
      }
    } else {
      totalDirs++
      if (node !== root) {
        const kids = node.children ?? []
        let fileCount = 0
        let dirCount = 0
        for (const kid of kids) {
          if (kid.type === 'file') fileCount++
          else dirCount++
        }
        insertTop(largestDirs, { node, fileCount, dirCount }, TOP_DIRS, (d) => d.node.size)
      }
      for (const kid of node.children ?? []) stack.push({ node: kid, depth: level + 1 })
    }
  }

  const exts = [...byExt.values()].sort((a, b) => b.size - a.size).slice(0, TOP_EXTS)
  const categories = [...byCategory.values()].sort((a, b) => b.size - a.size)

  return {
    totalSize: root.size,
    totalFiles,
    totalDirs,
    categories,
    exts,
    largestFiles,
    largestDirs,
    depth
  }
}

/** 按路径查节点 + 祖先链（面包屑跳转/搜索命中定位用） */
export function findNodeByPath(
  root: ScanNode,
  path: string
): { node: ScanNode; ancestors: ScanNode[] } | null {
  const stack: { node: ScanNode; ancestors: ScanNode[] }[] = [{ node: root, ancestors: [] }]
  while (stack.length > 0) {
    const item = stack.pop()!
    if (item.node.path === path) return item
    if (item.node.children) {
      const next = [...item.ancestors, item.node]
      for (const kid of item.node.children) stack.push({ node: kid, ancestors: next })
    }
  }
  return null
}

/** 统计某目录下的文件/目录个数（详情面板用；带数量上限防百万文件卡死） */
export function countChildren(node: ScanNode, limit = 200_000): { files: number; dirs: number } {
  if (node.type === 'file') return { files: 1, dirs: 0 }
  let files = 0
  let dirs = 0
  const stack: ScanNode[] = [...(node.children ?? [])]
  while (stack.length > 0 && files + dirs < limit) {
    const item = stack.pop()!
    if (item.type === 'file') files++
    else {
      dirs++
      for (const kid of item.children ?? []) stack.push(kid)
    }
  }
  return { files, dirs }
}
