// 应用外壳：标题栏 + 侧栏 + 工作区（扫描栏/工具栏/视图/详情）+ 状态栏
// 这里是"拼装 + 全局快捷键 + 拖拽投放 + 主题落地"的地方，业务逻辑都在 store/lib

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScanStore } from './store/scanStore'
import { useSettingsStore } from './store/settingsStore'
import { useUiStore, toast } from './store/uiStore'
import { useStartScan } from './hooks/useStartScan'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { ScanBar } from './components/ScanBar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { DetailsPanel } from './components/DetailsPanel'
import { WelcomeScreen } from './components/WelcomeScreen'
import { ScanningPanel } from './components/ScanningPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { AboutDialog } from './components/AboutDialog'
import { SkippedDialog } from './components/SkippedDialog'
import { TrashConfirm } from './components/TrashConfirm'
import { ToastHost } from './components/ui/ToastHost'
import { TreemapView } from './components/views/TreemapView'
import { SunburstView } from './components/views/SunburstView'
import { TypesView } from './components/views/TypesView'
import { ByTypeView } from './components/views/ByTypeView'
import { BigFilesView } from './components/views/BigFilesView'
import { FoldersView } from './components/views/FoldersView'
import { CleanupView } from './components/views/CleanupView'
import { TrashView } from './components/views/TrashView'
import { TrashProgressBar } from './components/TrashProgress'
import { Icon } from './components/icons'
import { exportReport } from './lib/exportReport'
import { formatBytes } from '../../shared/format'
import { parentDirOf } from '../../shared/paths'

