// 统一的删除确认：详情面板、清理建议、右键菜单都走这一个弹窗
// 一处逻辑一处话术：只进回收站、可恢复、系统文件要额外提醒
// 需要管理员时只授权一次，整批交给主进程执行；完成后自动弹清理报告

import { useState } from 'react'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatBytes, formatCount } from '../../../shared/format'
import { needsAdminForPaths } from '../../../shared/paths'
import { RISK, riskOf } from '../../../shared/risk'
import { runCleanup, toCleanupTargets } from '../lib/cleanupRun'
import { ConfirmDialog } from './ui/ConfirmDialog'

export function TrashConfirm(): React.JSX.Element | null {
  const targets = useUiStore((state) => state.trashTargets)
  const label = useUiStore((state) => state.trashLabel)
  const groupId = useUiStore((state) => state.trashGroupId)
  const clearTrash = useUiStore((state) => state.clearTrash)
  const elevationMode = useSettingsStore((state) => state.settings.cleanupElevation)
  const [busy, setBusy] = useState(false)

  if (!targets || targets.length === 0) return null

  const totalSize = targets.reduce((sum, node) => sum + node.size, 0)
  const single = targets.length === 1 ? targets[0] : null
  const isDir = single?.type === 'dir'
  const hasDanger = targets.some((node) => riskOf(node).level === RISK.danger.level)
  const protectedCount = targets.filter((node) => needsAdminForPaths([node.path])).length
  const willElevate = elevationMode !== 'never' && protectedCount > 0
  const title = isDir
    ? '把整个文件夹移到回收站？'
    : targets.length > 1
      ? `把这 ${formatCount(targets.length)} 项移到回收站？`
      : '移到回收站确认'

  const lines = [
    single
      ? `确定把「${single.name}」移到回收站吗？（${formatBytes(totalSize)}）`
      : `合计 ${formatBytes(totalSize)}，一共 ${formatCount(targets.length)} 项。`,
    single ? `路径：${single.path}` : targets[0] ? `例如：${targets[0].path}` : '',
    isDir ? '文件夹里的所有内容都会一起进回收站。' : '文件不会立刻消失，可以从回收站恢复。',
    willElevate
      ? `其中 ${protectedCount} 项在系统目录，需要管理员权限：授权 1 次后整批完成，不会一项一项弹窗。`
      : '',
    hasDanger ? '注意：其中包含系统/程序文件，删除可能导致软件无法运行，建议改用卸载程序。' : '',
    '重要文件请自行备份。'
  ].filter(Boolean)

  const handleConfirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await runCleanup(toCleanupTargets(targets, label, groupId), {
        label: label || '',
        groupId: groupId || ''
      })
    } finally {
      setBusy(false)
      clearTrash()
    }
  }

  return (
    <ConfirmDialog
      title={title}
      lines={lines}
      confirmText={busy ? '清理中…' : willElevate ? '授权并清理' : '移到回收站'}
      tone="danger"
      busy={busy}
      onConfirm={() => void handleConfirm()}
      onCancel={clearTrash}
    />
  )
}
