// 统一的删除确认：详情面板、清理建议、右键菜单都走这一个弹窗
// 一处逻辑一处话术：只进回收站、可恢复、系统文件要额外提醒

import { useState } from 'react'
import { useUiStore } from '../store/uiStore'
import { useScanStore } from '../store/scanStore'
import { toast } from '../store/uiStore'
import { formatBytes, formatCount } from '../../../shared/format'
import { baseNameOf } from '../../../shared/paths'
import { RISK, riskOf } from '../../../shared/risk'
import { trashPaths } from '../lib/actions'
import { ConfirmDialog } from './ui/ConfirmDialog'

export function TrashConfirm(): React.JSX.Element | null {
  const targets = useUiStore((state) => state.trashTargets)
  const clearTrash = useUiStore((state) => state.clearTrash)
  const removePaths = useScanStore((state) => state.removePaths)
  const select = useScanStore((state) => state.select)
  const [busy, setBusy] = useState(false)

  if (!targets || targets.length === 0) return null

  const totalSize = targets.reduce((sum, node) => sum + node.size, 0)
  const single = targets.length === 1 ? targets[0] : null
  const isDir = single?.type === 'dir'
  const hasDanger = targets.some((node) => riskOf(node).level === RISK.danger.level)
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
    hasDanger ? '⚠️ 其中包含系统/程序文件，删除可能导致软件无法运行，建议改用卸载程序。' : '',
    '重要文件请自行备份。'
  ].filter(Boolean)

  const handleConfirm = async (): Promise<void> => {
    setBusy(true)
    try {
      const outcomes = await trashPaths(targets.map((node) => node.path))
      const ok = outcomes.filter((outcome) => outcome.ok)
      const failed = outcomes.filter((outcome) => !outcome.ok)
      if (ok.length > 0) {
        const result = removePaths(ok.map((item) => item.path))
        select(null)
        toast(
          'ok',
          `已移到回收站：${formatCount(ok.length)} 项，腾出 ${formatBytes(result.freedBytes)}`
        )
      }
      if (failed.length > 0) {
        const name = baseNameOf(failed[0].path) || failed[0].path
        toast(
          'err',
          `${formatCount(failed.length)} 项没删掉（${name}）：${failed[0].message ?? '未知原因'}`
        )
      }
    } finally {
      setBusy(false)
      clearTrash()
    }
  }

  return (
    <ConfirmDialog
      title={title}
      lines={lines}
      confirmText="移到回收站"
      tone="danger"
      busy={busy}
      onConfirm={() => void handleConfirm()}
      onCancel={clearTrash}
    />
  )
}
