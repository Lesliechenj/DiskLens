// 重复文件检测（查重）：只读文件内容，绝不修改/删除任何东西
// 算法分三步，既快又不会误报：
//   1) 渲染层已经按"文件大小"分好组——大小不同的文件内容一定不同，直接排除
//   2) 对同大小的文件抽样哈希（首 64KB + 尾 64KB），快速排除"大小相同但内容不同"
//   3) 抽样相同的再做完整 SHA-256，逐字节确认，最后按 inode 去掉硬链接（硬链接不占额外空间）
// 主进程只负责读文件；候选清单由渲染层从扫描树里生成（避免把百万文件都塞进 IPC）

import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import type { FileHandle } from 'fs/promises'
import type {
  DuplicateCandidateFile,
  DuplicateCandidateGroup,
  DuplicateGroup,
  DuplicateProgress,
  DuplicateResult
} from '../shared/types'

/** 抽样哈希读多少：首尾各 64KB（小文件直接全读） */
const PARTIAL_CHUNK = 64 * 1024
/** 完整校验每次读 1MB（太小系统调用多，太大占用内存） */
const FULL_CHUNK = 1024 * 1024
/** 抽样阶段并发：机械盘/网络盘也能接受，太快反而抢 I/O */
const PARTIAL_CONCURRENCY = 4
/** 完整校验并发：大文件读取更吃带宽，压到 2 路 */
const FULL_CONCURRENCY = 2
/** 候选文件上限：超过就请用户把"最小大小"调大，别把内存和 UI 拖死 */
export const MAX_CANDIDATE_FILES = 200_000
/** 错误样本上限（真实错误数单独计数） */
const MAX_ERROR_SAMPLES = 50
/** 进度上报节流 */
const PROGRESS_INTERVAL_MS = 120

/** 查重被取消（与真错误区分） */
export class DuplicateCancelledError extends Error {
  readonly code = 'DUPLICATE_CANCELLED'
  constructor() {
    super('查重已取消')
    this.name = 'DuplicateCancelledError'
  }
}

interface FileInfo {
  path: string
  mtime: number
  size: number
  /** 硬链接判定用；Windows 上个别文件系统可能为 0 */
  ino: number
  dev: number
  partialHash: string
  fullHash?: string
}

interface CandidateTask {
  groupIndex: number
  file: DuplicateCandidateFile
}

type ShouldStop = () => boolean

function checkStop(shouldStop: ShouldStop): void {
  if (shouldStop()) throw new DuplicateCancelledError()
}

/** 读文件的一段；返回实际读到的字节数（文件可能在扫描后被改动） */
async function readRange(handle: FileHandle, buffer: Buffer, position: number): Promise<number> {
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
  return bytesRead
}

/** 抽样哈希：小文件全读，大文件读首尾各 64KB（能排除绝大多数同大小不同内容的文件） */
async function partialHash(
  path: string,
  expectedSize: number,
  shouldStop: ShouldStop
): Promise<{ info: FileInfo; hashedBytes: number }> {
  const stat = await fs.stat(path)
  if (!stat.isFile()) throw new Error('不是普通文件')
  if (stat.size !== expectedSize) throw new Error('文件大小在扫描后发生了变化')

  const handle = await fs.open(path, 'r')
  const hash = createHash('sha256')
  let hashedBytes = 0
  try {
    if (stat.size <= PARTIAL_CHUNK * 2) {
      const buffer = Buffer.allocUnsafe(stat.size)
      checkStop(shouldStop)
      const read = await readRange(handle, buffer, 0)
      hash.update(buffer.subarray(0, read))
      hashedBytes += read
    } else {
      const head = Buffer.allocUnsafe(PARTIAL_CHUNK)
      checkStop(shouldStop)
      const headRead = await readRange(handle, head, 0)
      hash.update(head.subarray(0, headRead))
      hashedBytes += headRead

      const tail = Buffer.allocUnsafe(PARTIAL_CHUNK)
      checkStop(shouldStop)
      const tailRead = await readRange(handle, tail, Math.max(0, stat.size - PARTIAL_CHUNK))
      hash.update(tail.subarray(0, tailRead))
      hashedBytes += tailRead
    }
  } finally {
    await handle.close()
  }

  return {
    info: {
      path,
      mtime: stat.mtimeMs,
      size: stat.size,
      ino: typeof stat.ino === 'number' ? stat.ino : 0,
      dev: typeof stat.dev === 'number' ? stat.dev : 0,
      partialHash: hash.digest('hex')
    },
    hashedBytes
  }
}

