// 文件分类视图：选一个类型（.docx / 视频 / 图片…），把扫过的所有盘里这类文件一次列全
// "把散落在各处的同一类文件揪出来"是清理时最常用的动作

import { useMemo, useState } from 'react'
import { useScanStore } from '../../store/scanStore'
import { useInsights } from '../../hooks/useDerived'
import { useNodeMenu } from '../../hooks/useNodeMenu'
import {
  formatBytes,
  formatCount,
  formatPercent,
  formatRelativeTime,
  formatTime
} from '../../../../shared/format'
import { CATEGORY_META, CATEGORY_ORDER, extInfo } from '../../../../shared/extCategories'
import type { IconName } from '../../../../shared/iconNames'
import { riskOf } from '../../../../shared/risk'
import { collectFilesByType, type TypeQuery } from '../../lib/insights'
import { categoryColor } from '../../lib/chartCommon'
import { locatePath } from '../../lib/actions'
import { Icon } from '../icons'
import { EmptyState } from '../ui/EmptyState'

/** 后缀筛选一次显示多少个 */
const EXT_PAGE = 42
/** 文件表一次显示多少行 */
const ROW_PAGE = 150

export function ByTypeView(): React.JSX.Element {
  const insights = useInsights()
  const result = useScanStore((state) => state.result)
  const query = useScanStore((state) => state.typeQuery)
  const setQuery = useScanStore((state) => state.setTypeQuery)
  const selected = useScanStore((state) => state.selected)
  const select = useScanStore((state) => state.select)
  const treeVersion = useScanStore((state) => state.treeVersion)
  const openMenu = useNodeMenu()
  const [extKeyword, setExtKeyword] = useState('')
  const [extAll, setExtAll] = useState(false)
  const [rowLimit, setRowLimit] = useState(ROW_PAGE)

  const found = useMemo(() => {
    if (!result || !query) return null
    return collectFilesByType(result.root, query, 4000)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 树就地修改，靠 treeVersion 触发重算
  }, [result, query, treeVersion])

  const exts = useMemo(() => {
    const list = insights?.exts ?? []
    const keyword = extKeyword.trim().toLowerCase()
    return keyword
      ? list.filter((ext) => ext.ext.includes(keyword) || ext.label.includes(extKeyword.trim()))
      : list
  }, [insights, extKeyword])

  if (!result || !insights) {
    return (
      <div className="view">
        <EmptyState
          icon="tags"
          title="还没有扫描结果"
          hint="先扫一个磁盘或文件夹，这里能按类型把文件一次列全（比如所有 .docx、所有视频）。"
        />
      </div>
    )
  }

  const activeExt = query?.kind === 'ext' ? query.value : null
  const activeCategory = query?.kind === 'category' ? query.value : null
  const visibleExts = extAll ? exts : exts.slice(0, EXT_PAGE)
  const shownRows = found ? found.files.slice(0, rowLimit) : []

  const pick = (next: TypeQuery | null): void => {
    const same =
      next &&
      query &&
      ((next.kind === 'ext' && query.kind === 'ext' && next.value === query.value) ||
        (next.kind === 'category' && query.kind === 'category' && next.value === query.value))
    setQuery(same ? null : next)
    setRowLimit(ROW_PAGE)
  }

  const queryLabel = ((): { icon: IconName; text: string } | null => {
    if (query?.kind === 'ext') {
      const row = insights.exts.find((item) => item.ext === query.value)
      return {
        icon: row ? CATEGORY_META[row.category].icon : 'other',
        text: query.value ? `.${query.value}` : '无后缀文件'
      }
    }
    if (query?.kind === 'category') {
      return {
        icon: CATEGORY_META[query.value].icon,
        text: `${CATEGORY_META[query.value].label}文件`
      }
    }
    return null
  })()

  return (
    <div className="view view-scroll bytype">
      <section className="card">
        <header className="card-head">
          <h3>按类型找文件</h3>
          <span className="card-sub">选一类，把扫过的所有盘里这类文件列全（按大小排）</span>
        </header>

        <div className="type-chips">
          {CATEGORY_ORDER.filter((category) => {
            const row = insights.categories.find((item) => item.category === category)
            return row && row.count > 0
          }).map((category) => {
            const row = insights.categories.find((item) => item.category === category)!
            const meta = CATEGORY_META[category]
            const active = activeCategory === category
            return (
              <button
                key={category}
                className={`type-chip${active ? ' active' : ''}`}
                onClick={() => pick({ kind: 'category', value: category })}
                title={meta.hint}
              >
                <span className="type-chip-icon" style={{ color: categoryColor(category) }}>
                  <Icon name={meta.icon} size={15} />
                </span>
                <span className="type-chip-label">{meta.label}</span>
                <span className="type-chip-meta">
                  {formatCount(row.count)} 个 · {formatBytes(row.size)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="ext-picker">
          <div className="ext-picker-head">
            <span>或者按后缀精确挑</span>
            <input
              className="search-input compact"
              value={extKeyword}
              onChange={(event) => setExtKeyword(event.target.value)}
              placeholder="搜后缀，如 docx"
              spellCheck={false}
            />
          </div>
          <div className="ext-chips">
            {visibleExts.map((ext) => {
              const active = activeExt === ext.ext
              return (
                <button
                  key={ext.ext || '(none)'}
                  className={`ext-chip${active ? ' active' : ''}`}
                  onClick={() => pick({ kind: 'ext', value: ext.ext })}
                  title={`${ext.label} · ${formatCount(ext.count)} 个 · ${formatBytes(ext.size)}`}
                >
                  <i className="cat-dot" style={{ background: categoryColor(ext.category) }} />
                  {ext.ext ? `.${ext.ext}` : '无后缀'}
                  <b>{formatCount(ext.count)}</b>
                </button>
              )
            })}
            {exts.length === 0 && <p className="muted">没有匹配的后缀。</p>}
          </div>
          {exts.length > EXT_PAGE && (
            <button className="btn ghost sm more-btn" onClick={() => setExtAll((value) => !value)}>
              {extAll ? '收起' : `展开全部 ${exts.length} 种后缀`}
              <Icon name={extAll ? 'chevronDown' : 'chevronRight'} size={13} />
            </button>
          )}
        </div>
      </section>

      {!found || !queryLabel ? (
        <EmptyState
          icon="tags"
          title="上面选一类文件"
          hint="比如选「文档」看所有 docx/pdf/xlsx，或者直接点 .docx —— 会列出它们散落在哪些文件夹。"
        />
      ) : (
        <>
          <div className="view-bar">
            <div className="view-bar-left">
              <span className="view-bar-stat">
                <Icon name={queryLabel.icon} size={14} /> <b>{queryLabel.text}</b> 共{' '}
                <b>{formatCount(found.totalCount)}</b> 个 · 合计{' '}
                <b>{formatBytes(found.totalSize)}</b>（
                {formatPercent(found.totalSize, insights.totalSize)}% 的空间）
              </span>
            </div>
            <span className="view-bar-hint">
              {found.truncated
                ? `列表只显示最大的 ${formatCount(found.files.length)} 个`
                : '点一行看详情 · 双击定位 · 右键更多操作'}
            </span>
          </div>

          <div className="table">
            <div className="table-head files-grid">
              <span className="th">文件</span>
              <span className="th num">大小</span>
              <span className="th num">占该类</span>
              <span className="th">修改时间</span>
              <span className="th">位置</span>
              <span className="th center">操作</span>
            </div>
            {shownRows.map((file, index) => {
              const risk = riskOf(file)
              const active = selected?.path === file.path
              return (
                <div
                  key={file.path}
                  className={`tr files-grid${active ? ' selected' : ''}`}
                  role="row"
                  tabIndex={0}
                  onClick={() => select(file)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select(file)
                    }
                  }}
                  onDoubleClick={() => void locatePath(file.path)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    select(file)
                    void openMenu(file)
                  }}
                  title={file.path}
                >
                  <span className="td file-name">
                    <span className="rank">{index + 1}</span>
                    <i
                      className="cat-dot"
                      style={{ background: categoryColor(extInfo(file.name).category) }}
                    />
                    <span className="ellipsis">{file.name}</span>
                    {risk.level !== 'caution' && (
                      <span className={`tag tiny risk-${risk.level}`} title={risk.hint}>
                        <Icon name={risk.icon} size={11} /> {risk.label}
                      </span>
                    )}
                  </span>
                  <span className="td num strong">{formatBytes(file.size)}</span>
                  <span className="td num muted">{formatPercent(file.size, found.totalSize)}%</span>
                  <span className="td muted nowrap" title={formatTime(file.mtime)}>
                    {formatRelativeTime(file.mtime)}
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
            {shownRows.length === 0 && <p className="muted pad">没找到这类文件。</p>}
          </div>

          <div className="table-foot">
            <span className="muted">
              显示 {formatCount(shownRows.length)} / {formatCount(found.files.length)} 个
            </span>
            {rowLimit < found.files.length && (
              <button
                className="btn ghost sm"
                onClick={() => setRowLimit((value) => value + ROW_PAGE)}
              >
                再显示 {Math.min(ROW_PAGE, found.files.length - rowLimit)} 个
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
