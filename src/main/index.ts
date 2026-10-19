import { app, shell, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } from 'electron'
import { promises as fs, appendFileSync } from 'fs'
import { basename, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type {
  AppSettings,
  DriveInfo,
  ExportPayload,
  ScanProgress,
  ScanResult,
  TrashOutcome
} from '../shared/types'
import type { PathCheckResult } from '../shared/paths'
import { pushRecentPath } from '../shared/settings'
import { imageMime, previewKind, TEXT_HEAD_BYTES, type PreviewKind } from '../shared/previewKinds'
import { listDrives, enrichDrives } from './drives'
import { currentSettings, flushSettings, loadSettings, updateSettings } from './settings'
import { exportReport } from './report'

// 关闭硬件加速：部分老旧机器/虚拟机/远程桌面环境下 GPU 进程会直接崩溃
// 导致整个应用闪退（FATAL: GPU process isn't usable）。
// DiskLens 渲染以 DOM/SVG 图表为主，软件渲染影响可接受，兼容性优先。
app.disableHardwareAcceleration()

// 极端环境（GPU 独立进程必崩的虚拟机/远程桌面）逃生开关：
// 设置 DISKLENS_SOFTWARE_GPU=1 后改用进程内 GPU，牺牲性能保启动。
if (process.env.DISKLENS_SOFTWARE_GPU) {
  app.commandLine.appendSwitch('in-process-gpu')
}

/**
 * 崩溃留痕：主进程的异常写进 userData/disklens-crash.log。
 * 打包后的应用没有控制台，出了问题只能靠这个文件排查（也方便用户反馈时贴给我们）。
 */
function logCrash(scope: string, error: unknown): void {
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)
  try {
    appendFileSync(
      join(app.getPath('userData'), 'disklens-crash.log'),
      `[${new Date().toISOString()}] ${scope}\n${detail}\n\n`,
      'utf8'
    )
  } catch {
    // 连日志都写不了就算了，别在崩溃处理里再崩一次
  }
  console.error(`[DiskLens] ${scope}`, error)
}

process.on('uncaughtException', (error) => logCrash('uncaughtException', error))
process.on('unhandledRejection', (reason) => logCrash('unhandledRejection', reason))

// 受限环境（容器/安全沙箱，network service 子进程被限制而崩溃：
// "Network service crashed or was terminated"）逃生开关：
// 设置 DISKLENS_NO_SANDBOX=1 关掉 Chromium 进程沙箱。
// 普通 Windows 机器不需要——默认保持沙箱开启，只有极端环境显式打开。
if (process.env.DISKLENS_NO_SANDBOX) {
  app.commandLine.appendSwitch('no-sandbox')
}

const isMac = process.platform === 'darwin'

/** 标题栏配色（跟随主题）：自定义标题栏 + 系统窗口按钮叠层 */
const TITLEBAR_COLORS = {
  dark: { background: '#101319', symbol: '#c9d3e4', window: '#0d0f14' },
  light: { background: '#ffffff', symbol: '#3d4657', window: '#f4f6fb' }
} as const

let mainWindow: BrowserWindow | null = null
// 隐藏的扫描进程窗口：独立进程跑 fs 遍历，不卡 UI（抄 Space Radar 已验证架构）
let scannerWindow: BrowserWindow | null = null
/** 扫描进程是否已经加载完（早于加载完成的扫描请求先排队） */
let scannerReady = false
let pendingScan: { rootPath: string; excludeNames: string[] } | null = null
/** 同一时间只允许一个扫描任务 */
let scanning = false

function isDarkTheme(theme: AppSettings['theme']): boolean {
  if (theme === 'system') return nativeTheme.shouldUseDarkColors
  return theme !== 'light'
}

