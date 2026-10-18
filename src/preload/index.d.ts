import { ElectronAPI } from '@electron-toolkit/preload'
import type { ScanProgress, ScanResult } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectDirectory: () => Promise<string | null>
      startScan: (rootPath: string) => void
      onScanProgress: (callback: (progress: ScanProgress) => void) => void
      onScanDone: (callback: (result: ScanResult) => void) => void
      onScanError: (callback: (message: string) => void) => void
    }
  }
}
