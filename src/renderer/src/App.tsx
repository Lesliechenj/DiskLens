// 应用外壳：标题栏 + 侧栏 + 工作区（扫描栏/工具栏/视图/详情）+ 状态栏
// 这里是"拼装 + 全局快捷键 + 拖拽投放 + 主题落地"的地方，业务逻辑都在 store/lib

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScanStore } from './store/scanStore'
import { useSettingsStore } from './store/settingsStore'
import { useDuplicateStore } from './store/duplicateStore'
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
import { HelpDialog } from './components/HelpDialog'
import { SkippedDialog } from './components/SkippedDialog'
import { TrashConfirm } from './components/TrashConfirm'
import { CleanupReportDialog } from './components/CleanupReportDialog'
import { CleanupWizard } from './components/CleanupWizard'
import { GuideBar } from './components/GuideBar'
import { ToastHost } from './components/ui/ToastHost'
import { TreemapView } from './components/views/TreemapView'
import { SunburstView } from './components/views/SunburstView'
import { TreeView } from './components/views/TreeView'
import { TypesView } from './components/views/TypesView'
import { ByTypeView } from './components/views/ByTypeView'
import { BigFilesView } from './components/views/BigFilesView'
import { FoldersView } from './components/views/FoldersView'
import { AgeView } from './components/views/AgeView'
import { DuplicateView } from './components/views/DuplicateView'
import { ArchivesView } from './components/views/ArchivesView'
import { CleanupView } from './components/views/CleanupView'
import { TrashView } from './components/views/TrashView'
import { TrashProgressBar } from './components/TrashProgress'
import { Icon } from './components/icons'
import { exportReport } from './lib/exportReport'
import { formatBytes } from '../../shared/format'
import { parentDirOf, splitUserPaths } from '../../shared/paths'

function App(): React.JSX.Element {
  const init = useSettingsStore((state) => state.init)
  const dark = useSettingsStore((state) => state.dark)
  const rememberPath = useSettingsStore((state) => state.settings.rememberPath)
  const lastPath = useSettingsStore((state) => state.settings.lastPath)
  const beginnerMode = useSettingsStore((state) => state.settings.beginnerMode)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const detailsOpen = useUiStore((state) => state.detailsOpen)
  const wizardOpen = useUiStore((state) => state.wizardOpen)
  const status = useScanStore((state) => state.status)
  const result = useScanStore((state) => state.result)
  const view = useScanStore((state) => state.view)
  const scanId = useScanStore((state) => state.scanId)
  const selected = useScanStore((state) => state.selected)
  const startScan = useStartScan()
  const [dragging, setDragging] = useState(false)

  // 主题 + 新手模式落到 <html>：CSS 变量和字号一起切
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.beginner = beginnerMode ? 'true' : 'false'
    root.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark, beginnerMode])

  // 一次性初始化：读设置 + 磁盘容量 + 上次扫描快照
  // 新手向导不自动弹（会挡住用户操作）；欢迎页和顶部引导条都有明显入口
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await init()
      if (cancelled) return
      const meta = await window.api.getLatestSnapshot().catch(() => null)
      if (cancelled) return
      useScanStore.getState().setSnapshotMeta(meta)
    })()
    return () => {
      cancelled = true
    }
  }, [init])

  // 窗口标题跟着当前扫描的根目录走（多盘时显示"全部磁盘"）
  const resultRoots = useScanStore((state) => state.result?.roots)
  useEffect(() => {
    const title =
      resultRoots && resultRoots.length > 0 ? `DiskLens — ${resultRoots.join(' · ')}` : 'DiskLens'
    document.title = title
  }, [resultRoots])

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
    // 查重进度 → 查重视图（结果跨视图保留，所以订阅放在 App 层）
    const offDuplicateProgress = window.api.onDuplicateProgress((progress) => {
      useDuplicateStore.getState().setProgress(progress)
    })
    const offSnapshot = window.api.onSnapshotSaved((meta) => {
      useScanStore.getState().setSnapshotMeta(meta)
    })
    return () => {
      offProgress()
      offDone()
      offError()
      offCancelled()
      offTrashProgress()
      offDuplicateProgress()
      offSnapshot()
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
        if (ui.cleanupReport) ui.closeCleanupReport()
        else if (ui.wizardOpen) ui.closeWizard()
        else if (ui.trashTargets) ui.clearTrash()
        else if (ui.skippedOpen) ui.closeSkipped()
        else if (ui.settingsOpen) ui.closeSettings()
        else if (ui.aboutOpen) ui.closeAbout()
        else if (ui.helpOpen) ui.closeHelp()
        else if (scan.selected) scan.select(null)
        return
      }

      if (event.key === 'F1') {
        event.preventDefault()
        ui.openHelp()
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
        const roots =
          scan.result?.roots && scan.result.roots.length > 0
            ? scan.result.roots
            : rememberPath
              ? splitUserPaths(lastPath)
              : []
        if (roots.length > 0) void startScan(roots)
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
      case 'tree':
        // key：换一轮扫描就重挂载，目录树回到"根展开"的初始状态
        return <TreeView key={scanId} />
      case 'types':
        return <TypesView />
      case 'bytype':
        return <ByTypeView />
      case 'bigfiles':
        return <BigFilesView />
      case 'folders':
        return <FoldersView />
      case 'age':
        return <AgeView />
      case 'duplicates':
        return <DuplicateView />
      case 'archives':
        return <ArchivesView />
      case 'cleanup':
        return <CleanupView />
      case 'treemap':
      default:
        return <TreemapView />
    }
  }, [status, result, view, scanId])

  return (
    <div
      className={`app-shell${sidebarOpen ? '' : ' no-sidebar'}${detailsOpen ? '' : ' no-details'}`}
    >
      <TitleBar />
      <div className="app-body">
        {sidebarOpen && <Sidebar />}
        <main className="workspace">
          <ScanBar />
          <GuideBar />
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
      <HelpDialog />
      <SkippedDialog />
      <TrashConfirm />
      <CleanupReportDialog />
      {wizardOpen && <CleanupWizard />}
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
