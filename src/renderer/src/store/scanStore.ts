import { create } from 'zustand'
import type { ScanNode, ScanProgress, ScanResult, ScanStatus } from '../../../shared/types'

/** 图表视图：面积图 / 饼图（同源数据，切换不重扫） */
export type ChartView = 'treemap' | 'pie'

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
  /** 当前图表视图 */
  view: ChartView
  setView: (view: ChartView) => void
  /** 当前层展示哪些类型（饼图不使用；目录+文件 = 全部） */
  visibleTypes: ('dir' | 'file')[]
  setVisibleTypes: (types: ('dir' | 'file')[]) => void
  /** 扩展名筛选（小写不含点；null = 不限）—— 饼图点切片设置 */
  extFilter: string | null
  setExtFilter: (ext: string | null) => void
  /** 点饼图切片：设扩展名筛选并切回面积图 */
  focusExtension: (ext: string | null) => void
  /** 搜索命中跳转：按祖先链铺面包屑，目录则再进入一层 */
  jumpTo: (ancestors: ScanNode[], node?: ScanNode) => void
  /** 当前选中的文件/目录（F5 操作面板对象）；null = 无选中 */
  selectedFile: ScanNode | null
  selectFile: (node: ScanNode | null) => void
}

export const useScanStore = create<ScanState>((set) => ({
  status: 'idle',
  progress: null,
  result: null,
  error: null,
  setProgress: (progress) => set({ progress }),
  setDone: (result) =>
    set({ status: 'done', result, progress: null, breadcrumb: [result.root], extFilter: null }),
  setError: (message) => set({ status: 'error', error: message }),
  reset: () =>
    set({ status: 'idle', progress: null, result: null, error: null, breadcrumb: [], extFilter: null }),
  breadcrumb: [],
  pushView: (node) => set((s) => ({ breadcrumb: [...s.breadcrumb, node] })),
  popTo: (index) => set((s) => ({ breadcrumb: s.breadcrumb.slice(0, index + 1) })),
  resetView: () => set((s) => ({ breadcrumb: s.result ? [s.result.root] : [] })),
  view: 'treemap',
  setView: (view) => set({ view }),
  visibleTypes: ['dir', 'file'],
  setVisibleTypes: (types) => set({ visibleTypes: types }),
  extFilter: null,
  setExtFilter: (ext) => set({ extFilter: ext }),
  focusExtension: (ext) => set({ extFilter: ext, view: 'treemap' }),
  jumpTo: (ancestors, node) =>
    set((s) => ({
      view: 'treemap',
      breadcrumb:
        node && node.type === 'dir' ? [...ancestors, node] : ancestors.length > 0 ? ancestors : s.breadcrumb
    })),
  selectedFile: null,
  selectFile: (node) => set({ selectedFile: node })
}))
