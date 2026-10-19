import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  DriveInfo,
  ExportPayload,
  ScanProgress,
  ScanResult,
  TrashOutcome
} from '../shared/types'
import type { PathCheckResult } from '../shared/paths'
import type { PreviewResult } from '../shared/previewKinds'

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

/** 渲染层可见的 preload API（与 src/preload/index.ts 的 api 对象一一对应） */
export interface DiskLensApi {
  selectDirectory: () => Promise<string | null>
  checkPath: (targetPath: string) => Promise<PathCheckResult>
  listDrives: () => Promise<DriveInfo[]>
  onDrivesUpdated: (cb: (drives: DriveInfo[]) => void) => () => void
  startScan: (rootPath: string, excludeNames?: string[]) => Promise<ScanStartResult>
  cancelScan: () => void
  onScanProgress: (cb: (progress: ScanProgress) => void) => () => void
  onScanDone: (cb: (result: ScanResult) => void) => () => void
  onScanError: (cb: (message: string) => void) => () => void
  onScanCancelled: (cb: () => void) => () => void
  locateFile: (path: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  trashFiles: (paths: string[]) => Promise<TrashOutcome[]>
  previewFile: (path: string) => Promise<PreviewResult>
  getSettings: () => Promise<AppSettings>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  exportReport: (payload: ExportPayload) => Promise<string | null>
  showNodeMenu: (path: string, type: 'file' | 'dir' | 'other') => Promise<string | null>
  appInfo: () => Promise<AppInfo>
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DiskLensApi
  }
}
