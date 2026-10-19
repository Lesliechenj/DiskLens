import { ElectronAPI } from '@electron-toolkit/preload'
import type { ScanProgress, ScanResult } from '../shared/types'
import type { PreviewResult } from '../shared/previewKinds'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectDirectory: () => Promise<string | null>
      /** 发起扫描（excludeNames：排除清单，默认勾选的目录名） */
      startScan: (rootPath: string, excludeNames?: string[]) => void
      onScanProgress: (callback: (progress: ScanProgress) => void) => void
      onScanDone: (callback: (result: ScanResult) => void) => void
      onScanError: (callback: (message: string) => void) => void
      /** F5：在资源管理器中定位文件/目录 */
      locateFile: (path: string) => Promise<void>
      /** F5：移到回收站（唯一删除路径，主进程不提供直接删除） */
      trashFile: (path: string) => Promise<void>
      /** 文件预览：图片 dataURL / 文本头部 */
      previewFile: (path: string) => Promise<PreviewResult>
    }
  }
}
