import { contextBridge, ipcRenderer } from 'electron'
import { scanDirectory } from './scan'
import type { ScanProgress, ScanResult } from '../shared/types'

/**
 * 扫描进程预加载脚本（运行在隐藏窗口中）。
 * 扫描逻辑放在 preload 而不是页面脚本里：preload 永远拥有完整 Node 权限
 * （fs / path），不受渲染进程 nodeIntegration 限制。
 */

// 进度上报节流：每 200ms 最多一条，避免高频 IPC 拖慢扫描本身
const PROGRESS_INTERVAL_MS = 200

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
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('scanBridge', scanBridge)
} else {
  // @ts-ignore (define in dts)
  window.scanBridge = scanBridge
}

// 监听主进程下发的扫描指令，执行扫描并回传进度/结果
ipcRenderer.on('scan:run', async (_event, rootPath: string) => {
  let lastSentAt = 0
  try {
    const result = await scanDirectory(rootPath, (progress) => {
      const now = Date.now()
      if (now - lastSentAt >= PROGRESS_INTERVAL_MS) {
        lastSentAt = now
        scanBridge.sendProgress({ ...progress })
      }
    })
    scanBridge.sendDone(result)
  } catch (error) {
    scanBridge.sendError(error instanceof Error ? error.message : String(error))
  }
})
