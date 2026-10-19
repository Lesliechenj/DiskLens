// 扫描结果与视图状态：一棵树 + 当前看哪一层 + 怎么筛 + 选中了谁
// 所有视图共用同一份数据，切视图不重扫；筛选是前端过滤

import { create } from 'zustand'
import type { ExtCategory } from '../../../shared/extCategories'
import type {
  NodeType,
  ScanNode,
  ScanProgress,
  ScanResult,
  ScanStatus,
  ViewKind
} from '../../../shared/types'
import { removeNodes } from '../lib/treeOps'
import type { TypeQuery } from '../lib/insights'

/** 当前层的筛选条件 */
export interface Filters {
  /** 显示哪些类型（目录/文件都是 = 全部） */
  types: NodeType[]
  /** 只看某个大类（视频/图片/…） */
  category: ExtCategory | null
  /** 只看某个扩展名（小写不含点） */
  ext: string | null
  /** 小于此字节数的直接子项不显示（0 = 不过滤） */
  minSize: number
}

const DEFAULT_FILTERS: Filters = { types: ['dir', 'file'], category: null, ext: null, minSize: 0 }

interface ScanState {
  status: ScanStatus
  progress: ScanProgress | null
  result: ScanResult | null
  error: string | null
  /** 本轮扫描开始时间（渲染层算"已跑多久"） */
  startedAt: number
  setProgress: (progress: ScanProgress) => void
  setDone: (result: ScanResult) => void
  setError: (message: string) => void
  setCancelled: () => void
  /** 开始新一轮扫描（清空旧结果） */
  begin: () => void
  reset: () => void

  /** 当前视图 */
  view: ViewKind
  setView: (view: ViewKind) => void

  /** Treemap/旭日图下钻路径：面包屑（从根到当前展示层） */
  breadcrumb: ScanNode[]
  pushView: (node: ScanNode) => void
  popTo: (index: number) => void
  /** 回到根层 */
  resetView: () => void
  /** 搜索命中跳转：按祖先链铺面包屑，目录则再进入一层 */
  jumpTo: (ancestors: ScanNode[], node?: ScanNode) => void

  filters: Filters
  setTypes: (types: NodeType[]) => void
  setCategory: (category: ExtCategory | null, ext?: string | null) => void
  setExt: (ext: string | null) => void
  setMinSize: (minSize: number) => void
  resetFilters: () => void

  /** 选中节点（详情面板的对象） */
  selected: ScanNode | null
  select: (node: ScanNode | null) => void

  /** 树被就地修改后的版本号（触发派生数据重算） */
  treeVersion: number
  /** 回收站成功后从树里摘除节点 */
  removePaths: (paths: string[]) => { removed: number; freedBytes: number }

  /** 全局搜索关键词（Ctrl+F 聚焦的那个框） */
  keyword: string
  setKeyword: (keyword: string) => void

  /** 扫描栏里输入框的内容（放在 store 里：磁盘卡片/最近路径点了也能同步回显） */
  input: string
  setInput: (input: string) => void

  /** "文件分类"视图当前选的类型（null = 还没选） */
  typeQuery: TypeQuery | null
  setTypeQuery: (query: TypeQuery | null) => void
}

export const useScanStore = create<ScanState>((set, get) => ({
  status: 'idle',
  progress: null,
  result: null,
  error: null,
  startedAt: 0,

  setProgress: (progress) => set({ progress }),
  setDone: (result) =>
    set({
      status: 'done',
      result,
      progress: null,
      error: null,
      breadcrumb: [result.root],
      filters: DEFAULT_FILTERS,
      selected: null,
      treeVersion: get().treeVersion + 1,
      keyword: ''
    }),
  setError: (message) => set({ status: 'error', error: message, progress: null }),
  setCancelled: () => set({ status: 'idle', progress: null, error: null }),
  begin: () =>
    set({
      status: 'scanning',
      progress: null,
      error: null,
      startedAt: Date.now(),
      // 旧结果留着不清：扫描失败/取消时用户还能接着看上一份图
      selected: null
    }),
  reset: () =>
    set({
      status: 'idle',
      progress: null,
      result: null,
      error: null,
      breadcrumb: [],
      filters: DEFAULT_FILTERS,
      selected: null,
      keyword: '',
      treeVersion: get().treeVersion + 1
    }),

  view: 'treemap',
  setView: (view) => set({ view }),

  breadcrumb: [],
  pushView: (node) => set((state) => ({ breadcrumb: [...state.breadcrumb, node] })),
  popTo: (index) => set((state) => ({ breadcrumb: state.breadcrumb.slice(0, index + 1) })),
  resetView: () => set((state) => ({ breadcrumb: state.result ? [state.result.root] : [] })),

  filters: DEFAULT_FILTERS,
  setTypes: (types) => set((state) => ({ filters: { ...state.filters, types } })),
  setCategory: (category, ext = null) =>
    set((state) => ({ filters: { ...state.filters, category, ext } })),
  setExt: (ext) => set((state) => ({ filters: { ...state.filters, ext } })),
  setMinSize: (minSize) => set((state) => ({ filters: { ...state.filters, minSize } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  selected: null,
  select: (node) => set({ selected: node }),

  /** 搜索跳转：把祖先链铺成面包屑；命中目录则直接进到该目录 */
  jumpTo: (ancestors, node) =>
    set((state) => {
      const chain =
        node && node.type === 'dir'
          ? [...ancestors, node]
          : ancestors.length > 0
            ? ancestors
            : state.breadcrumb
      return { view: 'treemap', breadcrumb: chain }
    }),

  treeVersion: 0,
  removePaths: (paths) => {
    const result = get().result
    if (!result) return { removed: 0, freedBytes: 0 }
    const outcome = removeNodes(result.root, paths)
    if (outcome.removed > 0) {
      const selected = get().selected
      const breadcrumb = get().breadcrumb
      set({
        treeVersion: get().treeVersion + 1,
        // 被删掉的节点不能再当"当前选中"或面包屑的一层
        selected: selected && paths.includes(selected.path) ? null : selected,
        breadcrumb: breadcrumb.filter((node) => !paths.includes(node.path))
      })
    }
    return outcome
  },

  keyword: '',
  setKeyword: (keyword) => set({ keyword }),

  input: '',
  setInput: (input) => set({ input }),

  typeQuery: null,
  setTypeQuery: (query) => set({ typeQuery: query })
}))

/** 当前展示层节点（面包屑最后一层；没有结果返回 null） */
export function useCurrentNode(): ScanNode | null {
  return useScanStore((state) =>
    state.breadcrumb.length > 0 ? state.breadcrumb[state.breadcrumb.length - 1] : null
  )
}
