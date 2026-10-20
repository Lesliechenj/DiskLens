// 回收站读取 / 还原 / 清空（Windows $Recycle.Bin 的 $I 元数据解析）
// $I 文件记录"原始路径 + 删除时间 + 大小"，$R 文件才是真正的内容
// 这里只读元数据，不动文件；还原 = 把 $R 搬回去 + 删掉 $I

import { promises as fs } from 'fs'
import { basename, dirname, join } from 'path'
import { execFile } from 'child_process'
import type { TrashEntry, TrashListing } from '../shared/types'

/** 1601-01-01 到 1970-01-01 的毫秒差（FILETIME → Unix 毫秒） */
const FILETIME_EPOCH_DIFF = 11644473600000n
/**
 * 一次最多列多少条。
 * 不能太小：一次批量清理就可能产生上万条 $I，清完再"彻底释放"时
 * 如果只读到前 5000 条，剩下的会一直躺在回收站里（v2.3 实测踩到）。
 */
const MAX_ENTRIES = 50_000

/** FILETIME（100ns 单位）→ Unix 毫秒 */
function filetimeToMs(filetime: bigint): number {
  return Number(filetime / 10000n - FILETIME_EPOCH_DIFF)
}

/**
 * 解析 $I 文件（纯函数，可单测）：
 *   0..7   版本（1 = 老格式，2 = 长路径格式）
 *   8..15  原始大小
 *   16..23 删除时间（FILETIME）
 *   v1: 24.. 固定 520 字节 UTF-16 路径
 *   v2: 24..27 字符数（不含 \0），28.. 变长 UTF-16 路径
 */
export function parseTrashInfo(
  buf: Buffer
): { originalPath: string; size: number; deletedAt: number } | null {
  if (buf.length < 24) return null
  let version: bigint
  try {
    version = buf.readBigUInt64LE(0)
  } catch {
    return null
  }
  const size = Number(buf.readBigUInt64LE(8))
  const deletedAt = filetimeToMs(buf.readBigUInt64LE(16))

  const rawPath =
    version === 1n
      ? buf.subarray(24, Math.min(buf.length, 24 + 520)).toString('utf16le')
      : version === 2n
        ? buf.length < 28
          ? null
          : buf
              .subarray(28, Math.min(buf.length, 28 + buf.readUInt32LE(24) * 2))
              .toString('utf16le')
        : null
  if (rawPath === null) return null

  // 去掉 UTF-16 里的 \0 尾巴
  const originalPath = rawPath
    .replace(/\0[\s\S]*$/, '')
    .replace(/\0/g, '')
    .trim()
  if (!originalPath) return null
  return { originalPath, size, deletedAt }
}

/** 列出某个分区回收站里的内容（读不了就记错误，不中断） */
async function listDriveBin(drive: string, errors: string[]): Promise<TrashEntry[]> {
  const binRoot = join(drive, '$Recycle.Bin')
  const entries: TrashEntry[] = []

  let sids: string[]
  try {
    sids = await fs.readdir(binRoot)
  } catch {
    // 没权限/没有回收站目录：跳过这个分区
    return entries
  }

  for (const sid of sids) {
    const sidDir = join(binRoot, sid)
    let names: string[]
    try {
      names = await fs.readdir(sidDir)
    } catch {
      errors.push(`${sidDir}（无权限）`)
      continue
    }

    for (const name of names) {
      if (!name.startsWith('$I')) continue
      const key = name.slice(2)
      const infoPath = join(sidDir, name)
      const contentPath = join(sidDir, `$R${key}`)

      let info: { originalPath: string; size: number; deletedAt: number } | null
      try {
        info = parseTrashInfo(await fs.readFile(infoPath))
      } catch {
        // $I 读不了：跳过这一条
        continue
      }
      if (!info) continue

      // 内容文件（$R…）还在不在？在的话顺便拿真实大小与类型
      const stat = await fs.lstat(contentPath).catch(() => null)
      const exists = stat !== null
      const isFolder = stat?.isDirectory() ?? false
      // 目录的 stat.size 不准，用 $I 里记录的大小
      const actualSize = isFolder ? 0 : (stat?.size ?? 0)

      entries.push({
        id: `${drive}|${sid}|${key}`,
        name: basename(info.originalPath),
        originalPath: info.originalPath,
        deletedAt: info.deletedAt,
        size: actualSize > 0 ? actualSize : info.size,
        contentPath,
        infoPath,
        drive,
        exists,
        isFolder
      })
      if (entries.length >= MAX_ENTRIES) return entries
    }
  }
  return entries
}

