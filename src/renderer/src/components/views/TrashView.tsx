// 回收站视图：看看自己删了什么、能还原哪些、要不要清空
// 数据来自系统回收站（$Recycle.Bin 元数据），不是 DiskLens 自己的流水账

import { useEffect, useMemo, useState } from 'react'
import { useTrashStore } from '../../store/trashStore'
import { formatBytes, formatCount, formatRelativeTime, formatTime } from '../../../../shared/format'
import type { TrashEntry } from '../../../../shared/types'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

/** 一次显示多少条 */
const PAGE = 120

export function TrashView(): React.JSX.Element {
  const listing = useTrashStore((state) => state.listing)
  const loading = useTrashStore((state) => state.loading)
  const error = useTrashStore((state) => state.error)
  const refresh = useTrashStore((state) => state.refresh)
  const restore = useTrashStore((state) => state.restore)
  const empty = useTrashStore((state) => state.empty)
  const openFolder = useTrashStore((state) => state.openFolder)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [restoring, setRestoring] = useState<string | null>(null)

  // 打开这个视图就刷新一次（别在启动时无脑扫所有分区的回收站）
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在进入视图时读一次
  }, [])

  const entries = useMemo(() => listing?.entries ?? [], [listing])
  const shown = useMemo(() => entries.slice(0, limit), [entries, limit])
  const missing = useMemo(() => entries.filter((entry) => !entry.exists), [entries])

  const handleRestore = async (entry: TrashEntry): Promise<void> => {
    setRestoring(entry.id)
    try {
      await restore([entry])
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="view view-scroll">
      <div className="trash-hero">
        <div className="trash-hero-main">
          <span className="trash-hero-label">回收站里现在躺着</span>
          <strong className="trash-hero-size">{formatBytes(listing?.totalSize ?? 0)}</strong>
          <span className="trash-hero-sub">
            {formatCount(listing?.totalCount ?? 0)} 项 · 删除只进这里，随时能还原
          </span>
        </div>
        <div className="trash-hero-actions">
          <button className="btn ghost sm" onClick={() => void refresh()} disabled={loading}>
            <Icon name="refresh" size={13} /> {loading ? '读取中…' : '刷新'}
          </button>
          <button className="btn ghost sm" onClick={() => void openFolder()}>
            <Icon name="external" size={13} /> 打开系统回收站
          </button>
          <button
            className="btn danger sm"
            onClick={() => setConfirmEmpty(true)}
            disabled={entries.length === 0}
            title="清空后不可恢复"
          >
            <Icon name="eraser" size={13} /> 清空
          </button>
        </div>
      </div>

      {error && (
        <p className="trash-error">
          <Icon name="alert" size={13} /> {error}
        </p>
      )}

      {listing?.blocked && (
        <p className="view-note">
          <Icon name="alert" size={13} />
          有分区读不到（{listing.errors.slice(0, 2).join('、')}
          {listing.errors.length > 2 ? ' 等' : ''}）。想看得全一点，可以右键 DiskLens
          用管理员身份运行。
        </p>
      )}

      {listing === null ? (
        // 第一次读取中：回收站可能有几千条记录，别让用户对着"空"发愣
        <div className="trash-loading">
          <div className="scanning-spinner" aria-hidden="true" />
          <span>正在读取回收站…</span>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="recycle"
          title="回收站是空的"
          hint="你删掉的文件会先来这里，可以随时还原；清空回收站才会真正腾出空间。"
        />
      ) : (
        <>
          <div className="table">
            <div className="table-head trash-grid">
              <span className="th">原来是什么</span>
              <span className="th num">大小</span>
              <span className="th">删除时间</span>
              <span className="th">原来的位置</span>
              <span className="th center">操作</span>
            </div>
            {shown.map((entry) => (
              <div
                key={entry.id}
                className={`tr trash-grid${entry.exists ? '' : ' missing'}`}
                title={`${entry.originalPath}\n${formatTime(entry.deletedAt)}`}
              >
                <span className="td file-name">
                  <Icon name={entry.isFolder ? 'folder' : 'file'} size={13} />
                  <span className="ellipsis">{entry.name || '(无名字)'}</span>
                  {!entry.exists && <span className="tag tiny">内容已不在</span>}
                </span>
                <span className="td num strong">{formatBytes(entry.size)}</span>
                <span className="td muted nowrap" title={formatTime(entry.deletedAt)}>
                  {formatRelativeTime(entry.deletedAt)}
                </span>
                <span className="td path">{entry.originalPath}</span>
                <span className="td center">
                  <button
                    className="btn ghost sm"
                    onClick={() => void handleRestore(entry)}
                    disabled={!entry.exists || restoring === entry.id}
                    title="放回原来的位置（原位置有同名文件就不覆盖）"
                  >
                    <Icon name="restore" size={12} /> {restoring === entry.id ? '还原中…' : '还原'}
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="table-foot">
            <span className="muted">
              显示 {formatCount(shown.length)} / {formatCount(entries.length)} 条
              {missing.length > 0 && ` · ${formatCount(missing.length)} 条内容已不在`}
            </span>
            {limit < entries.length && (
              <button
                className="btn ghost sm"
                onClick={() => setLimit((value) => value + PAGE * 2)}
              >
                再显示 {Math.min(PAGE * 2, entries.length - limit)} 条
              </button>
            )}
          </div>
        </>
      )}

      <p className="view-note">
        <Icon name="info" size={13} />
        这里读的是 Windows
        系统回收站。清空回收站能真正腾出空间，但之后就找不回来了——确认没用的东西再清。
      </p>

      {confirmEmpty && (
        <ConfirmDialog
          title="清空回收站？"
          lines={[
            `一共 ${formatCount(entries.length)} 项，${formatBytes(listing?.totalSize ?? 0)}。`,
            '清空之后这些文件就真的没了，无法还原。',
            '如果只是想腾一点空间，可以先在上面单独还原或挑着删。'
          ]}
          confirmText="清空回收站"
          tone="danger"
          onConfirm={() => {
            setConfirmEmpty(false)
            void empty()
          }}
          onCancel={() => setConfirmEmpty(false)}
        />
      )}
    </div>
  )
}
