import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  DriveInfo,
  ExportPayload,
  ScanProgress,
  ScanResult,
  TrashEntry,
  TrashListing,
  TrashOutcome,
  TrashProgress
} from '../shared/types'
import type { PathCheckResult } from '../shared/paths'
import type { PreviewResult } from '../shared/previewKinds'

/** 还原回收站条目的逐条结果 */
export interface RestoreOutcome {
  id: string
  ok: boolean
  message?: string
}

/** 扫描启动结果：失败的常见原因是"已经有一次扫描在跑" */
export interface ScanStartResult {
  ok: boolean
  message?: string
  recentPaths?: string[]
}

export interface AppInfo {
  version: string
  platform: string
  electron: string
  isDev: boolean
}

/** 订阅 IPC 并返回取消订阅函数（React effect 里直接 return 清理） */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/** 订阅无参数事件（取消扫描等） */
function subscribeVoid(channel: string, callback: () => void): () => void {
  const listener = (): void => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// Custom APIs for renderer
const api = {
  /** 打开系统目录选择对话框，返回目录路径或 null（取消） */
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  /** 扫描前校验路径：存在吗？是目录吗 */
  checkPath: (targetPath: string): Promise<PathCheckResult> =>
    ipcRenderer.invoke('path:check', targetPath),
  /** 枚举磁盘分区（首页磁盘列表：盘符 + 占用 + 可用） */
  listDrives: (): Promise<DriveInfo[]> => ipcRenderer.invoke('drives:list'),
  /** 卷标补齐后主进程会再推一次完整列表 */
  onDrivesUpdated: (cb: (drives: DriveInfo[]) => void): (() => void) =>
    subscribe('drives:updated', cb),
  /** 发起扫描（主进程转发给隐藏扫描进程） */
  startScan: (rootPath: string, excludeNames: string[] = []): Promise<ScanStartResult> =>
    ipcRenderer.invoke('scan:start', rootPath, excludeNames),
  /** 取消正在进行的扫描 */
  cancelScan: (): void => ipcRenderer.send('scan:cancel'),
  onScanProgress: (cb: (progress: ScanProgress) => void): (() => void) =>
    subscribe('scan:progress', cb),
  onScanDone: (cb: (result: ScanResult) => void): (() => void) => subscribe('scan:done', cb),
  onScanError: (cb: (message: string) => void): (() => void) => subscribe('scan:error', cb),
  onScanCancelled: (cb: () => void): (() => void) => subscribeVoid('scan:cancelled', cb),
  /** 在资源管理器中定位文件/目录 */
  locateFile: (path: string): Promise<void> => ipcRenderer.invoke('file:locate', path),
  /** 用系统默认程序打开文件 */
  openFile: (path: string): Promise<void> => ipcRenderer.invoke('file:open', path),
  /** 批量移到回收站（唯一删除路径，删前二次确认在渲染层） */
  trashFiles: (paths: string[]): Promise<TrashOutcome[]> => ipcRenderer.invoke('file:trash', paths),
  /** 文件预览：图片 dataURL / 文本头部 */
  previewFile: (path: string): Promise<PreviewResult> => ipcRenderer.invoke('file:preview', path),
  /** 读设置 */
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  /** 写设置（部分字段），返回合并后的完整设置 */
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', patch),
  /** 导出 CSV 报告，返回保存路径（取消返回 null） */
  exportReport: (payload: ExportPayload): Promise<string | null> =>
    ipcRenderer.invoke('report:export', payload),
  /** 右键菜单：返回用户选的动作（open/locate/copy/copy-name/filter/enter/trash），取消返回 null */
  showNodeMenu: (path: string, type: 'file' | 'dir' | 'other'): Promise<string | null> =>
    ipcRenderer.invoke('menu:node', path, type),
  /** 批量移到回收站的逐条进度 */
  onTrashProgress: (cb: (progress: TrashProgress) => void): (() => void) =>
    subscribe('trash:progress', cb),
  /** 列出系统回收站内容（自己删了哪些东西） */
  listTrash: (): Promise<TrashListing> => ipcRenderer.invoke('trash:list'),
  /** 还原回收站里的条目（原位置有同名文件就不覆盖） */
  restoreTrash: (entries: TrashEntry[]): Promise<RestoreOutcome[]> =>
    ipcRenderer.invoke('trash:restore', entries),
  /** 清空系统回收站（不可恢复） */
  emptyTrash: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('trash:empty'),
  /** 打开资源管理器里的回收站 */
  openTrashFolder: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('trash:open'),
  /** 应用版本信息 */
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  /** 拖拽进来的文件/文件夹 → 真实磁盘路径（Electron 32+ 必须走 webUtils） */
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  }
}

export type DiskLensApi = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add them to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
