// 查重状态：结果跨视图切换保留；新扫描后标为"过期"，删除后从结果里摘掉
// 与扫描 store 分开：查重是独立的长任务，有自己的进度/取消/结果

import { create } from 'zustand'
import type {
  DuplicateCandidateGroup,
  DuplicateGroup,
  DuplicateProgress,
  DuplicateResult
} from '../../../shared/types'

export type DuplicateStatus = 'idle' | 'scanning' | 'done' | 'cancelled' | 'error'

interface DuplicateState {
  status: DuplicateStatus
  progress: DuplicateProgress | null
  result: DuplicateResult | null
  error: string | null
  /** 结果对应哪一次扫描（scanStore.scanId） */
  resultScanId: number
  /** 结果生成时的树版本（删除后会变，用于提示"结果可能过期"） */
  resultTreeVersion: number
  /** 本次查重的最小大小 */
  minSize: number
  startedAt: number

  setProgress: (progress: DuplicateProgress) => void
  run: (
    candidates: DuplicateCandidateGroup[],
    minSize: number,
    scanId: number,
    treeVersion: number
  ) => Promise<void>
  cancel: () => void
  reset: () => void
  /** 删除成功后：把路径从结果里摘掉，组不足两份就整组消失 */
  applyDeleted: (paths: string[], treeVersion: number) => void
}

export const useDuplicateStore = create<DuplicateState>((set, get) => ({
  status: 'idle',
  progress: null,
  result: null,
  error: null,
  resultScanId: -1,
  resultTreeVersion: -1,
  minSize: 1024 * 1024,
  startedAt: 0,

  setProgress: (progress) => set({ progress }),

  run: async (candidates, minSize, scanId, treeVersion) => {
    if (get().status === 'scanning') return
    set({
      status: 'scanning',
      progress: null,
      result: null,
      error: null,
      minSize,
      startedAt: Date.now(),
      resultScanId: scanId,
      resultTreeVersion: treeVersion
    })
    try {
      const response = await window.api.startDuplicateScan(candidates)
      if (response.cancelled) {
        set({ status: 'cancelled', progress: null })
        return
      }
      if (!response.ok || !response.result) {
        set({
          status: 'error',
          progress: null,
          error: response.message ?? '查重没跑完，稍后再试'
        })
        return
      }
      set({
        status: 'done',
        progress: null,
        result: response.result,
        error: null,
        resultTreeVersion: treeVersion
      })
    } catch (error) {
      set({
        status: 'error',
        progress: null,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  cancel: () => {
    if (get().status === 'scanning') window.api.cancelDuplicateScan()
  },

  reset: () =>
    set({
      status: 'idle',
      progress: null,
      result: null,
      error: null,
      resultScanId: -1,
      resultTreeVersion: -1,
      startedAt: 0
    }),

  applyDeleted: (paths, treeVersion) => {
    const result = get().result
    if (!result || paths.length === 0) return
    const deleted = new Set(paths)
    const groups: DuplicateGroup[] = []
    for (const group of result.groups) {
      const files = group.files.filter((file) => !deleted.has(file.path))
      if (files.length < 2) continue
      groups.push({
        ...group,
        files,
        wasted: group.size * (files.length - 1)
      })
    }
    set({
      result: {
        ...result,
        groups,
        totalWasted: groups.reduce((sum, group) => sum + group.wasted, 0)
      },
      resultTreeVersion: treeVersion
    })
  }
}))