/** 完整 SHA-256：分块读，边读边算，随时可取消 */
async function fullHash(
  path: string,
  expectedSize: number,
  shouldStop: ShouldStop
): Promise<{ hash: string; hashedBytes: number }> {
  const stat = await fs.stat(path)
  if (!stat.isFile()) throw new Error('不是普通文件')
  if (stat.size !== expectedSize) throw new Error('文件大小在查重过程中发生了变化')

  const handle = await fs.open(path, 'r')
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(FULL_CHUNK)
  let position = 0
  let hashedBytes = 0
  try {
    while (position < stat.size) {
      checkStop(shouldStop)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (bytesRead <= 0) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
      hashedBytes += bytesRead
    }
  } finally {
    await handle.close()
  }
  return { hash: hash.digest('hex'), hashedBytes }
}

/** 校验并清洗候选清单：去掉空路径、重复路径、大小非法/文件不足 2 个的组 */
function normalizeCandidates(candidates: DuplicateCandidateGroup[]): {
  groups: DuplicateCandidateGroup[]
  files: number
} {
  const seen = new Set<string>()
  const groups: DuplicateCandidateGroup[] = []
  let files = 0

  for (const raw of Array.isArray(candidates) ? candidates : []) {
    if (!raw || !Number.isFinite(raw.size) || raw.size <= 0) continue
    if (!Array.isArray(raw.files)) continue
    const kept: DuplicateCandidateFile[] = []
    for (const file of raw.files) {
      if (!file || typeof file.path !== 'string' || !file.path.trim()) continue
      const path = file.path
      if (seen.has(path)) continue
      seen.add(path)
      kept.push({ path, mtime: Number.isFinite(file.mtime) ? file.mtime : 0 })
    }
    if (kept.length >= 2) {
      groups.push({ size: Math.round(raw.size), files: kept })
      files += kept.length
    }
  }
  return { groups, files }
}

/**
 * 执行查重。候选组由渲染层按大小分组后传入。
 *
 * @param candidates 同大小、至少 2 个文件的候选组
 * @param onProgress 进度回调（主进程会节流后发给渲染层）
 * @param shouldStop 取消检查
 */
