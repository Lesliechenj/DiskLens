// 文件年龄视图：回答"这些东西我是不是早就不用了？"
// 上半部分是修改时间分布（点一条可以只看那段时间里最大的文件），
// 下半部分是"又大又旧"清单，支持按 1/2/3/5 年 + 最小大小筛选。

import { useMemo, useState } from 'react'
import { useScanStore } from '../../store/scanStore'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import {
  formatBytes,
  formatCount,
  formatPercent,
  formatRelativeTime,
  formatTime
} from '../../../../shared/format'
import type { ScanNode } from '../../../../shared/types'
import { extInfo } from '../../../../shared/extCategories'
import { riskOf } from '../../../../shared/risk'
import {
  computeAgeStats,
  formatAge,
  OLD_THRESHOLDS,
  type AgeBucket,
  type OldThreshold
} from '../../lib/ageStats'
import { categoryColor } from '../../lib/chartCommon'
import { locatePath } from '../../lib/actions'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

/** 年龄条的配色：越旧越暖，一眼看出"陈年旧物" */
const AGE_COLORS = ['#4ade80', '#84cc16', '#facc15', '#fbbf24', '#fb923c', '#f87171', '#ef4444']

const MIN_SIZE_OPTIONS = [
  { value: 0, label: '全部大小' },
  { value: 10 * 1024 * 1024, label: '≥ 10 MB' },
  { value: 100 * 1024 * 1024, label: '≥ 100 MB' },
  { value: 1024 * 1024 * 1024, label: '≥ 1 GB' }
]

