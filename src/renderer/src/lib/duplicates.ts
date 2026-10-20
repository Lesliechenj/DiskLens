// 查重的渲染层准备：从扫描树里挑出"大小相同、至少两份"的文件
// 只读内存里的树，不碰磁盘；真正的内容比对交给主进程（见 main/duplicates.ts）

import type { DuplicateCandidateGroup } from '../../../shared/types'
import type { ScanNode } from '../../../shared/types'

/** 主进程允许的候选上限（超过就提示用户调大最小大小） */
export const MAX_CANDIDATE_FILES = 200_000
/** 渲染层一次最多送多少文件（比主进程上限略低，留余量） */
const SEND_LIMIT = 180_000

export interface CandidateBuildResult {
  /** 同大小候选组（按大小降序） */
  candidates: DuplicateCandidateGroup[]
  /** 达到最小大小、且同大小至少两份的文件数 */
  eligibleFiles: number
  /** 实际送进查重的文件数 */
  candidateFiles: number
  /** 候选组数 */
  candidateGroups: number
  /** 文件太多，没敢全送（提示用户调大最小大小） */
  tooMany: boolean
  /** 因为上限只送了一部分（提示用户结果只覆盖较大的文件） */
  truncated: boolean
  /** 最小大小（字节） */
  minSize: number
}

/**
 * 按大小给文件分组。内容相同的文件大小必然相同，所以这步只做内存分组，
 * 不读磁盘，百万文件也只是一次遍历。
 */
export function buildDuplicateCandidates(
  root: ScanNode,
  minSize: number,
  limit = MAX_CANDIDATE_FILES
): CandidateBuildResult {
  const bySize = new Map<number, { path: string; mtime: number }[]>()
  let eligibleFiles = 0
  const stack: ScanNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'file') {
      if (node.size > 0 && node.size >= minSize) {
        eligibleFiles++
        const bucket = bySize.get(node.size) ?? []
        bucket.push({ path: node.path, mtime: node.mtime })
        bySize.set(node.size, bucket)
      }
    } else {
      for (const kid of node.children ?? []) stack.push(kid)
    }
  }

  if (eligibleFiles > limit) {
    return {
      candidates: [],
      eligibleFiles,
      candidateFiles: 0,
      candidateGroups: 0,
      tooMany: true,
      truncated: false,
      minSize
    }
  }

  // 只保留至少两份的大小组；大文件优先，限额时先保住"最值得看"的
  const groups = [...bySize.entries()]
    .filter(([, files]) => files.length >= 2)
    .sort((a, b) => b[0] - a[0])

  const candidates: DuplicateCandidateGroup[] = []
  let candidateFiles = 0
  let truncated = false
  for (const [size, files] of groups) {
    if (candidateFiles + files.length > SEND_LIMIT) {
      truncated = true
      break
    }
    candidates.push({ size, files })
    candidateFiles += files.length
  }

  return {
    candidates,
    eligibleFiles,
    candidateFiles,
    candidateGroups: candidates.length,
    tooMany: false,
    truncated,
    minSize
  }
}

/** 查重可选的最小文件大小（默认 1MB：既扫得快，又只关注真正占地方的重复） */
export const DUPLICATE_MIN_SIZE_OPTIONS = [
  { value: 1024, label: '≥ 1 KB（最彻底，最慢）' },
  { value: 64 * 1024, label: '≥ 64 KB' },
  { value: 1024 * 1024, label: '≥ 1 MB（推荐）' },
  { value: 16 * 1024 * 1024, label: '≥ 16 MB（最快）' }
] as const
