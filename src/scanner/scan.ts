import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { basename, join } from 'path'
import type { ScanNode, ScanProgress, ScanResult } from '../shared/types'

/**
 * 递归扫描目录，产出统一 JSON 树（W2 核心逻辑）。
 *
 * - 无权限/读取失败的目录：跳过并记入 skipped 列表，扫描不中断、不崩溃
 * - 进度回调：每个目录遍历完成时触发一次；IPC 节流由调用方（scanner 入口）控制
 * - 符号链接、套接字等特殊文件：V1 不统计，避免重复计算和死循环
 *
 * @param rootPath 要扫描的根目录
 * @param onProgress 进度回调（目录粒度）
 */
export async function scanDirectory(
  rootPath: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanResult> {
  const skipped: string[] = []
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

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          progress.dirs++
          const child = await walk(fullPath)
          node.children!.push(child)
          node.size += child.size
          if (child.mtime > node.mtime) node.mtime = child.mtime
        } else if (entry.isFile()) {
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
        }
        // 其他类型（符号链接/套接字/块设备等）：V1 跳过不计
      } catch {
        // 单个文件 stat 失败（如被占用/权限）：记入跳过列表，继续扫
        skipped.push(fullPath)
      }
    }

    progress.currentPath = dirPath
    onProgress?.(progress)
    return node
  }

  const root = await walk(rootPath)
  return { root, skipped, durationMs: Date.now() - startedAt }
}