export function AgeView(): React.JSX.Element {
  const result = useScanStore((state) => state.result)
  const treeVersion = useScanStore((state) => state.treeVersion)
  const selected = useScanStore((state) => state.selected)
  const select = useScanStore((state) => state.select)
  const openMenu = useNodeMenu()

  const [threshold, setThreshold] = useState<OldThreshold>(1)
  const [minSize, setMinSize] = useState(0)
  const [activeBucket, setActiveBucket] = useState<string | null>(null)

  const stats = useMemo(
    () => (result ? computeAgeStats(result.root) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 树就地修改，靠 treeVersion 触发重算
    [result, treeVersion]
  )

  if (!result || !stats) {
    return (
      <div className="view">
        <EmptyState
          icon="clock"
          title="还没有扫描结果"
          hint="扫描一次，这里会告诉你哪些文件很久没动过、有多大。"
        />
      </div>
    )
  }

  const maxBucketSize = stats.buckets.reduce((max, bucket) => Math.max(max, bucket.size), 0)
  const oldStat = stats.old[threshold]
  const active = activeBucket
    ? (stats.buckets.find((bucket) => bucket.key === activeBucket) ?? null)
    : null

  const rows = (active ? active.files : oldStat.files).filter(
    (file) => minSize === 0 || file.size >= minSize
  )
  const shownSize = rows.reduce((sum, file) => sum + file.size, 0)

  const pickBucket = (bucket: AgeBucket): void => {
    setActiveBucket((current) => (current === bucket.key ? null : bucket.key))
    select(null)
  }

  return (
    <div className="view view-scroll">
      <div className="age-hero">
        <div className="age-hero-main">
          <span className="age-hero-label">超过 {threshold} 年没改过的文件</span>
          <strong className="age-hero-size">{formatBytes(oldStat.size)}</strong>
          <span className="age-hero-sub">
            {formatCount(oldStat.count)} 个 · 占本次扫描{' '}
            {formatPercent(oldStat.size, stats.totalSize)}%
          </span>
        </div>
        <div className="age-hero-actions">
          <span className="age-threshold-label">看多久没动的</span>
          {OLD_THRESHOLDS.map((year) => (
            <button
              key={year}
              className={`chip${threshold === year ? ' active' : ''}`}
              onClick={() => {
                setThreshold(year)
                setActiveBucket(null)
              }}
            >
              {year} 年以上
            </button>
          ))}
        </div>
      </div>

      <section className="card">
        <header className="card-head">
          <h3>按最后修改时间分布</h3>
          <span className="card-sub">点一条 = 只看那段时间里最大的文件；再点一次取消</span>
        </header>
        <div className="age-bars">
          {stats.buckets.map((bucket, index) => {
            const width =
              maxBucketSize > 0
                ? Math.max(bucket.size > 0 ? 1.5 : 0, (bucket.size / maxBucketSize) * 100)
                : 0
            return (
              <button
                key={bucket.key}
                className={`age-bar-row${activeBucket === bucket.key ? ' active' : ''}`}
                onClick={() => pickBucket(bucket)}
                title={`${bucket.label}：${formatBytes(bucket.size)} · ${formatCount(bucket.count)} 个文件（${bucket.hint}）`}
              >
                <span className="age-bar-name">
                  <i style={{ background: AGE_COLORS[index] }} />
                  {bucket.label}
                </span>
                <span className="age-bar-track">
                  <i style={{ width: `${width}%`, background: AGE_COLORS[index] }} />
                </span>
                <span className="age-bar-size">{formatBytes(bucket.size)}</span>
                <span className="age-bar-count">{formatCount(bucket.count)} 个</span>
                <span className="age-bar-pct">{formatPercent(bucket.size, stats.totalSize)}%</span>
              </button>
            )
          })}
        </div>
        <p className="age-bar-note">
          <Icon name="info" size={12} />{' '}
          按文件的「最后修改时间」算，不是创建时间；复制/移动文件可能刷新这个时间。
        </p>
      </section>

      <div className="view-bar">
        <div className="view-bar-left">
          <span className="view-bar-stat">
            {active ? (
              <>
                「{active.label}」里最大的 {formatCount(rows.length)} 个 · 合计{' '}
                <b>{formatBytes(shownSize)}</b>
              </>
            ) : (
              <>
                {threshold} 年以上没动过 · 前 {formatCount(rows.length)} 个 · 合计{' '}
                <b>{formatBytes(shownSize)}</b>
              </>
            )}
          </span>
        </div>
        <div className="view-bar-right">
          <span className="filter-label">最小</span>
          <select
            className="select sm"
            value={minSize}
            onChange={(event) => setMinSize(Number(event.target.value))}
          >
            {MIN_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <span className="view-bar-hint">点一行看详情 · 双击定位 · 右键更多操作</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="sparkle"
          title={active ? '这个时间段里没有符合条件的文件' : `没有超过 ${threshold} 年没改过的文件`}
          hint={
            minSize > 0
              ? '把「最小」调小一点再看看，或者换个时间段。'
              : '这个范围里的文件都还挺新，或者已经被你清理过了。'
          }
        />
      ) : (
        <div className="table">
          <div className="table-head files-grid">
            <span className="th">文件</span>
            <span className="th num">大小</span>
            <span className="th num">年龄</span>
            <span className="th">修改时间</span>
            <span className="th">位置</span>
            <span className="th center">操作</span>
          </div>
          {rows.map((file: ScanNode) => {
            const info = extInfo(file.name)
            const risk = riskOf(file)
            const activeRow = selected?.path === file.path
            return (
              <div
                key={file.path}
                className={`tr files-grid${activeRow ? ' selected' : ''}`}
                role="row"
                tabIndex={0}
                onClick={() => select(file)}
                onDoubleClick={() => void locatePath(file.path)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  select(file)
                  void openMenu(file)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    select(file)
                  }
                }}
                title={file.path}
              >
                <span className="td file-name">
                  <i className="cat-dot" style={{ background: categoryColor(info.category) }} />
                  <span className="file-title">
                    <span className="ellipsis">{file.name}</span>
                    <span className="file-sub-path">{file.path}</span>
                  </span>
                  {risk.level !== 'caution' && (
                    <span className={`tag tiny risk-${risk.level}`} title={risk.hint}>
                      <Icon name={risk.icon} size={11} /> {risk.label}
                    </span>
                  )}
                </span>
                <span className="td num strong">{formatBytes(file.size)}</span>
                <span className="td num muted">{formatAge(file.mtime, stats.now)}</span>
                <span className="td muted nowrap" title={formatTime(file.mtime)}>
                  {formatRelativeTime(file.mtime, stats.now)}
                </span>
                <span className="td path">{file.path}</span>
                <span className="td center">
                  <button
                    className="icon-btn xs"
                    title="在资源管理器中定位"
                    onClick={(event) => {
                      event.stopPropagation()
                      void locatePath(file.path)
                    }}
                  >
                    <Icon name="locate" size={13} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className="view-note">
        <Icon name="alert" size={13} />
        「很久没改」不等于「可以删」：照片、备份、安装包可能本来就很少动。删之前先点一行看看详情，重要文件请先备份。
      </p>
    </div>
  )
}
