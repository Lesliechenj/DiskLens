// 清理执行器：普通权限 / 一次管理员授权二选一，然后生成报告
//
// 为什么放在主进程：删除、UAC、磁盘容量、写 HTML 报告都需要系统权限；
// 渲染层只负责“选了什么、确认了没有”。

import { promises as fs } from 'fs'
import type {
  AppSettings,
  CleanupExecuteRequest,
  CleanupExecuteResult,
  CleanupOutcome,
  CleanupTarget,
  TrashEntry
} from '../shared/types'
import { isSameOrInsidePath, needsAdminForPaths } from '../shared/paths'
import { listDrives } from './drives'
import { listTrash } from './recycleBin'
import { trashBatch } from './elevatedTrash'
import { buildCleanupReport, writeCleanupReport } from './cleanupReport'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeTargets(targets: CleanupTarget[]): CleanupTarget[] {
  const seen = new Set<string>()
  const result: CleanupTarget[] = []
  for (const raw of Array.isArray(targets) ? targets : []) {
    if (!raw || typeof raw.path !== 'string' || !raw.path.trim()) continue
    const path = raw.path.trim()
    if (seen.has(path)) continue
    seen.add(path)
    result.push({
      path,
      name: typeof raw.name === 'string' && raw.name ? raw.name : path,
      size: Number.isFinite(raw.size) && raw.size > 0 ? raw.size : 0,
      type: raw.type === 'dir' ? 'dir' : 'file',
      mtime: Number.isFinite(raw.mtime) ? raw.mtime : 0,
      groupId: raw.groupId,
      groupTitle: raw.groupTitle
    })
  }
  return result
}

/**
 * 只把"本次清理项"从回收站彻底删除，不碰用户以前删的其它东西。
 * 用于「清理后立即释放空间」：先安全地移到回收站，再精确清掉这一批。
 */
export async function purgeTrashedTargets(
  targets: CleanupTarget[]
): Promise<{ purgedBytes: number; purgedCount: number; failed: number }> {
  const drives = await listDrives()
  const roots = drives.map((drive) => drive.path)
  if (roots.length === 0) roots.push('C:\\')
  const listing = await listTrash(roots)
  const targetPaths = targets.map((item) => item.path)
  const matches: TrashEntry[] = listing.entries.filter((entry) =>
    targetPaths.some((path) => isSameOrInsidePath(entry.originalPath, path))
  )

  // 并发删回收站内容：几千项时比串行快一个量级；每个条目互相独立
  const results: { bytes: number; ok: boolean }[] = new Array(matches.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < matches.length) {
      const index = next++
      const entry = matches[index]
      try {
        if (entry.exists) {
          await fs.rm(entry.contentPath, { recursive: true, force: true })
        }
        await fs.rm(entry.infoPath, { force: true })
        results[index] = { bytes: entry.exists ? entry.size : 0, ok: true }
      } catch {
        results[index] = { bytes: 0, ok: false }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, matches.length) }, worker))
  let purgedBytes = 0
  let purgedCount = 0
  let failed = 0
  for (const item of results) {
    if (!item) {
      failed++
      continue
    }
    if (item.ok) {
      purgedCount++
      purgedBytes += item.bytes
    } else {
      failed++
    }
  }
  return { purgedBytes, purgedCount, failed }
}

/**
 * 执行一次清理：
 * 1. 记录清理前各盘可用空间
 * 2. auto/always 时用一次 UAC 授权整批执行（不会逐文件弹窗）
 * 3. 记录清理后空间，生成 HTML 报告
 */
export async function executeCleanup(
  request: CleanupExecuteRequest,
  settings: AppSettings,
  onProgress?: (done: number, total: number, current: string) => void
): Promise<CleanupExecuteResult> {
  const targets = normalizeTargets(request.targets)
  if (targets.length === 0) return { ok: false, message: '没有要清理的项目' }

  const startedAt = Date.now()
  const beforeDrives = await listDrives()
  const mode = request.elevation ?? settings.cleanupElevation
  const useElevated =
    process.platform === 'win32' &&
    (mode === 'always' || (mode === 'auto' && needsAdminForPaths(targets.map((item) => item.path))))

  const batch = await trashBatch(
    targets.map((item) => item.path),
    useElevated,
    onProgress
  )
  if (batch.cancelled) {
    return {
      ok: false,
      elevationCancelled: true,
      message: '已取消管理员授权，没有删除任何文件'
    }
  }
  const outcomes: CleanupOutcome[] = batch.outcomes
  if (batch.outcomes.length === 0 && batch.message) {
    return { ok: false, message: batch.message }
  }

  // 可选：把本次项目从回收站彻底删除，真正释放可用空间
  let purgedBytes = 0
  let purgedCount = 0
  let purged = false
  if (request.purgeAfter) {
    const purge = await purgeTrashedTargets(targets).catch(() => null)
    if (purge && purge.purgedCount > 0) {
      purged = true
      purgedBytes = purge.purgedBytes
      purgedCount = purge.purgedCount
    }
  }

  // Windows 的可用空间不是瞬间刷新；等一小会儿再读，报告里的“清理后”才准
  await sleep(500)
  const afterDrives = await listDrives()
  const durationMs = Date.now() - startedAt
  const report = buildCleanupReport({
    targets,
    outcomes,
    beforeDrives,
    afterDrives,
    scope: request.scope || '本次清理',
    mode: useElevated ? 'elevated' : 'normal',
    startedAt,
    durationMs,
    freedBytesOverride: purged ? purgedBytes : undefined,
    purged,
    purgedBytes: purged ? purgedBytes : undefined,
    purgedCount: purged ? purgedCount : undefined
  })
  report.reportPath = await writeCleanupReport(report)
  return { ok: true, report }
}
