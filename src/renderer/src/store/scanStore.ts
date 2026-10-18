import { create } from 'zustand'
import type { ScanNode, ScanProgress, ScanResult, ScanStatus } from '../../../shared/types'

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
  /** Treemap 下钻路径：面包屑（从根到当前展示层） */
  breadcrumb: ScanNode[]
  /** 进入下一层（点击目录块） */
  pushView: (node: ScanNode) => void
  /** 跳转到面包屑第 index 层 */
  popTo: (index: number) => void
  /** 回到根层 */
  resetView: () => void
}

export const useScanStore = create<ScanState>((set) => ({
  status: 'idle',
  progress: null,
  result: null,
  error: null,
  setProgress: (progress) => set({ progress }),
  setDone: (result) => set({ status: 'done', result, progress: null, breadcrumb: [result.root] }),
  setError: (message) => set({ status: 'error', error: message }),
  reset: () => set({ status: 'idle', progress: null, result: null, error: null, breadcrumb: [] }),
  breadcrumb: [],
  pushView: (node) => set((s) => ({ breadcrumb: [...s.breadcrumb, node] })),
  popTo: (index) => set((s) => ({ breadcrumb: s.breadcrumb.slice(0, index + 1) })),
  resetView: () => set((s) => ({ breadcrumb: s.result ? [s.result.root] : [] }))
}))