/** 列出所有分区回收站里的内容（按删除时间倒序） */
export async function listTrash(driveRoots: string[]): Promise<TrashListing> {
  const errors: string[] = []
  const all: TrashEntry[] = []
  for (const drive of driveRoots) {
    const entries = await listDriveBin(drive, errors)
    all.push(...entries)
    if (all.length >= MAX_ENTRIES) break
  }
  all.sort((a, b) => b.deletedAt - a.deletedAt)
  const entries = all.slice(0, MAX_ENTRIES)
  return {
    entries,
    totalSize: entries.reduce((sum, entry) => sum + (entry.exists ? entry.size : 0), 0),
    totalCount: entries.length,
    scannedDrives: driveRoots,
    errors,
    blocked: errors.length > 0 ? true : false
  }
}

export interface RestoreOutcome {
  id: string
  ok: boolean
  message?: string
}

/**
 * 还原：把 $R 搬回原始路径，再删掉 $I。
 * 原位置已有同名文件就不动（绝不覆盖用户的东西）。
 * 入参来自渲染层，所以先校验"这确实是一条指向回收站里 $R/$I 的记录"，
 * 免得渲染层被攻破时能把任意文件搬来搬去。
 */
export async function restoreTrash(entries: TrashEntry[]): Promise<RestoreOutcome[]> {
  const outcomes: RestoreOutcome[] = []
  const isTrusted = (entry: TrashEntry): boolean => {
    const inBin = (path: string): boolean => path.toLowerCase().includes('$recycle.bin')
    const base = (path: string): string => path.slice(path.lastIndexOf('\\') + 1).toUpperCase()
    return (
      typeof entry.contentPath === 'string' &&
      typeof entry.infoPath === 'string' &&
      typeof entry.originalPath === 'string' &&
      entry.originalPath.trim() !== '' &&
      inBin(entry.contentPath) &&
      inBin(entry.infoPath) &&
      base(entry.contentPath).startsWith('$R') &&
      base(entry.infoPath).startsWith('$I')
    )
  }

  for (const entry of entries) {
    if (!isTrusted(entry)) {
      outcomes.push({
        id: entry.id,
        ok: false,
        message: '这条记录的路径不像回收站里的文件，已跳过'
      })
      continue
    }
    try {
      const stat = await fs.lstat(entry.contentPath).catch(() => null)
      if (!stat) {
        outcomes.push({ id: entry.id, ok: false, message: '回收站里这个文件已经不在了' })
        continue
      }
      const existing = await fs.lstat(entry.originalPath).catch(() => null)
      if (existing) {
        outcomes.push({ id: entry.id, ok: false, message: '原位置已经有同名文件，没有覆盖' })
        continue
      }
      await fs.mkdir(dirname(entry.originalPath), { recursive: true })
      await fs.rename(entry.contentPath, entry.originalPath)
      await fs.unlink(entry.infoPath).catch(() => undefined)
      outcomes.push({ id: entry.id, ok: true })
    } catch (error) {
      outcomes.push({
        id: entry.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return outcomes
}

/** 清空系统回收站（不可恢复，调用方必须二次确认） */
export async function emptyTrash(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Clear-RecycleBin -Force -ErrorAction Stop'],
      { timeout: 120_000, windowsHide: true },
      (error) => (error ? reject(error) : resolve())
    )
  })
}

/** 打开资源管理器的回收站窗口 */
export async function openTrashFolder(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // explorer 对 shell: 协议总是返回非 0，别把退出码当失败
    execFile('explorer.exe', ['shell:RecycleBinFolder'], { windowsHide: true }, (error) => {
      if (error && error.killed) reject(error)
      else resolve()
    })
  })
}
