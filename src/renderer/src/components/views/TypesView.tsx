// 类型构成：本次扫描/当前层按"文件大类"聚合 → 环形图 + 排行表 + 扩展名明细
// 回答小白最关心的那句："我的空间到底被什么吃掉了？"

import { useCallback, useMemo, useState } from 'react'
import { useScanStore } from '../../store/scanStore'
import { useDark } from '../../store/settingsStore'
import { useInsights } from '../../hooks/useDerived'
import { formatBytes, formatCount, formatPercent } from '../../../../shared/format'
import { type ExtCategory } from '../../../../shared/extCategories'
import { buildCategoryDonutOption, buildCategoryRows } from '../../lib/categoryData'
import { categoryColor } from '../../lib/chartCommon'
import { EChart } from '../EChart'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../icons'

/** 扩展名明细一次显示多少行 */
const EXT_PAGE = 30

export function TypesView(): React.JSX.Element {
  const insights = useInsights()
  const dark = useDark()
  const setView = useScanStore((state) => state.setView)
  const setTypeQuery = useScanStore((state) => state.setTypeQuery)
  const filters = useScanStore((state) => state.filters)
  const [showAllExts, setShowAllExts] = useState(false)

  // 点一行 = 去"文件分类"视图把这一类文件全列出来（比只筛个图更实用）
  const focusCategory = useCallback(
    (category: ExtCategory): void => {
      setTypeQuery({ kind: 'category', value: category })
      setView('bytype')
    },
    [setTypeQuery, setView]
  )

  const focusExt = useCallback(
    (ext: string): void => {
      setTypeQuery({ kind: 'ext', value: ext })
      setView('bytype')
    },
    [setTypeQuery, setView]
  )

  const option = useMemo(
    () => (insights ? buildCategoryDonutOption(insights, dark) : {}),
    [insights, dark]
  )
  const rows = useMemo(() => (insights ? buildCategoryRows(insights) : []), [insights])
  const exts = useMemo(() => insights?.exts ?? [], [insights])

  const handleSliceClick = useCallback(
    (params: unknown): void => {
      const category = (params as { data?: { category?: ExtCategory } }).data?.category
      if (!category) return
      focusCategory(category)
    },
    [focusCategory]
  )
  const donutEvents = useMemo(() => ({ click: handleSliceClick as never }), [handleSliceClick])

  if (!insights) {
    return (
      <div className="view">
        <EmptyState
          icon="pie"
          title="还没有扫描结果"
          hint="扫描一个磁盘或文件夹，这里会告诉你空间都被什么占了。"
        />
      </div>
    )
  }

  const maxSize = rows.length > 0 ? rows[0].size : 0
  const totalSize = insights.totalSize
  const visibleExts = showAllExts ? exts : exts.slice(0, EXT_PAGE)

  return (
    <div className="view view-scroll">
      <div className="types-grid">
        <section className="card donut-card">
          <header className="card-head">
            <h3>空间构成</h3>
            <span className="card-sub">
              本次扫描 {formatCount(insights.totalFiles)} 个文件 · {insights.exts.length} 种后缀
            </span>
          </header>
          <div className="donut-wrap">
            <EChart option={option} onEvents={donutEvents} />
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <h3>哪类最占地方</h3>
            <span className="card-sub">点一行 = 列出这类文件</span>
          </header>
          <div className="cat-rows">
            {rows.map((row) => {
              const active = filters.category === row.category
              return (
                <button
                  key={row.category}
                  className={`cat-row${active ? ' active' : ''}`}
                  onClick={() => focusCategory(row.category)}
                  title={`列出所有「${row.label}」文件`}
                >
                  <span className="cat-dot" style={{ background: categoryColor(row.category) }} />
                  <span className="cat-name">
                    <Icon name={row.icon} size={13} /> {row.label}
                  </span>
                  <span className="cat-bar">
                    <i
                      style={{
                        width: `${maxSize > 0 ? Math.max(1.5, (row.size / maxSize) * 100) : 0}%`,
                        background: categoryColor(row.category)
                      }}
                    />
                  </span>
                  <span className="cat-pct">{formatPercent(row.size, totalSize)}%</span>
                  <span className="cat-size">{formatBytes(row.size)}</span>
                  <span className="cat-count">{formatCount(row.count)} 个</span>
                </button>
              )
            })}
            {rows.length === 0 && <p className="muted">这个范围里没有文件（都是空目录？）</p>}
          </div>
        </section>
      </div>

      <section className="card">
        <header className="card-head">
          <h3>按后缀明细</h3>
          <span className="card-sub">本次扫描 · 点一行 = 列出这类文件</span>
        </header>
        <div className="ext-table">
          <div className="ext-head">
            <span>后缀</span>
            <span>说明</span>
            <span className="num">大小</span>
            <span className="num">占比</span>
            <span className="num">个数</span>
          </div>
          {visibleExts.map((ext) => (
            <button
              key={ext.ext || '(none)'}
              className={`ext-row${filters.ext === ext.ext ? ' active' : ''}`}
              onClick={() => focusExt(ext.ext)}
              title={`列出所有 .${ext.ext || '（无后缀）'} 文件`}
            >
              <span className="ext-name">
                <i className="cat-dot" style={{ background: categoryColor(ext.category) }} />
                {ext.ext ? `.${ext.ext}` : '无后缀'}
              </span>
              <span className="ext-label">{ext.label}</span>
              <span className="num">{formatBytes(ext.size)}</span>
              <span className="num">{formatPercent(ext.size, totalSize)}%</span>
              <span className="num muted">{formatCount(ext.count)}</span>
            </button>
          ))}
          {exts.length === 0 && <p className="muted">没有文件。</p>}
        </div>
        {exts.length > EXT_PAGE && (
          <button
            className="btn ghost sm more-btn"
            onClick={() => setShowAllExts((value) => !value)}
          >
            {showAllExts ? '收起' : `展开全部 ${exts.length} 种后缀`}
            <Icon name={showAllExts ? 'chevronDown' : 'chevronRight'} size={13} />
          </button>
        )}
      </section>

      <p className="view-note">
        <Icon name="info" size={13} />
        「类型」按后缀自动归类：视频、图片、音频、文档、压缩包、程序、代码、系统、缓存。
        缓存和日志类通常可以放心清理，去「清理建议」看看能腾出多少空间。
      </p>
    </div>
  )
}
