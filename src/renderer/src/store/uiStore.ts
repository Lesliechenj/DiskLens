// 界面瞬时状态：toast 提示、弹窗开关、删除确认的对象
// 与"数据"无关，放这里免得污染扫描/设置两个 store

import { create } from 'zustand'
import type { ScanNode, TrashProgress } from '../../../shared/types'

export type ToastKind = 'ok' | 'err' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  text: string
}

interface UiState {
  toasts: Toast[]
  pushToast: (kind: ToastKind, text: string, ms?: number) => void
  dismissToast: (id: number) => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
  aboutOpen: boolean
  openAbout: () => void
  closeAbout: () => void
  /** 被跳过的路径清单弹窗（无权限等） */
  skippedOpen: boolean
  openSkipped: () => void
  closeSkipped: () => void
  /** 详情面板是否展开（窄屏时是小抽屉） */
  detailsOpen: boolean
  toggleDetails: (open?: boolean) => void
  /** 侧栏折叠（图更大的时候） */
  sidebarOpen: boolean
  toggleSidebar: (open?: boolean) => void
  /** 待确认删除的节点（统一走一个确认弹窗，别处只管发起） */
  trashTargets: ScanNode[] | null
  requestTrash: (nodes: ScanNode[]) => void
  clearTrash: () => void
  /** 批量移到回收站的实时进度（null = 没有进行中的操作） */
  trashProgress: TrashProgress | null
  setTrashProgress: (progress: TrashProgress | null) => void
}

let toastSeq = 0

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  pushToast: (kind, text, ms = 4200) => {
    const id = ++toastSeq
    set((state) => ({ toasts: [...state.toasts, { id, kind, text }].slice(-4) }))
    if (ms > 0) {
      window.setTimeout(() => {
        if (get().toasts.some((toast) => toast.id === id)) get().dismissToast(id)
      }, ms)
    }
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  aboutOpen: false,
  openAbout: () => set({ aboutOpen: true }),
  closeAbout: () => set({ aboutOpen: false }),
  skippedOpen: false,
  openSkipped: () => set({ skippedOpen: true }),
  closeSkipped: () => set({ skippedOpen: false }),
  detailsOpen: true,
  toggleDetails: (open) => set((state) => ({ detailsOpen: open ?? !state.detailsOpen })),
  sidebarOpen: true,
  toggleSidebar: (open) => set((state) => ({ sidebarOpen: open ?? !state.sidebarOpen })),
  trashTargets: null,
  requestTrash: (nodes) =>
    set((state) => {
      if (!nodes || nodes.length === 0) return { trashTargets: null }
      // 已经有确认弹窗开着就排队追加，不吞掉用户的第二次请求
      if (state.trashTargets && state.trashTargets.length > 0) {
        const merged = [...state.trashTargets]
        for (const node of nodes) {
          if (!merged.some((item) => item.path === node.path)) merged.push(node)
        }
        return { trashTargets: merged }
      }
      return { trashTargets: nodes }
    }),
  clearTrash: () => set({ trashTargets: null }),
  trashProgress: null,
  setTrashProgress: (progress) => set({ trashProgress: progress })
}))

/** 便捷调用：组件里一行拿到 toast 方法 */
export function toast(kind: ToastKind, text: string): void {
  useUiStore.getState().pushToast(kind, text)
}
