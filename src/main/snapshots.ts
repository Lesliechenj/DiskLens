// 扫描快照：把上一次的扫描树压缩存盘，下次打开直接恢复，不用再扫几十万文件
// 存储位置：userData/snapshots/latest.json.gz（只保留最近一次，避免占太多空间）
// 快照是“当时的状态”，文件后来变了不会自动更新；界面上会明确提示时间。

import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'
import type { ScanResult, SnapshotMeta } from '../shared/types'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/** 超过这个文件数就别自动存了：JSON 序列化会明显拖慢主进程 */
const MAX_SNAPSHOT_FILES = 2_500_000

function snapshotDir(): string {
  return join(app.getPath('userData'), 'snapshots')
}

function snapshotPath(): string {
  return join(snapshotDir(), 'latest.json.gz')
}

function metaPath(): string {
  return join(snapshotDir(), 'latest.meta.json')
}

/** 把扫描结果补齐成新版本的形状（旧快照也能读） */
function normalizeResult(raw: unknown): ScanResult | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<ScanResult>
  if (!input.root || typeof input.root.path !== 'string') return null
  return {
    root: input.root,
    roots: Array.isArray(input.roots) && input.roots.length > 0 ? input.roots : [input.root.path],
    multi: input.multi === true,
    skipped: Array.isArray(input.skipped) ? input.skipped : [],
    skippedCount: Number(input.skippedCount ?? 0),
    excluded: Number(input.excluded ?? 0),
    durationMs: Number(input.durationMs ?? 0),
    stats: {
      files: Number(input.stats?.files ?? 0),
      dirs: Number(input.stats?.dirs ?? 0)
    }
  }
}

let saving: Promise<SnapshotMeta | null> | null = null

/** 保存快照（并发调用会复用同一次保存） */
export async function saveSnapshot(result: ScanResult): Promise<SnapshotMeta | null> {
  if (saving) return saving
  saving = (async () => {
    if (result.stats.files > MAX_SNAPSHOT_FILES) return null
    await fs.mkdir(snapshotDir(), { recursive: true })
    const json = JSON.stringify(result)
    const compressed = await gzipAsync(Buffer.from(json, 'utf8'), { level: 6 })
    const target = snapshotPath()
    const temp = `${target}.tmp`
    await fs.writeFile(temp, compressed)
    await fs.rename(temp, target)
    const stat = await fs.stat(target)
    const meta: SnapshotMeta = {
      path: target,
      createdAt: Date.now(),
      roots: result.roots,
      totalBytes: result.root.size,
      files: result.stats.files,
      dirs: result.stats.dirs,
      fileBytes: stat.size
    }
    await fs.writeFile(metaPath(), JSON.stringify(meta), 'utf8')
    return meta
  })()
    .catch(() => null)
    .finally(() => {
      saving = null
    })
  return saving
}

/** 最近一次快照的元信息（没有返回 null） */
export async function getLatestSnapshot(): Promise<SnapshotMeta | null> {
  try {
    const text = await fs.readFile(metaPath(), 'utf8')
    const meta = JSON.parse(text) as SnapshotMeta
    if (!meta || typeof meta.path !== 'string') return null
    const stat = await fs.stat(meta.path)
    return { ...meta, fileBytes: stat.size }
  } catch {
    return null
  }
}

/** 读取最近一次快照（损坏/不存在返回 null） */
export async function loadLatestSnapshot(): Promise<ScanResult | null> {
  try {
    const compressed = await fs.readFile(snapshotPath())
    const json = (await gunzipAsync(compressed)).toString('utf8')
    return normalizeResult(JSON.parse(json))
  } catch {
    return null
  }
}

/** 删除快照（用户手动清理） */
export async function deleteLatestSnapshot(): Promise<void> {
  await fs.rm(snapshotPath(), { force: true }).catch(() => undefined)
  await fs.rm(metaPath(), { force: true }).catch(() => undefined)
}
