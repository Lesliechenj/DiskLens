// 清理建议：把"能安全删的东西"按类别摆成卡片，照着点就行
// 成熟软件的差别在这儿：不只告诉你"哪儿大"，还告诉你"哪些能安全删、能腾出多少"

import { useMemo, useState } from 'react'
import { useCleanupGroups } from '../../hooks/useDerived'
import { useScanStore } from '../../store/scanStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUiStore } from '../../store/uiStore'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import {
  formatBytes,
  formatCount,
  formatPercent,
  formatRelativeTime
} from '../../../../shared/format'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

/** 每组展开后列几个样本 */
const PREVIEW_ITEMS = 8

export function CleanupView(): React.JSX.Element {
  const groups = useCleanupGroups()
  const result = useScanStore((state) => state.result)
  const select = useScanStore((state) => state.select)
  const requestTrash = useUiStore((state) => state.requestTrash)
  const openSettings = useUiStore((state) => state.openSettings)
  const excludes = useSettingsStore((state) => state.settings.excludes)
  const openMenu = useNodeMenu()
  const [expanded, setExpanded] = useState<string | null>(null)
  const appDataSkipped = excludes.some((name) => name.toLowerCase() === 'appdata')

  const totalSize = useMemo(() => groups.reduce((sum, group) => sum + group.totalSize, 0), [groups])
  const totalCount = useMemo(() => groups.reduce((sum, group) => sum + group.count, 0), [groups])

  if (!result) {
    return (
      <div className="view">
        <EmptyState
          icon="broom"
          title="还没有扫描结果"
          hint="扫描一次，这里会告诉你哪些东西可以安全清掉、能腾出多少空间。"
        />
      </div>
    )
  }

  return (
    <div className="view view-scroll">
      <div className="cleanup-hero">
        <div className="cleanup-hero-main">
          <span className="cleanup-hero-label">扫描出来能安全清理的</span>
          <strong className="cleanup-hero-size">{formatBytes(totalSize)}</strong>
          <span className="cleanup-hero-sub">
            {formatCount(totalCount)} 项 · 占已扫内容的 {formatPercent(totalSize, result.root.size)}
            %
          </span>
        </div>
        <p className="cleanup-hero-note">
          <Icon name="shield" size={14} />{' '}
          删除只进系统回收站，随时能恢复；系统关键文件已被排除在外。
        </p>
      </div>

      {appDataSkipped && (
        <p className="view-note">
          <Icon name="info" size={13} />
          这次扫描跳过了 AppData，而浏览器缓存、聊天软件缓存大多藏在那里。想清理它们，
          <button className="link" onClick={openSettings}>
            去设置里取消勾选 AppData
          </button>
          后重新扫描。
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon="sparkle"
          title="没找到可以放心清理的东西"
          hint="这个范围挺干净的。想更细地看，用面积图下钻，或者在大文件榜里挑挑。"
        />
      ) : (
        <div className="cleanup-list">
          {groups.map((group) => {
            const open = expanded === group.id
            return (
              <section key={group.id} className={`cleanup-card ${group.level}`}>
                <header className="cleanup-head">
                  <span className="cleanup-icon">
                    <Icon name={group.icon} size={18} />
                  </span>
                  <div className="cleanup-title">
                    <h3>{group.title}</h3>
                    <p>{group.desc}</p>
                  </div>
                  <div className="cleanup-metrics">
                    <b>{formatBytes(group.totalSize)}</b>
                    <span>{formatCount(group.count)} 项</span>
                  </div>
                  <div className="cleanup-actions">
                    <button
                      className="btn ghost sm"
                      onClick={() => setExpanded(open ? null : group.id)}
                    >
                      {open ? '收起' : '看看是哪些'}
                    </button>
                    <button
                      className="btn danger sm"
                      onClick={() => requestTrash(group.nodes, group.title, group.id)}
                    >
                      <Icon name="trash" size={13} /> 清理
                    </button>
                  </div>
                </header>

                {open && (
                  <div className="cleanup-items">
                    {group.nodes.slice(0, PREVIEW_ITEMS).map((node) => (
                      <button
                        key={node.path}
                        className="cleanup-item"
                        onClick={() => select(node)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          void openMenu(node)
                        }}
                        title={node.path}
                      >
                        <Icon name={node.type === 'dir' ? 'folder' : 'file'} size={13} />
                        <span className="ellipsis">{node.name}</span>
                        <span className="muted nowrap">
                          {node.path.slice(0, node.path.length - node.name.length)}
                        </span>
                        <span className="muted nowrap">{formatRelativeTime(node.mtime)}</span>
                        <b>{formatBytes(node.size)}</b>
                      </button>
                    ))}
                    {group.nodes.length > PREVIEW_ITEMS && (
                      <p className="muted pad-sm">
                        还有 {formatCount(group.nodes.length - PREVIEW_ITEMS)}{' '}
                        项没列出来，清理会一起处理。
                      </p>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <p className="view-note">
        <Icon name="alert" size={13} />
        清理前请确认这些文件你不需要了。回收站里删掉的东西能恢复，但清空回收站之后就找不回来了。
      </p>
    </div>
  )
}
