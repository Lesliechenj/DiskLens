import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { basename, join } from 'path'
import type { ScanNode, ScanProgress, ScanResult } from '../shared/types'

/** 扫描选项 */
export interface ScanOptions {
  /** 排除清单：目录名（basename）命中即整棵跳过，防误扫 */
  excludeNames?: string[]
  /** 取消检查：每遍历一个目录/一批文件前问一次，返回 true 立即中止 */
  shouldStop?: () => boolean
}

/** 扫描被用户取消（与真错误区分开，渲染层据此回到"未扫描"状态） */
export class ScanCancelledError extends Error {
  readonly code = 'SCAN_CANCELLED'
  constructor() {
    super('扫描已取消')
    this.name = 'ScanCancelledError'
  }
}

/** 跳过路径样本上限：百万文件级的盘可能跳过成千上万条，全存下来会把 IPC 撑爆 */
export const SKIPPED_SAMPLE_LIMIT = 200

/** 文件 stat 并发批次：一批发多少个，等这批回来再发下一批（防 FD 爆炸） */
const FILE_BATCH_SIZE = 64
/** 目录遍历并发数：同时几个"工人"在挖目录树 */
const DIR_CONCURRENCY = 8

/**
 * 递归扫描目录，产出统一 JSON 树（核心逻辑）。
 *
 * - 无权限/读取失败的目录：跳过并记入 skipped 样本，扫描不中断、不崩溃
 * - 排除清单命中的目录：整棵不遍历，计入 excluded（默认勾选，防误扫）
 * - 进度回调：每个目录遍历完成时触发一次；IPC 节流由调用方（scanner 入口）控制
 * - 符号链接、套接字等特殊文件：不统计，避免重复计算和死循环
 * - 并发策略：文件分批 stat（64/批）+ 目录工人池（8 并发）——
 *   一个文件一个文件排队问硬盘太慢，家用 C 盘实测同架构快 2-4 倍
 * - 每层子节点按大小降序输出：并发下完成顺序不稳定，排序保证结果确定，
 *   而且大的在前，图表/列表都受益
 * - 可取消：shouldStop 返回 true 时抛 ScanCancelledError，由调用方转成"已取消"
 *
 * @param rootPath 要扫描的根目录
 * @param onProgress 进度回调（目录粒度）
 * @param options 排除清单 / 取消检查
 */