function App(): React.JSX.Element {
  const init = useSettingsStore((state) => state.init)
  const dark = useSettingsStore((state) => state.dark)
  const rememberPath = useSettingsStore((state) => state.settings.rememberPath)
  const lastPath = useSettingsStore((state) => state.settings.lastPath)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const detailsOpen = useUiStore((state) => state.detailsOpen)
  const status = useScanStore((state) => state.status)
  const result = useScanStore((state) => state.result)
  const view = useScanStore((state) => state.view)
  const selected = useScanStore((state) => state.selected)
  const startScan = useStartScan()
  const [dragging, setDragging] = useState(false)

  // 主题落到 <html data-theme>：CSS 变量全套跟着换
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    root.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  // 一次性初始化：读设置 + 读磁盘容量
  useEffect(() => {
    void init()
  }, [init])

  // 窗口标题跟着当前扫描的根目录走（任务栏里也能看出在看哪个盘）
  const rootPath = useScanStore((state) => state.result?.root.path)
  useEffect(() => {
    document.title = rootPath ? `DiskLens — ${rootPath}` : 'DiskLens'
  }, [rootPath])

  // 扫描进程 → 主进程 → 这里
  useEffect(() => {
    const offProgress = window.api.onScanProgress((progress) =>
      useScanStore.getState().setProgress(progress)
    )
    const offDone = window.api.onScanDone((scanResult) => {
      useScanStore.getState().setDone(scanResult)
      toast(
        'ok',
        `扫描完成：${formatBytes(scanResult.root.size)}，用了 ${(
          scanResult.durationMs / 1000
        ).toFixed(1)} 秒`
      )
      // 扫完可用空间可能变了，顺手刷新一下磁盘列表
      void useSettingsStore.getState().refreshDrives()
    })
    const offError = window.api.onScanError((message) => {
      useScanStore.getState().setError(message)
      toast('err', message)
      void useSettingsStore.getState().refreshDrives()
    })
    const offCancelled = window.api.onScanCancelled(() => {
      useScanStore.getState().setCancelled()
      toast('info', '扫描已取消，没有保留半截结果')
    })
    // 批量删除的逐条进度 → 底部浮动进度条
    const offTrashProgress = window.api.onTrashProgress((progress) => {
      useUiStore.getState().setTrashProgress(progress)
    })
    return () => {
      offProgress()
      offDone()
      offError()
      offCancelled()
      offTrashProgress()
    }
  }, [])

  // 快捷键：Ctrl+O 选文件夹 / Ctrl+F 搜索 / F5 重扫 / Ctrl+, 设置 / Ctrl+E 导出
  //         Esc 关弹窗 / Backspace 或 Alt+← 返回上一层
  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null
      if (!element) return false
      const tag = element.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
    }

    const onKey = (event: KeyboardEvent): void => {
      const scan = useScanStore.getState()
      const ui = useUiStore.getState()
      const mod = event.ctrlKey || event.metaKey

      if (event.key === 'Escape') {
        if (ui.trashTargets) ui.clearTrash()
        else if (ui.skippedOpen) ui.closeSkipped()
        else if (ui.settingsOpen) ui.closeSettings()
        else if (ui.aboutOpen) ui.closeAbout()
        else if (scan.selected) scan.select(null)
        return
      }

      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void window.api.selectDirectory().then((picked) => {
          if (picked) void startScan(picked)
        })
        return
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        window.dispatchEvent(new Event('disklens:focus-search'))
        return
      }
      if (mod && event.key === ',') {
        event.preventDefault()
        ui.openSettings()
        return
      }
      if (mod && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        void exportReport()
        return
      }
      if (event.key === 'F5') {
        event.preventDefault()
        const target =
          scan.breadcrumb.length > 0 ? scan.breadcrumb[0].path : rememberPath ? lastPath : ''
        if (target) void startScan(target)
        else toast('info', '还没有扫过东西，先选一个磁盘或文件夹')
        return
      }
      if (
        (event.key === 'Backspace' || (event.altKey && event.key === 'ArrowLeft')) &&
        !isTyping(event.target)
      ) {
        if (scan.breadcrumb.length > 1) {
          event.preventDefault()
          scan.popTo(scan.breadcrumb.length - 2)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startScan, rememberPath, lastPath])

  // 拖拽文件夹进来就扫：拖拽只是"更方便的选目录"
  const handleDrop = useCallback(
    async (event: DragEvent): Promise<void> => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      const path = window.api.getPathForFile(file)
      if (!path) {
        toast('err', '拿不到这个文件的位置，试试用「选文件夹」按钮')
        return
      }
      // 拖进来的可能是文件：扫它所在的文件夹
      const check = await window.api.checkPath(path)
      const target = check.isDir ? path : parentDirOf(path)
      await startScan(target)
    },
    [startScan]
  )

  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDragging(true)
    }
    const onDragLeave = (event: DragEvent): void => {
      if (event.relatedTarget === null || event.clientX <= 0 || event.clientY <= 0)
        setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      void handleDrop(event)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleDrop])

  const content = useMemo(() => {
    if (status === 'scanning' && !result) return <ScanningPanel />
    if (view === 'trash') return <TrashView />
    if (!result) return <WelcomeScreen />
    switch (view) {
      case 'sunburst':
        return <SunburstView />
      case 'types':
        return <TypesView />
      case 'bytype':
        return <ByTypeView />
      case 'bigfiles':
        return <BigFilesView />
      case 'folders':
        return <FoldersView />
      case 'cleanup':
        return <CleanupView />
      case 'treemap':
      default:
        return <TreemapView />
    }
  }, [status, result, view])

  return (
    <div
      className={`app-shell${sidebarOpen ? '' : ' no-sidebar'}${detailsOpen ? '' : ' no-details'}`}
    >
      <TitleBar />
      <div className="app-body">
        {sidebarOpen && <Sidebar />}
        <main className="workspace">
          <ScanBar />
          {(result || view === 'trash') && <Toolbar />}
          <div className="workspace-main">
            <section className="canvas">{content}</section>
            {selected && detailsOpen && <DetailsPanel />}
          </div>
        </main>
      </div>
      <StatusBar />
      <ToastHost />
      <SettingsDialog />
      <AboutDialog />
      <SkippedDialog />
      <TrashConfirm />
      <TrashProgressBar />
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            <Icon name="folderOpen" size={26} />
            <b>松开就开始扫描这个文件夹</b>
            <span>只会读取文件大小，不会动你的文件</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
