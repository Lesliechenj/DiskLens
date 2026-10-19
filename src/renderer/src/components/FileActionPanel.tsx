import { useCallback, useEffect, useRef, useState } from 'react'
import { useScanStore } from '../store/scanStore'
import { formatBytes, formatTime } from '../../../shared/format'
import type { PreviewResult } from '../../../shared/previewKinds'
import { extInfo } from '../lib/extDict'
import { friendlyError } from '../lib/errors'
import { riskOf } from '../lib/risk'
import { removeNode } from '../lib/treeOps'
import { ConfirmModal } from './ConfirmModal'

/**
 * F5 文件操作面板：选中 treemap 文件块 / 搜索命中后出现。
 * 两个操作：在资源管理器中显示（定位）、移到回收站（唯一删除路径）。
 * 图片/文本文件带预览——"我操作的到底是哪个文件"一眼可见。
 */
export function FileActionPanel(): React.JSX.Element | null {
  const { selectedFile, selectFile, result, resetView } = useScanStore()
  const [confirming, setConfirming] = useState(false)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<{ path: string; result: PreviewResult } | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  // 选中变化 → 拉预览（只对文件；目录不预览）。
  // 不在 effect 里同步清状态（React 19 规则）：渲染期按 path 派生，
  // 换个文件/换目录自然就不显示旧预览了。防串台：回来时对一下路径。
  useEffect(() => {
    if (!selectedFile || selectedFile.type !== 'file') return
    let stale = false
    const path = selectedFile.path
    window.api
      .previewFile(path)
      .then((result) => {
        if (!stale) setPreview({ path, result })
      })
      .catch(() => {
        if (!stale) setPreview({ path, result: { kind: 'error', message: '预览读取失败' } })
      })
    return () => {
      stale = true
    }
  }, [selectedFile])

  const activePreview =
    selectedFile?.type === 'file' && preview?.path === selectedFile.path ? preview.result : null

  const showFlash = useCallback((ok: boolean, text: string) => {
    setFlash({ ok, text })
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 4000)
  }, [])

  const handleLocate = useCallback(async () => {
    if (!selectedFile) return
    try {
      await window.api.locateFile(selectedFile.path)
    } catch (error) {
      showFlash(false, friendlyError('定位', error))
    }
  }, [selectedFile, showFlash])

  const handleTrash = useCallback(async () => {
    if (!selectedFile || !result) return
    setConfirming(false)
    try {
      // 唯一删除路径：回收站（主进程不提供直接删除 API）
      await window.api.trashFile(selectedFile.path)
      // 前端树摘除节点 + 沿链扣减大小，图表即时刷新
      removeNode(result.root, selectedFile.path)
      selectFile(null)
      resetView()
      showFlash(true, `已移到回收站：${selectedFile.name}`)
    } catch (error) {
      showFlash(false, friendlyError('移到回收站', error))
    }
  }, [selectedFile, result, selectFile, resetView, showFlash])

  if (!selectedFile) {
    return flash ? <p className={`action-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</p> : null
  }

  const risk = riskOf(selectedFile)
  const isDir = selectedFile.type === 'dir'

  return (
    <div className="action-panel">
      {confirming && (
        <ConfirmModal
          title={isDir ? '把整个目录移到回收站？' : '移到回收站确认'}
          message={
            `确定把「${selectedFile.name}」移到回收站吗？\n` +
            `路径：${selectedFile.path}\n` +
            `${isDir ? '目录内的所有文件都会一起进回收站。' : '文件不会立刻消失，可以从回收站恢复。'}\n` +
            `重要文件请自行备份。`
          }
          confirmText="移到回收站"
          danger
          onConfirm={handleTrash}
          onCancel={() => setConfirming(false)}
        />
      )}
      <div className="action-head">
        <span className={`risk-badge ${risk.level}`}>
          {risk.icon} {risk.label}
        </span>
        <span className="action-name" title={selectedFile.path}>
          {selectedFile.name}
        </span>
        <button className="action-close" onClick={() => selectFile(null)} title="关闭">
          ✕
        </button>
      </div>
      <p className="action-meta">
        {isDir ? '目录' : extInfo(selectedFile.name).label} · {formatBytes(selectedFile.size)} ·
        修改于 {formatTime(selectedFile.mtime)}
        <br />
        <span className="action-path">{selectedFile.path}</span>
      </p>

      {/* 文件预览：图片缩略图 / 文本头部 */}
      {!isDir && activePreview?.kind === 'image' && (
        <img className="preview-img" src={activePreview.dataUrl} alt={selectedFile.name} />
      )}
      {!isDir && activePreview?.kind === 'text' && (
        <pre className="preview-text">{activePreview.text.slice(0, 2000)}</pre>
      )}
      {!isDir && activePreview?.kind === 'toobig' && (
        <p className="preview-hint">文件较大，不预览了（怕卡）</p>
      )}
      {!isDir && activePreview?.kind === 'error' && (
        <p className="preview-hint">预览失败：{activePreview.message ?? '读不了这个文件'}</p>
      )}

      <p className="action-risk-hint">{risk.hint}</p>
      <div className="action-buttons">
        <button onClick={handleLocate}>在资源管理器中显示</button>
        <button className="danger" onClick={() => setConfirming(true)}>
          移到回收站
        </button>
      </div>
      {flash && <p className={`action-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</p>}
    </div>
  )
}
