// 重复文件视图：把"内容完全相同"的文件列出来，每组默认保留最早的一份
// 安全设计：
//   - 每组至少保留一份，勾选框只出现在"要删的副本"上，删不到最后一份
//   - 仍然走统一回收站 + 二次确认，不提供硬删除
//   - 查重只读内容，不改任何文件

import { useMemo, useState } from 'react'
import { useScanStore } from '../../store/scanStore'
import { useDuplicateStore } from '../../store/duplicateStore'
import { useUiStore } from '../../store/uiStore'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import { formatBytes, formatCount, formatTime } from '../../../../shared/format'
import type { DuplicateGroup, ScanNode } from '../../../../shared/types'
import { baseNameOf } from '../../../../shared/paths'
import { buildDuplicateCandidates, DUPLICATE_MIN_SIZE_OPTIONS } from '../../lib/duplicates'
import { locatePath } from '../../lib/actions'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

/** 一次渲染多少组（每组可能有几十个文件） */
const GROUP_PAGE = 30

/**
 * 默认保留哪份：修改时间最早的那份（最早的通常最像原件）。
 * 时间相同就按路径排序，保证结果稳定。
 */
function defaultKeeperOf(group: DuplicateGroup): string {
  return [...group.files].sort((a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path))[0].path
}

export function DuplicateView(): React.JSX.Element {
  const result = useScanStore((state) => state.result)
  const treeVersion = useScanStore((state) => state.treeVersion)
  const scanId = useScanStore((state) => state.scanId)
  const requestTrash = useUiStore((state) => state.requestTrash)
  const openMenu = useNodeMenu()

  const status = useDuplicateStore((state) => state.status)
  const progress = useDuplicateStore((state) => state.progress)
  const dupResult = useDuplicateStore((state) => state.result)
  const error = useDuplicateStore((state) => state.error)
  const storedMinSize = useDuplicateStore((state) => state.minSize)
  const resultScanId = useDuplicateStore((state) => state.resultScanId)
  const resultTreeVersion = useDuplicateStore((state) => state.resultTreeVersion)
  const run = useDuplicateStore((state) => state.run)
  const cancel = useDuplicateStore((state) => state.cancel)

  const [minSize, setMinSize] = useState(storedMinSize)
  const [limit, setLimit] = useState(GROUP_PAGE)
  // 只存"用户改过"的保留项和勾选状态；没改过的走默认值：
  // 默认保留每组最早的一份，其余副本默认勾选为"待删"。
  const [keepers, setKeepers] = useState<Record<string, string>>({})
  const [selectionOverrides, setSelectionOverrides] = useState<Record<string, boolean>>({})
  const [localNote, setLocalNote] = useState('')

  const stale = !!dupResult && (resultScanId !== scanId || resultTreeVersion !== treeVersion)

  const selectedNodes = useMemo(() => {
    if (!dupResult) return [] as ScanNode[]
    const nodes: ScanNode[] = []
    for (const group of dupResult.groups) {
      const keeper = keepers[group.id] ?? defaultKeeperOf(group)
      for (const file of group.files) {
        if (file.path === keeper) continue
        if (selectionOverrides[file.path] === false) continue
        nodes.push({
          name: baseNameOf(file.path),
          path: file.path,
          size: group.size,
          type: 'file',
          mtime: file.mtime
        })
      }
    }
    return nodes
  }, [dupResult, keepers, selectionOverrides])

  const selectedSize = selectedNodes.reduce((sum, node) => sum + node.size, 0)

  if (!result) {
    return (
      <div className="view">
        <EmptyState
          icon="copy"
          title="还没有扫描结果"
          hint="先扫一个磁盘或文件夹，再来找「内容完全一样」的重复文件。"
        />
      </div>
    )
  }

  const start = async (): Promise<void> => {
    setLocalNote('')
    const built = buildDuplicateCandidates(result.root, minSize)
    if (built.tooMany) {
      setLocalNote(
        `符合条件的文件有 ${formatCount(built.eligibleFiles)} 个，太多了。把「最小大小」调大一点再查。`
      )
      return
    }
    if (built.candidates.length === 0) {
      setLocalNote('没有找到「大小相同、至少两份」的文件，不用查了。')
      return
    }
    if (built.truncated) {
      setLocalNote(
        `文件较多，这次只检查较大的 ${formatCount(built.candidateFiles)} 个（共 ${formatCount(built.eligibleFiles)} 个符合条件）。`
      )
    }
    await run(built.candidates, minSize, scanId, treeVersion)
  }

  const toggleSelected = (group: DuplicateGroup, path: string): void => {
    const keeper = keepers[group.id] ?? defaultKeeperOf(group)
    const currentlySelected = path !== keeper && selectionOverrides[path] !== false
    setSelectionOverrides((current) => ({ ...current, [path]: !currentlySelected }))
  }

  /** 换「保留这份」：旧的要保留的副本自动变成待删，新保留的从待删里移除 */
  const keepInstead = (group: DuplicateGroup, path: string): void => {
    const previous = keepers[group.id] ?? defaultKeeperOf(group)
    setKeepers((current) => ({ ...current, [group.id]: path }))
    setSelectionOverrides((current) => ({ ...current, [previous]: true, [path]: false }))
  }

  const groupSelected = (group: DuplicateGroup): ScanNode[] => {
    const keeper = keepers[group.id] ?? defaultKeeperOf(group)
    return group.files
      .filter((file) => file.path !== keeper && selectionOverrides[file.path] !== false)
      .map((file) => ({
        name: baseNameOf(file.path),
        path: file.path,
        size: group.size,
        type: 'file' as const,
        mtime: file.mtime
      }))
  }

  const visibleGroups = dupResult?.groups.slice(0, limit) ?? []

  return (
    <div className="view view-scroll">
      <div className="dupe-hero">
        <div className="dupe-hero-main">
          <span className="dupe-hero-label">内容完全相同、可以只留一份的</span>
          <strong className="dupe-hero-size">
            {dupResult ? formatBytes(dupResult.totalWasted) : '—'}
          </strong>
          <span className="dupe-hero-sub">
            {dupResult
              ? `${formatCount(dupResult.groups.length)} 组 · ${formatCount(
                  dupResult.groups.reduce((sum, group) => sum + group.files.length - 1, 0)
                )} 份多余副本`
              : '先选最小大小，再点「开始查重」'}
          </span>
        </div>
        <div className="dupe-hero-actions">
          <label className="dupe-min-size">
            <span>最小</span>
            <select
              className="select sm"
              value={minSize}
              disabled={status === 'scanning'}
              onChange={(event) => setMinSize(Number(event.target.value))}
            >
              {DUPLICATE_MIN_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {status === 'scanning' ? (
            <button className="btn danger sm" onClick={cancel}>
              <Icon name="stop" size={13} /> 取消查重
            </button>
          ) : (
            <button className="btn primary sm" onClick={() => void start()}>
              <Icon name="search" size={13} /> {dupResult ? '重新查重' : '开始查重'}
            </button>
          )}
        </div>
      </div>

      <p className="dupe-method">
        <Icon name="info" size={13} />
        先按大小分组，再抽样比对，最后逐字节校验 SHA-256；只读文件内容，不会修改或删除任何东西。
        文件越多越慢，建议先用默认的「≥ 1 MB」。
      </p>

      {localNote && (
        <p className="view-note">
          <Icon name="alert" size={13} /> {localNote}
        </p>
      )}

      {status === 'scanning' && (
        <div className="dupe-progress card">
          <div className="dupe-progress-head">
            <b>
              {progress?.phase === 'full' ? '逐字节确认中' : '抽样比对中'} · 第{' '}
              {formatCount(progress?.doneGroups ?? 0)} / {formatCount(progress?.totalGroups ?? 0)}{' '}
              组
            </b>
            <span>
              已读 {formatBytes(progress?.hashedBytes ?? 0)} ·{' '}
              {formatCount(progress?.doneFiles ?? 0)} / {formatCount(progress?.totalFiles ?? 0)}{' '}
              个文件
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${
                  (progress?.totalFiles ?? 0) > 0
                    ? Math.max(1, ((progress?.doneFiles ?? 0) / (progress?.totalFiles ?? 1)) * 100)
                    : 2
                }%`
              }}
            />
          </div>
          <p className="progress-current" title={progress?.current}>
            {progress?.current ?? '正在准备…'}
          </p>
        </div>
      )}

      {status === 'error' && error && (
        <p className="trash-error">
          <Icon name="alert" size={13} /> {error}
        </p>
      )}

      {status === 'cancelled' && (
        <p className="view-note">
          <Icon name="info" size={13} /> 查重已取消，没有留下半截结果。换个最小大小再试也行。
        </p>
      )}

      {stale && (
        <p className="view-note warn-text">
          <Icon name="alert" size={13} />
          扫描结果有更新，下面的查重结果可能已经过期。建议点「重新查重」。
        </p>
      )}

      {dupResult && dupResult.groups.length === 0 && (
        <EmptyState
          icon="sparkle"
          title="没有发现内容完全相同的文件"
          hint={`检查了 ${formatCount(dupResult.candidateFiles)} 个"大小相同"的候选文件，内容都不一样。想更彻底可以选「≥ 1 KB」再来一次。`}
        />
      )}

      {dupResult && dupResult.groups.length > 0 && (
        <>
          <div className="dupe-summary">
            <span>
              检查了 <b>{formatCount(dupResult.hashedFiles)}</b> 个文件 · 用时{' '}
              <b>{(dupResult.durationMs / 1000).toFixed(1)} 秒</b>
              {dupResult.errorCount > 0 && ` · ${formatCount(dupResult.errorCount)} 个文件读不了`}
            </span>
            <span className="muted">
              每组默认保留最早的一份；想换保留哪份，点那一行的「保留这份」。
            </span>
          </div>

          <div className="dupe-list">
            {visibleGroups.map((group) => {
              const keeper = keepers[group.id] ?? defaultKeeperOf(group)
              const groupNodes = groupSelected(group)
              return (
                <section key={group.id} className="dupe-card">
                  <header className="dupe-card-head">
                    <div className="dupe-card-title">
                      <span className="dupe-count">{group.files.length} 份相同</span>
                      <b>{formatBytes(group.size)}</b>
                      <span className="muted">可省 {formatBytes(group.wasted)}</span>
                    </div>
                    <button
                      className="btn danger sm"
                      disabled={groupNodes.length === 0}
                      onClick={() => requestTrash(groupNodes)}
                      title="把勾选的副本移到回收站，至少保留一份"
                    >
                      <Icon name="trash" size={12} /> 移走 {groupNodes.length} 份
                    </button>
                  </header>

                  <div className="dupe-files">
                    {group.files.map((file) => {
                      const isKeeper = file.path === keeper
                      const checked =
                        file.path !== keeper && selectionOverrides[file.path] !== false
                      return (
                        <div
                          key={file.path}
                          className={`dupe-file${isKeeper ? ' keeper' : ''}`}
                          title={file.path}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            void openMenu({
                              name: baseNameOf(file.path),
                              path: file.path,
                              size: group.size,
                              type: 'file',
                              mtime: file.mtime
                            })
                          }}
                        >
                          {isKeeper ? (
                            <span className="dupe-keep-badge">
                              <Icon name="shield" size={11} /> 保留
                            </span>
                          ) : (
                            <label
                              className="dupe-check"
                              title={checked ? '取消勾选' : '勾选后移走'}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelected(group, file.path)}
                              />
                            </label>
                          )}
                          <div className="dupe-file-body">
                            <div className="dupe-file-name">
                              <Icon name="file" size={12} />
                              <span className="ellipsis">{baseNameOf(file.path)}</span>
                            </div>
                            <span className="dupe-file-path">{file.path}</span>
                          </div>
                          <span className="dupe-file-time" title={formatTime(file.mtime)}>
                            {new Date(file.mtime).toLocaleDateString('zh-CN')}
                          </span>
                          {!isKeeper && (
                            <button
                              className="btn ghost xs"
                              onClick={() => keepInstead(group, file.path)}
                              title="这份不删，改删其他副本"
                            >
                              保留这份
                            </button>
                          )}
                          <button
                            className="icon-btn xs"
                            onClick={() => void locatePath(file.path)}
                            title="在资源管理器中定位"
                          >
                            <Icon name="locate" size={13} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="table-foot">
            <span className="muted">
              显示 {formatCount(visibleGroups.length)} / {formatCount(dupResult.groups.length)} 组
              {dupResult.errorCount > 0 && ` · ${formatCount(dupResult.errorCount)} 个文件读不了`}
            </span>
            {limit < dupResult.groups.length && (
              <button
                className="btn ghost sm"
                onClick={() => setLimit((value) => value + GROUP_PAGE)}
              >
                再显示 {Math.min(GROUP_PAGE, dupResult.groups.length - limit)} 组
              </button>
            )}
          </div>

          <div className="dupe-batch">
            <span>
              已勾选 <b>{formatCount(selectedNodes.length)}</b> 份 · 可腾出{' '}
              <b>{formatBytes(selectedSize)}</b>
            </span>
            <button
              className="btn danger sm"
              disabled={selectedNodes.length === 0}
              onClick={() => requestTrash(selectedNodes)}
            >
              <Icon name="trash" size={13} /> 移到回收站（{formatCount(selectedNodes.length)}）
            </button>
          </div>

          {dupResult.errorCount > 0 && (
            <details className="dupe-errors">
              <summary>
                {formatCount(dupResult.errorCount)} 个文件读不了（被占用/无权限），点开看样本
              </summary>
              <ul>
                {dupResult.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <p className="view-note">
        <Icon name="alert" size={13} />
        删重复文件同样要把副本移到回收站。确认「保留的那份」是你需要的版本再动手；重要文件请先备份。
      </p>
    </div>
  )
}