function applyTheme(theme: AppSettings['theme']): void {
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme
  if (!mainWindow || mainWindow.isDestroyed()) return
  const palette = TITLEBAR_COLORS[isDarkTheme(theme) ? 'dark' : 'light']
  mainWindow.setBackgroundColor(palette.window)
  if (!isMac) {
    try {
      mainWindow.setTitleBarOverlay({
        color: palette.background,
        symbolColor: palette.symbol,
        height: 44
      })
    } catch {
      // 老系统不支持 overlay：用原生边框兜底，不影响功能
    }
  }
}

function createWindow(): void {
  const settings = currentSettings()
  const bounds = settings.windowBounds
  const dark = isDarkTheme(settings.theme)
  const palette = TITLEBAR_COLORS[dark ? 'dark' : 'light']

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: palette.window,
    autoHideMenuBar: true,
    title: 'DiskLens',
    // 自定义标题栏：把系统标题栏让出来，做成工具自己的顶栏（搜索框 + 主题切换）
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 15 } }
      : {
          titleBarOverlay: { color: palette.background, symbolColor: palette.symbol, height: 44 }
        }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false
    }
  })

  if (bounds?.maximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 窗口尺寸/位置记忆：拖动、缩放都用防抖，退出前再存一次
  let boundsTimer: NodeJS.Timeout | null = null
  const rememberBounds = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const maximized = mainWindow.isMaximized()
      const rect = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
      updateSettings({
        windowBounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          maximized
        }
      })
    }, 500)
  }
  mainWindow.on('resize', rememberBounds)
  mainWindow.on('move', rememberBounds)
  mainWindow.on('maximize', rememberBounds)
  mainWindow.on('unmaximize', rememberBounds)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 创建隐藏的扫描进程窗口（餐厅比喻里的"后厨"）
function createScannerWindow(): void {
  scannerReady = false
  scannerWindow = new BrowserWindow({
    show: false, // 隐藏窗口，用户不可见
    webPreferences: {
      preload: join(__dirname, '../preload/scanner.js'),
      sandbox: false
    }
  })
  scannerWindow.webContents.on('did-finish-load', () => {
    scannerReady = true
    if (pendingScan) {
      const job = pendingScan
      pendingScan = null
      scannerWindow?.webContents.send('scan:run', job.rootPath, job.excludeNames)
    }
  })
  scannerWindow.on('closed', () => {
    scannerWindow = null
    scannerReady = false
  })
  void scannerWindow.loadFile(join(__dirname, '../renderer/scanner/index.html'))
}

/** 把扫描任务交给扫描进程（没加载完就先排队） */
function dispatchScan(rootPath: string, excludeNames: string[]): void {
  if (!scannerWindow || scannerWindow.isDestroyed()) {
    createScannerWindow()
  }
  if (scannerReady && scannerWindow) {
    scannerWindow.webContents.send('scan:run', rootPath, excludeNames)
  } else {
    pendingScan = { rootPath, excludeNames }
  }
}

