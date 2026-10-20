import { contextBridge, ipcRenderer } from 'electron'
import { ScanCancelledError, scanPaths } from './scan'
import type { ScanProgress, ScanResult } from '../shared/types'

/**
 * 扫描进程预加载脚本（运行在隐藏窗口中）。
 * 扫描逻辑放在 preload 而不是页面脚本里：preload 永远拥有完整 Node 权限
 * （fs / path），不受渲染进程 nodeIntegration 限制。
 */

// 进度上报节流：每 150ms 最多一条，避免高频 IPC 拖慢扫描本身
const PROGRESS_INTERVAL_MS = 150

/** 当前扫描是否被用户取消（主进程发 scan:cancel 置位） */
let cancelRequested = false

/** 扫描进程 IPC 桥（暴露给隐藏窗口页面） */
const scanBridge = {
  sendProgress: (progress: ScanProgress): void => {
    ipcRenderer.send('scan:progress', progress)
  },
  sendDone: (result: ScanResult): void => {
    ipcRenderer.send('scan:done', result)
  },
  sendError: (message: string): void => {
    ipcRenderer.send('scan:error', message)
  },
  sendCancelled: (): void => {
    ipcRenderer.send('scan:cancelled')
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('scanBridge', scanBridge)
} else {
  // @ts-ignore (define in dts)
  window.scanBridge = scanBridge
}

// 主进程可以随时叫停（用户点了"取消扫描"）
ipcRenderer.on('scan:cancel', () => {
  cancelRequested = true
})

// 监听主进程下发的扫描指令，执行扫描并回传进度/结果
// rootPaths 兼容旧的单路径字符串；新版本传数组（多盘一起扫）
ipcRenderer.on(
  'scan:run',
  async (_event, input: string | string[], excludeNames: string[] = []) => {
    const rootPaths = Array.isArray(input) ? input : [input]
    cancelRequested = false
    let lastSentAt = 0
    try {
      const result = await scanPaths(
        rootPaths,
        (progress) => {
          const now = Date.now()
          if (now - lastSentAt >= PROGRESS_INTERVAL_MS) {
            lastSentAt = now
            scanBridge.sendProgress({ ...progress })
          }
        },
        { excludeNames, shouldStop: () => cancelRequested }
      )
      // 取消发生在最后一个目录之后也算取消：结果不完整，不能当成功交付
      if (cancelRequested) {
        scanBridge.sendCancelled()
        return
      }
      scanBridge.sendDone(result)
    } catch (error) {
      if (error instanceof ScanCancelledError || cancelRequested) {
        scanBridge.sendCancelled()
        return
      }
      scanBridge.sendError(error instanceof Error ? error.message : String(error))
    }
  }
)
