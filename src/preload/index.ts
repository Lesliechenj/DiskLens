import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ScanProgress, ScanResult } from '../shared/types'

// Custom APIs for renderer
const api = {
  /** 打开系统目录选择对话框，返回目录路径或 null（取消） */
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  /** 发起扫描（主进程转发给隐藏扫描进程；excludeNames：排除清单，默认勾选的目录名） */
  startScan: (rootPath: string, excludeNames: string[] = []): void =>
    ipcRenderer.send('scan:start', rootPath, excludeNames),
  /** 订阅扫描进度 */
  onScanProgress: (callback: (progress: ScanProgress) => void): void => {
    ipcRenderer.on('scan:progress', (_event, progress: ScanProgress) => callback(progress))
  },
  /** 订阅扫描完成 */
  onScanDone: (callback: (result: ScanResult) => void): void => {
    ipcRenderer.on('scan:done', (_event, result: ScanResult) => callback(result))
  },
  /** 订阅扫描失败 */
  onScanError: (callback: (message: string) => void): void => {
    ipcRenderer.on('scan:error', (_event, message: string) => callback(message))
  },
  /** F5：在资源管理器中定位文件/目录 */
  locateFile: (path: string): Promise<void> => ipcRenderer.invoke('file:locate', path),
  /** F5：移到回收站（唯一删除路径，删前二次确认在渲染层） */
  trashFile: (path: string): Promise<void> => ipcRenderer.invoke('file:trash', path)
}

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