export async function findDuplicateFiles(
  candidates: DuplicateCandidateGroup[],
  onProgress?: (progress: DuplicateProgress) => void,
  shouldStop: ShouldStop = () => false
): Promise<DuplicateResult> {
  const startedAt = Date.now()
  const { groups, files: candidateFiles } = normalizeCandidates(candidates)
  if (candidateFiles > MAX_CANDIDATE_FILES) {
    throw new Error(
      `符合条件的文件有 ${candidateFiles.toLocaleString('zh-CN')} 个，太多了。把「最小大小」调大一点再查。`
    )
  }

  const errors: string[] = []
  let errorCount = 0
  const noteError = (path: string, error: unknown): void => {
    errorCount++
    if (errors.length < MAX_ERROR_SAMPLES) {
      const reason = error instanceof Error ? error.message : String(error)
      errors.push(`${path}（${reason}）`)
    }
  }

  let lastReportAt = 0
  let phase: DuplicateProgress['phase'] = 'partial'
  let doneGroups = 0
  let totalGroups = groups.length
  let doneFiles = 0
  let totalFiles = candidateFiles
  let hashedBytes = 0
  let current = ''

  const report = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastReportAt < PROGRESS_INTERVAL_MS) return
    lastReportAt = now
    onProgress?.({
      phase,
      doneGroups,
      totalGroups,
      doneFiles,
      totalFiles,
      hashedBytes,
      current
    })
  }

  // ---- 第 1 步：抽样哈希，把"大小相同但内容不同"的快速筛掉 ----
  const tasks: CandidateTask[] = []
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    for (const file of groups[groupIndex].files) tasks.push({ groupIndex, file })
  }
  const partialByGroup = new Map<number, Map<string, FileInfo[]>>()
  const remaining = groups.map((group) => group.files.length)

  report(true)
  let nextTask = 0
  const partialWorkers = Array.from(
    { length: Math.max(1, Math.min(PARTIAL_CONCURRENCY, tasks.length)) },
    async () => {
      while (true) {
        checkStop(shouldStop)
        const index = nextTask++
        if (index >= tasks.length) return
        const task = tasks[index]
        current = task.file.path
        try {
          const { info, hashedBytes: read } = await partialHash(
            task.file.path,
            groups[task.groupIndex].size,
            shouldStop
          )
          hashedBytes += read
          const byHash = partialByGroup.get(task.groupIndex) ?? new Map<string, FileInfo[]>()
          const bucket = byHash.get(info.partialHash) ?? []
          bucket.push(info)
          byHash.set(info.partialHash, bucket)
          partialByGroup.set(task.groupIndex, byHash)
        } catch (error) {
          if (error instanceof DuplicateCancelledError) throw error
          noteError(task.file.path, error)
        }
        doneFiles++
        remaining[task.groupIndex]--
        if (remaining[task.groupIndex] === 0) doneGroups++
        report()
      }
    }
  )
  await Promise.all(partialWorkers)
  report(true)

  // 抽样阶段结束后，只有"同一大小 + 同一抽样哈希 + 至少 2 份"才进入完整校验
  const fullGroups: { size: number; files: FileInfo[] }[] = []
  for (const [groupIndex, byHash] of partialByGroup) {
    for (const bucket of byHash.values()) {
      if (bucket.length >= 2) fullGroups.push({ size: groups[groupIndex].size, files: bucket })
    }
  }

  // ---- 第 2 步：完整哈希，逐字节确认 ----
  phase = 'full'
  doneGroups = 0
  totalGroups = fullGroups.length
  doneFiles = 0
  totalFiles = fullGroups.reduce((sum, group) => sum + group.files.length, 0)
  current = ''
  const fullTasks: CandidateTask[] = []
  for (let groupIndex = 0; groupIndex < fullGroups.length; groupIndex += 1) {
    for (const file of fullGroups[groupIndex].files) {
      fullTasks.push({ groupIndex, file: { path: file.path, mtime: file.mtime } })
    }
  }
  // 用路径反查 FileInfo（fullTasks 里只有轻量对象）
  const infoByPath = new Map<string, FileInfo>()
  for (const group of fullGroups) for (const file of group.files) infoByPath.set(file.path, file)

  const fullRemaining = fullGroups.map((group) => group.files.length)
  let nextFullTask = 0
  report(true)
  const fullWorkers = Array.from(
    { length: Math.max(1, Math.min(FULL_CONCURRENCY, fullTasks.length)) },
    async () => {
      while (true) {
        checkStop(shouldStop)
        const index = nextFullTask++
        if (index >= fullTasks.length) return
        const task = fullTasks[index]
        current = task.file.path
        const info = infoByPath.get(task.file.path)
        try {
          if (!info) throw new Error('内部状态丢失')
          const { hash, hashedBytes: read } = await fullHash(
            task.file.path,
            fullGroups[task.groupIndex].size,
            shouldStop
          )
          hashedBytes += read
          info.fullHash = hash
        } catch (error) {
          if (error instanceof DuplicateCancelledError) throw error
          noteError(task.file.path, error)
        }
        doneFiles++
        fullRemaining[task.groupIndex]--
        if (fullRemaining[task.groupIndex] === 0) doneGroups++
        report()
      }
    }
  )
  await Promise.all(fullWorkers)
  report(true)

  // ---- 第 3 步：按完整哈希收组，去掉硬链接（同一份数据不重复占空间） ----
  const finalMap = new Map<string, { size: number; files: FileInfo[] }>()
  for (const group of fullGroups) {
    for (const info of group.files) {
      if (!info.fullHash) continue
      const key = `${group.size}:${info.fullHash}`
      const bucket = finalMap.get(key) ?? { size: group.size, files: [] }
      bucket.files.push(info)
      finalMap.set(key, bucket)
    }
  }

  const resultGroups: DuplicateGroup[] = []
  for (const bucket of finalMap.values()) {
    if (bucket.files.length < 2) continue

    // 硬链接在 NTFS 上共享同一个 inode：路径不同但数据只存一份，不能算"浪费空间"
    const unique = new Map<string, FileInfo>()
    for (const file of bucket.files) {
      const key = file.ino > 0 ? `${file.dev}:${file.ino}` : file.path
      if (!unique.has(key)) unique.set(key, file)
    }
    const files = [...unique.values()].sort(
      (a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path)
    )
    if (files.length < 2) continue

    const size = bucket.size
    resultGroups.push({
      id: files[0].path,
      size,
      files: files.map((file) => ({ path: file.path, mtime: file.mtime })),
      wasted: size * (files.length - 1)
    })
  }

  resultGroups.sort((a, b) => b.wasted - a.wasted || b.size - a.size)
  return {
    groups: resultGroups,
    candidateGroups: groups.length,
    candidateFiles,
    hashedFiles: doneFiles,
    totalWasted: resultGroups.reduce((sum, group) => sum + group.wasted, 0),
    durationMs: Date.now() - startedAt,
    errors,
    errorCount
  }
}
