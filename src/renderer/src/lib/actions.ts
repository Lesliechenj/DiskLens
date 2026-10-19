// 文件操作统一入口：定位 / 打开 / 批量回收站（错误翻译成人话 + toast）
// 表格、详情面板、清理建议都走这里，行为与话术保持一致

import type { TrashOutcome } from '../../../shared/types'
import { toast } from '../store/uiStore'
import { friendlyError } from './errors'

/** 在资源管理器中定位（失败给人话提示，不抛） */
export async function locatePath(path: string): Promise<boolean> {
  try {
    await window.api.locateFile(path)
    return true
  } catch (error) {
    toast('err', friendlyError('定位', error))
    return false
  }
}

/** 用系统默认程序打开（失败给人话提示，不抛） */
export async function openPath(path: string): Promise<boolean> {
  try {
    await window.api.openFile(path)
    return true
  } catch (error) {
    toast('err', friendlyError('打开', error))
    return false
  }
}

/** 复制文本到剪贴板（Electron 渲染层用 navigator.clipboard） */
export async function copyText(text: string, label = '路径'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast('ok', `已复制${label}`)
  } catch {
    toast('err', `复制${label}失败，可以手动选中复制`)
  }
}

/** 批量移到回收站：返回逐条结果，调用方负责提示与刷新 */
export async function trashPaths(paths: string[]): Promise<TrashOutcome[]> {
  const list = paths.filter((path) => path.trim() !== '')
  if (list.length === 0) return []
  try {
    return await window.api.trashFiles(list)
  } catch (error) {
    const message = friendlyError('移到回收站', error)
    return list.map((path) => ({ path, ok: false, message }))
  }
}