function sendToMain(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

/** 批量移到回收站：逐个尝试，单个失败不打断其余（返回逐条结果） */
async function trashMany(paths: unknown): Promise<TrashOutcome[]> {
  const list = Array.isArray(paths) ? paths : [paths]
  const outcomes: TrashOutcome[] = []
  for (const item of list) {
    const path = typeof item === 'string' ? item.trim() : ''
    if (!path) {
      // shell.trashItem('') 不报错也不返回——直接挂死（实测卡 4 分钟），必须挡在前面
      outcomes.push({ path, ok: false, message: '文件路径是空的，这个操作没法做' })
      continue
    }
    try {
      await shell.trashItem(path)
      outcomes.push({ path, ok: true })
    } catch (error) {
      outcomes.push({
        path,
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return outcomes
}

/** 预览单个文件：图片 → dataURL（≤10MB）；文本 → 头部 8KB；其他/超限 → 不预览 */
async function readPreview(path: string): Promise<unknown> {
  try {
    const stat = await fs.stat(path)
    if (!stat.isFile()) return { kind: 'none' as PreviewKind }
    const kind = previewKind(basename(path), stat.size)
    if (kind === 'image') {
      const buf = await fs.readFile(path)
      return {
        kind,
        dataUrl: `data:${imageMime(path)};base64,${buf.toString('base64')}`,
        bytes: stat.size
      }
    }
    if (kind === 'text') {
      const fh = await fs.open(path, 'r')
      try {
        const { buffer } = await fh.read(Buffer.alloc(TEXT_HEAD_BYTES), 0, TEXT_HEAD_BYTES, 0)
        return { kind, text: buffer.toString('utf8'), bytes: stat.size }
      } finally {
        await fh.close()
      }
    }
    return { kind, bytes: stat.size }
  } catch (error) {
    return {
      kind: 'error' as PreviewKind,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

// 单实例锁：避免开一堆窗口互相打架（E2E/多实例调试可关：DISKLENS_ALLOW_MULTI=1）
const gotLock = process.env.DISKLENS_ALLOW_MULTI ? true : app.requestSingleInstanceLock()
if (!gotLock) {
  // 已经开着一个 DiskLens：把旧窗口叫到前台，自己退出（成熟软件的基本礼貌）
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app
    .whenReady()
    .then(async () => {
      electronApp.setAppUserModelId('com.disklens.app')
      // 自定义标题栏与界面内菜单按钮：去掉系统菜单，避免两套菜单打架
      if (!isMac) Menu.setApplicationMenu(null)

      await loadSettings()
      applyTheme(currentSettings().theme)

      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
      })

      createWindow()
      createScannerWindow()

      // ---- 设置 ----
      ipcMain.handle('settings:get', () => currentSettings())
      ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
        const next = updateSettings(patch ?? {})
        if (patch?.theme) applyTheme(next.theme)
        return next
      })

      // ---- 磁盘列表 ----
      // 先把 statfs 的快速结果给出去，卷标在后台补好再推一次（首屏不用等 WMI）
      ipcMain.handle('drives:list', async (): Promise<DriveInfo[]> => {
        const quick = await listDrives()
        void enrichDrives(quick)
          .then((enriched) => {
            const changed = enriched.some(
              (drive, index) =>
                drive.volumeName !== quick[index]?.volumeName ||
                drive.removable !== quick[index]?.removable
            )
            if (changed) sendToMain('drives:updated', enriched)
          })
          .catch(() => undefined)
        return quick
      })

      // ---- 选择目录 ----
      ipcMain.handle('dialog:openDirectory', async () => {
        const result = mainWindow
          ? await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: '选择要扫描的目录'
            })
          : await dialog.showOpenDialog({
              properties: ['openDirectory'],
              title: '选择要扫描的目录'
            })
        return result.canceled ? null : result.filePaths[0]
      })

      // ---- 路径校验（新手把「C盘」当路径是常态，先问一句"这路径对吗"）----
      ipcMain.handle('path:check', async (_event, targetPath: string): Promise<PathCheckResult> => {
        try {
          const stat = await fs.stat(targetPath)
          return { exists: true, isDir: stat.isDirectory() }
        } catch {
          return { exists: false, isDir: false }
        }
      })

      // ---- 扫描 ----
      ipcMain.handle('scan:start', (_event, rootPath: string, excludeNames: string[] = []) => {
        if (scanning) return { ok: false, message: '已经有一次扫描在跑了，先等它结束或取消' }
        scanning = true
        const settings = updateSettings({
          lastPath: rootPath,
          recentPaths: pushRecentPath(currentSettings().recentPaths, rootPath)
        })
        dispatchScan(rootPath, Array.isArray(excludeNames) ? excludeNames : [])
        return { ok: true, recentPaths: settings.recentPaths }
      })
      ipcMain.on('scan:cancel', () => {
        scannerWindow?.webContents.send('scan:cancel')
      })

      // 扫描进程 → 主进程 → 渲染层
      ipcMain.on('scan:progress', (_event, progress: ScanProgress) => {
        sendToMain('scan:progress', progress)
      })
      ipcMain.on('scan:done', (_event, result: ScanResult) => {
        scanning = false
        sendToMain('scan:done', result)
      })
      ipcMain.on('scan:error', (_event, message: string) => {
        scanning = false
        sendToMain('scan:error', message)
      })
      ipcMain.on('scan:cancelled', () => {
        scanning = false
        sendToMain('scan:cancelled')
      })

      // ---- 文件操作：定位 / 打开 / 回收站（唯一删除路径） ----
      ipcMain.handle('file:locate', async (_event, path: string) => {
        if (typeof path !== 'string' || !path.trim())
          throw new Error('文件路径是空的，这个操作没法做')
        shell.showItemInFolder(path)
      })
      ipcMain.handle('file:open', async (_event, path: string) => {
        if (typeof path !== 'string' || !path.trim())
          throw new Error('文件路径是空的，这个操作没法做')
        const error = await shell.openPath(path)
        if (error) throw new Error(error)
      })
      ipcMain.handle('file:trash', async (_event, paths: string[]) => trashMany(paths))

      // ---- 文件预览 ----
      ipcMain.handle('file:preview', (_event, path: string) => {
        if (typeof path !== 'string' || !path.trim()) {
          return { kind: 'error' as PreviewKind, message: '文件路径是空的' }
        }
        return readPreview(path)
      })

      // ---- 导出报告 ----
      ipcMain.handle('report:export', async (_event, payload: ExportPayload) =>
        exportReport(mainWindow, payload)
      )

      // ---- 右键菜单（原生菜单，桌面软件的基本手感）----
      ipcMain.handle(
        'menu:node',
        async (event, _path: string, type: 'file' | 'dir' | 'other'): Promise<string | null> => {
          const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
          if (!window) return null
          const isFile = type === 'file'
          return await new Promise<string | null>((resolve) => {
            let settled = false
            const pick = (action: string) => () => {
              settled = true
              resolve(action)
            }
            const template: Electron.MenuItemConstructorOptions[] = [
              { label: isFile ? '用默认程序打开' : '在资源管理器中打开', click: pick('open') },
              { label: '在资源管理器中定位', click: pick('locate') },
              { type: 'separator' },
              { label: '复制完整路径', click: pick('copy') },
              { label: '复制名称', click: pick('copy-name') },
              ...(isFile
                ? [
                    {
                      label: '只看这类文件',
                      click: pick('filter')
                    } as Electron.MenuItemConstructorOptions
                  ]
                : []),
              ...(type === 'dir'
                ? [
                    {
                      label: '进入这个目录',
                      click: pick('enter')
                    } as Electron.MenuItemConstructorOptions
                  ]
                : []),
              { type: 'separator' },
              { label: '移到回收站…', click: pick('trash') }
            ]
            const menu = Menu.buildFromTemplate(template)
            menu.popup({
              window,
              callback: () => {
                // 点空白处/按 Esc 关掉：没选任何东西
                if (!settled) resolve(null)
              }
            })
          })
        }
      )

      // ---- 应用信息 ----
      ipcMain.handle('app:info', () => ({
        version: app.getVersion(),
        platform: process.platform,
        electron: process.versions.electron,
        isDev: !!is.dev
      }))

      app.on('activate', function () {
        // macOS：点 Dock 图标且没有窗口时重开一个
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    })
    .catch((error) => {
      // 启动阶段就挂（比如资源缺失）：留痕 + 弹个人话对话框，别静默退出
      logCrash('whenReady', error)
      try {
        dialog.showErrorBox(
          'DiskLens 启动失败',
          `启动时出错了：${error instanceof Error ? error.message : String(error)}\n\n` +
            '详细日志在同目录的 disklens-crash.log。'
        )
      } catch {
        // 对话框都弹不出来就认了
      }
      app.quit()
    })

  app.on('before-quit', () => {
    void flushSettings()
  })

  app.on('window-all-closed', () => {
    // macOS 关闭窗口不退出（Dock 还在），其它平台直接退
    if (!isMac) app.quit()
  })
}