export async function scanDirectory(
  rootPath: string,
  onProgress?: (progress: ScanProgress) => void,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const skipped: string[] = []
  let skippedCount = 0
  // 排除清单小写集合，O(1) 匹配
  const excludeSet = new Set((options.excludeNames ?? []).map((n) => n.toLowerCase()))
  const shouldStop = options.shouldStop ?? ((): boolean => false)
  let excluded = 0
  let files = 0
  let dirs = 0
  let bytes = 0
  const progress: ScanProgress = {
    files: 0,
    dirs: 0,
    bytes: 0,
    currentPath: rootPath,
    elapsedMs: 0
  }
  const startedAt = Date.now()

  /** 记录一次跳过（样本有上限，计数不丢） */
  function noteSkipped(path: string): void {
    skippedCount++
    if (skipped.length < SKIPPED_SAMPLE_LIMIT) skipped.push(path)
  }

  /** 递归遍历单个目录，返回其节点（size 为递归累计值） */
  async function walk(dirPath: string): Promise<ScanNode> {
    if (shouldStop()) throw new ScanCancelledError()

    const node: ScanNode = {
      name: basename(dirPath) || dirPath,
      path: dirPath,
      size: 0,
      type: 'dir',
      mtime: 0,
      children: []
    }
    dirs++

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      // 无权限（EACCES/EPERM）或目录损坏：跳过并记录
      noteSkipped(dirPath)
      return node
    }

    const dirEntries: Dirent[] = []
    const fileEntries: Dirent[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) dirEntries.push(entry)
      else if (entry.isFile()) fileEntries.push(entry)
      // 其他类型（符号链接/套接字/块设备等）：不统计，避免重复与死循环
    }

    // ---- 文件：分批并发 stat ----
    for (let i = 0; i < fileEntries.length; i += FILE_BATCH_SIZE) {
      if (shouldStop()) throw new ScanCancelledError()
      const batch = fileEntries.slice(i, i + FILE_BATCH_SIZE)
      await Promise.all(
        batch.map(async (entry) => {
          const fullPath = join(dirPath, entry.name)
          try {
            const stat = await fs.stat(fullPath)
            files++
            bytes += stat.size
            node.size += stat.size
            if (stat.mtimeMs > node.mtime) node.mtime = stat.mtimeMs
            node.children!.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              type: 'file',
              mtime: stat.mtimeMs
            })
          } catch {
            // 单个文件 stat 失败（被占用/权限/刚被删）：记入跳过，继续扫
            noteSkipped(fullPath)
          }
        })
      )
    }

    // ---- 目录：工人池并发遍历 ----
    let nextDir = 0
    const worker = async (): Promise<void> => {
      while (nextDir < dirEntries.length) {
        if (shouldStop()) throw new ScanCancelledError()
        const entry = dirEntries[nextDir++]
        // 排除清单命中：整棵不遍历。根目录本身不参与匹配——用户显式选了它
        if (excludeSet.has(entry.name.toLowerCase())) {
          excluded++
          continue
        }
        const child = await walk(join(dirPath, entry.name))
        node.children!.push(child)
        node.size += child.size
        if (child.mtime > node.mtime) node.mtime = child.mtime
      }
    }
    const workerCount = Math.min(DIR_CONCURRENCY, dirEntries.length)
    if (workerCount > 0) {
      await Promise.all(Array.from({ length: workerCount }, worker))
    }

    // 并发下完成顺序不稳定：按大小降序，结果确定 + 大的在前
    node.children!.sort((a, b) => b.size - a.size)

    progress.files = files
    progress.dirs = dirs
    progress.bytes = bytes
    progress.currentPath = dirPath
    progress.elapsedMs = Date.now() - startedAt
    onProgress?.(progress)
    return node
  }

  const root = await walk(rootPath)
  return {
    root,
    roots: [rootPath],
    multi: false,
    skipped,
    skippedCount,
    excluded,
    durationMs: Date.now() - startedAt,
    stats: { files, dirs }
  }
}

/**
 * 一次扫多个根路径（比如 C: / D: / E:）。
 *
 * 单路径时保持和原来完全一样（root 就是那个目录）；
 * 多路径时造一个虚拟根「全部磁盘」，每个盘是它的直接子节点——
 * 面积图/目录树/查重等所有视图都不用改，天然支持多盘。
 */
export async function scanPaths(
  rootPaths: string[],
  onProgress?: (progress: ScanProgress) => void,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const roots = [...new Set(rootPaths.map((path) => path.trim()).filter(Boolean))]
  if (roots.length === 0) throw new Error('没有要扫描的路径')
  if (roots.length === 1) return scanDirectory(roots[0], onProgress, options)

  const startedAt = Date.now()
  const children: ScanNode[] = []
  let files = 0
  let dirs = 0
  let bytes = 0
  let skippedCount = 0
  let excluded = 0
  const skipped: string[] = []

  for (const rootPath of roots) {
    if (options.shouldStop?.()) throw new ScanCancelledError()
    const result = await scanDirectory(
      rootPath,
      (progress) => {
        onProgress?.({
          files: files + progress.files,
          dirs: dirs + progress.dirs,
          bytes: bytes + progress.bytes,
          currentPath: progress.currentPath,
          elapsedMs: Date.now() - startedAt
        })
      },
      options
    )
    children.push(result.root)
    files += result.stats.files
    dirs += result.stats.dirs
    bytes += result.root.size
    skippedCount += result.skippedCount
    excluded += result.excluded
    for (const item of result.skipped) {
      if (skipped.length >= SKIPPED_SAMPLE_LIMIT) break
      skipped.push(item)
    }
  }

  const totalSize = children.reduce((sum, child) => sum + child.size, 0)
  const root: ScanNode = {
    name: '全部磁盘',
    // 虚拟根没有真实路径：所有"删除/打开"操作只会在真实子节点上发起
    path: '',
    size: totalSize,
    type: 'dir',
    mtime: children.reduce((max, child) => Math.max(max, child.mtime), 0),
    children
  }

  return {
    root,
    roots,
    multi: true,
    skipped,
    skippedCount,
    excluded,
    durationMs: Date.now() - startedAt,
    stats: { files, dirs }
  }
}
