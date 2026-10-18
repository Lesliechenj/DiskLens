import { create } from 'zustand'
import type { ScanProgress, ScanResult, ScanStatus } from '../../../shared/types'

interface ScanState {
  /** 扫描状态机 */
  status: ScanStatus
  /** 实时进度（扫描中持续更新） */
  progress: ScanProgress | null
  /** 扫描结果（完成后的一整棵 JSON 树） */
  result: ScanResult | null
  /** 失败原因 */
  error: string | null
  setProgress: (progress: ScanProgress) => void
  setDone: (result: ScanResult) => void
  setError: (message: string) => void
  reset: () => void
}

export const useScanStore = create<ScanState>((set) => ({
  status: 'idle',
  progress: null,
  result: null,
  error: null,
  setProgress: (progress) => set({ progress }),
  setDone: (result) => set({ status: 'done', result, progress: null }),
  setError: (message) => set({ status: 'error', error: message }),
  reset: () => set({ status: 'idle', progress: null, result: null, error: null })
}))
