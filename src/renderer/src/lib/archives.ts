// 压缩包统计：从扫描树里挑出 zip/rar/7z/iso 等，按大小排序
// 只读元数据；ZIP 内容查看走主进程的中央目录解析

import type { ArchiveInfo, ScanNode } from '../../../shared/types'

/** 认作压缩包/镜像的后缀 */
export const ARCHIVE_EXTS = new Set([
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'zst',
  'cab',
  'iso',
  'jar',
  'apk',
  'whl'
])

/** 类型显示名 */
export const ARCHIVE_LABELS: Record<string, string> = {
  zip: 'ZIP 压缩包',
  rar: 'RAR 压缩包',
  '7z': '7Z 压缩包',
  tar: 'TAR 归档',
  gz: 'GZ 压缩',
  tgz: 'TGZ 压缩包',
  bz2: 'BZ2 压缩',
  xz: 'XZ 压缩',
  zst: 'ZSTD 压缩',
  cab: 'CAB 安装包',
  iso: 'ISO 光盘镜像',
  jar: 'JAR 程序包',
  apk: 'APK 安装包',
  whl: 'Python 包'
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export interface ArchiveStats {
  /** 按大小降序的压缩包（最多 limit 个） */
  archives: ArchiveInfo[]
  /** 命中总数（不受 limit 截断） */
  totalCount: number
  /** 命中总大小 */
  totalSize: number
  /** 各后缀的数量/大小 */
  byExt: { ext: string; count: number; size: number }[]
}

function insertTop(list: ArchiveInfo[], item: ArchiveInfo, limit: number): void {
  if (list.length >= limit && item.size <= list[list.length - 1].size) return
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].size >= item.size) lo = mid + 1
    else hi = mid
  }
  list.splice(lo, 0, item)
  if (list.length > limit) list.pop()
}

/** 遍历一次扫描树，收集压缩包 */
export function collectArchives(root: ScanNode, limit = 2000): ArchiveStats {
  const archives: ArchiveInfo[] = []
  const byExt = new Map<string, { count: number; size: number }>()
  let totalCount = 0
  let totalSize = 0
  const stack: ScanNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'file') {
      const ext = extOf(node.name)
      if (!ARCHIVE_EXTS.has(ext)) continue
      totalCount++
      totalSize += node.size
      const row = byExt.get(ext) ?? { count: 0, size: 0 }
      row.count++
      row.size += node.size
      byExt.set(ext, row)
      insertTop(
        archives,
        {
          path: node.path,
          name: node.name,
          size: node.size,
          mtime: node.mtime,
          ext
        },
        limit
      )
    } else {
      for (const kid of node.children ?? []) stack.push(kid)
    }
  }
  return {
    archives,
    totalCount,
    totalSize,
    byExt: [...byExt.entries()]
      .map(([ext, row]) => ({ ext, ...row }))
      .sort((a, b) => b.size - a.size)
  }
}
