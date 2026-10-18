import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { ScanProgress, ScanResult } from '../shared/types'

// 关闭硬件加速：部分老旧机器/虚拟机/远程桌面环境下 GPU 进程会直接崩溃
// 导致整个应用闪退（FATAL: GPU process isn't usable）。
// DiskLens 渲染以 DOM/SVG 图表为主，软件渲染影响可接受，兼容性优先。
app.disableHardwareAcceleration()

// 极端环境（GPU 独立进程必崩的虚拟机/远程桌面）逃生开关：
// 设置 DISKLENS_SOFTWARE_GPU=1 后改用进程内 GPU，牺牲性能保启动。
if (process.env.DISKLENS_SOFTWARE_GPU) {
  app.commandLine.appendSwitch('in-process-gpu')
}

let mainWindow: BrowserWindow | null = null
// 隐藏的扫描进程窗口：独立进程跑 fs 遍历，不卡 UI（抄 Space Radar 已验证架构）
let scannerWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'DiskLens',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 创建隐藏的扫描进程窗口（餐厅比喻里的"后厨"）
function createScannerWindow(): void {
  scannerWindow = new BrowserWindow({
    show: false, // 隐藏窗口，用户不可见
    webPreferences: {
      preload: join(__dirname, '../preload/scanner.js'),
      sandbox: false
    }
  })
  scannerWindow.loadFile(join(__dirname, '../renderer/scanner/index.html'))
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.disklens.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createScannerWindow()

  // IPC：渲染层选目录 → 主进程弹系统目录选择对话框
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择要扫描的目录'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // IPC：渲染层发起扫描 → 转发给扫描进程（带排除清单）
  ipcMain.on('scan:start', (_event, rootPath: string, excludeNames: string[] = []) => {
    scannerWindow?.webContents.send('scan:run', rootPath, excludeNames)
  })

  // IPC：扫描进程的进度/结果/失败 → 转发给渲染层
  ipcMain.on('scan:progress', (_event, progress: ScanProgress) => {
    mainWindow?.webContents.send('scan:progress', progress)
  })
  ipcMain.on('scan:done', (_event, result: ScanResult) => {
    mainWindow?.webContents.send('scan:done', result)
  })
  ipcMain.on('scan:error', (_event, message: string) => {
    mainWindow?.webContents.send('scan:error', message)
  })

  // IPC：F5 文件操作。唯一删除路径 = 回收站（shell.trashItem），
  // 不提供任何直接删除 API——删前弹二次确认由渲染层负责。
  ipcMain.handle('file:locate', async (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle('file:trash', async (_event, path: string) => {
    await shell.trashItem(path)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. On it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
