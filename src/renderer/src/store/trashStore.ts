// 回收站数据：列出系统回收站里有什么、能还原哪些、能不能清空
// 只有"打开回收站视图"或"删完东西"时才去读，避免每次启动都扫一遍磁盘

import { create } from 'zustand'
import type { TrashEntry, TrashListing } from '../../../shared/types'
import { toast } from './uiStore'
import { friendlyError } from '../lib/errors'

interface TrashState {
  listing: TrashListing | null
  loading: boolean
  error: string | null
  /** 上次读取时间 */
  loadedAt: number
  /** 正在还原的条目 id */
  restoringIds: string[]
  refresh: () => Promise<void>
  restore: (entries: TrashEntry[]) => Promise<void>
  empty: () => Promise<void>
  openFolder: () => Promise<void>
}

export const useTrashStore = create<TrashState>((set, get) => ({
  listing: null,
  loading: false,
  error: null,
  loadedAt: 0,
  restoringIds: [],

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const listing = await window.api.listTrash()
      set({ listing, loading: false, loadedAt: Date.now() })
    } catch (error) {
      set({ loading: false, error: friendlyError('读取回收站', error) })
    }
  },

  restore: async (entries) => {
    if (entries.length === 0) return
    set({ restoringIds: entries.map((entry) => entry.id) })
    try {
      const outcomes = await window.api.restoreTrash(entries)
      const ok = outcomes.filter((item) => item.ok).length
      const failed = outcomes.filter((item) => !item.ok)
      if (ok > 0) toast('ok', `已还原 ${ok} 项`)
      if (failed.length > 0) {
        toast('err', `${failed.length} 项没还原成功：${failed[0].message ?? '未知原因'}`)
      }
      await get().refresh()
    } catch (error) {
      toast('err', friendlyError('还原', error))
    } finally {
      set({ restoringIds: [] })
    }
  },

  empty: async () => {
    try {
      const result = await window.api.emptyTrash()
      if (result.ok) {
        toast('ok', '回收站已清空')
        await get().refresh()
      } else {
        toast('err', `清空回收站失败：${result.message ?? '系统拒绝了这次操作'}`)
      }
    } catch (error) {
      toast('err', friendlyError('清空回收站', error))
    }
  },

  openFolder: async () => {
    try {
      const result = await window.api.openTrashFolder()
      if (!result.ok) toast('err', `打不开回收站：${result.message ?? '未知原因'}`)
    } catch (error) {
      toast('err', friendlyError('打开回收站', error))
    }
  }
}))
