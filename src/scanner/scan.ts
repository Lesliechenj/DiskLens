import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { basename, join } from 'path'
import type { ScanNode, ScanProgress, ScanResult } from '../shared/types'

/** 扫描选项 */
export interface ScanOptions {
  /** 排除清单：目录名（basename）命中即整棵跳过，防误扫（F6） */
  excludeNames?: string[]
}

/** 文件 stat 并发批次：一批发多少个，等这批回来再发下一批（防 FD 爆炸） */
const FILE_BATCH_SIZE = 64
/** 目录遍历并发数：同时几个"工人"在挖目录树 */
const DIR_CONCURRENCY = 8

/**
 * 递归扫描目录，产出统一 JSON 树（W2 核心逻辑）。
 *
 * - 无权限/读取失败的目录：跳过并记入 skipped 列表，扫描不中断、不崩溃
 * - 排除清单命中的目录：整棵不遍历，计入 excluded（默认勾选，防误扫）
 * - 进度回调：每个目录遍历完成时触发一次；IPC 节流由调用方（scanner 入口）控制
 * - 符号链接、套接字等特殊文件：V1 不统计，避免重复计算和死循环
 * - 并发策略：文件分批 stat（64/批）+ 目录工人池（8 并发）——
 *   一个文件一个文件排队问硬盘太慢，家用 C 盘实测同架构快 2-4 倍
 * - 每层子节点按大小降序输出：并发下完成顺序不稳定，排序保证结果确定，
 *   而且大的在前，图表/列表都受益
 *
 * @param rootPath 要扫描的根目录
 * @param onProgress 进度回调（目录粒度）
 * @param options 排除清单等选项
 */
export async function scanDirectory(
  rootPath: string,
  onProgress?: (progress: ScanProgress) => void,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const skipped: string[] = []
  // 排除清单小写集合，O(1) 匹配
  const excludeSet = new Set((options.excludeNames ?? []).map((n) => n.toLowerCase()))
  let excluded = 0
  const progress: ScanProgress = { files: 0, dirs: 0, bytes: 0, currentPath: rootPath }
  const startedAt = Date.now()

  /** 递归遍历单个目录，返回其节点（size 为递归累计值） */
  async function walk(dirPath: string): Promise<ScanNode> {
    const node: ScanNode = {
      name: basename(dirPath) || dirPath,
      path: dirPath,
      size: 0,
      type: 'dir',
      mtime: 0,
      children: []
    }

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      // 无权限（EACCES/EPERM）或目录损坏：跳过并记录
      skipped.push(dirPath)
      return node
    }

    const dirEntries: Dirent[] = []
    const fileEntries: Dirent[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) dirEntries.push(entry)
      else if (entry.isFile()) fileEntries.push(entry)
      // 其他类型（符号链接/套接字/块设备等）：V1 跳过不计
    }

    // ---- 文件：分批并发 stat ----
    for (let i = 0; i < fileEntries.length; i += FILE_BATCH_SIZE) {
      const batch = fileEntries.slice(i, i + FILE_BATCH_SIZE)
      await Promise.all(
        batch.map(async (entry) => {
          const fullPath = join(dirPath, entry.name)
          try {
            const stat = await fs.stat(fullPath)
            progress.files++
            progress.bytes += stat.size
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
            // 单个文件 stat 失败（如被占用/权限）：记入跳过列表，继续扫
            skipped.push(fullPath)
          }
        })
      )
    }

    // ---- 目录：工人池并发遍历 ----
    let nextDir = 0
    const worker = async (): Promise<void> => {
      while (nextDir < dirEntries.length) {
        const entry = dirEntries[nextDir++]
        // 排除清单命中：整棵不遍历（F6）。根目录本身不参与匹配——用户显式选了它
        if (excludeSet.has(entry.name.toLowerCase())) {
          excluded++
          continue
        }
        progress.dirs++
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

    progress.currentPath = dirPath
    onProgress?.(progress)
    return node
  }

  const root = await walk(rootPath)
  return { root, skipped, excluded, durationMs: Date.now() - startedAt }
}
