// 工具栏：面包屑 + 视图切换 + 筛选 + 搜索
// 六种视图都是同一棵树的渲染，切视图不重扫（数据契约的红利）

import { useEffect, useMemo, useRef, useState } from 'react'
import { useScanStore } from '../store/scanStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatBytes, formatCount } from '../../../shared/format'
import { CATEGORY_META } from '../../../shared/extCategories'
import { SEARCH_LIMIT, searchTree } from '../lib/searchTree'
import { exportReport } from '../lib/exportReport'
import { riskOf } from '../../../shared/risk'
import type { ViewKind } from '../../../shared/types'
import { Icon, type IconName } from './icons'

interface ViewTab {
  key: ViewKind
  label: string
  icon: IconName
  hint: string
}

const VIEW_TABS: ViewTab[] = [
  { key: 'treemap', label: '面积图', icon: 'grid', hint: '块越大占地方越多，点目录块下钻' },
  { key: 'sunburst', label: '旭日图', icon: 'sunburst', hint: '两层结构一眼看穿，点目录块下钻' },
  { key: 'types', label: '类型构成', icon: 'pie', hint: '哪类文件最占地方' },
  { key: 'bigfiles', label: '大文件', icon: 'list', hint: '全盘最大的文件排行' },
  { key: 'folders', label: '文件夹', icon: 'tree', hint: '最占地方的目录排行' },
  { key: 'cleanup', label: '清理建议', icon: 'broom', hint: '哪些能安全删、能腾多少' }
]

/** 最小显示大小选项（只影响图表，不影响统计） */
const MIN_SIZE_OPTIONS = [
  { value: 0, label: '全部大小' },
  { value: 1024, label: '≥ 1 KB' },
  { value: 64 * 1024, label: '≥ 64 KB' },
  { value: 1024 * 1024, label: '≥ 1 MB' },
  { value: 20 * 1024 * 1024, label: '≥ 20 MB' }
]

export function Toolbar(): React.JSX.Element {
  const result = useScanStore((state) => state.result)
  const view = useScanStore((state) => state.view)
  const setView = useScanStore((state) => state.setView)
  const breadcrumb = useScanStore((state) => state.breadcrumb)
  const popTo = useScanStore((state) => state.popTo)
  const jumpTo = useScanStore((state) => state.jumpTo)
  const select = useScanStore((state) => state.select)
  const filters = useScanStore((state) => state.filters)
  const setTypes = useScanStore((state) => state.setTypes)
  const setCategory = useScanStore((state) => state.setCategory)
  const setExt = useScanStore((state) => state.setExt)
  const setMinSize = useScanStore((state) => state.setMinSize)
  const resetFilters = useScanStore((state) => state.resetFilters)
  const keyword = useScanStore((state) => state.keyword)
  const setKeyword = useScanStore((state) => state.setKeyword)
  const rememberPath = useSettingsStore((state) => state.settings.rememberPath)

  const [searchOpen, setSearchOpen] = useState(false)
  // 下拉高亮项连同"它是哪个关键词下的高亮"一起存：关键词一变就自动回到第一项，不需要 effect
  const [active, setActive] = useState<{ kw: string; index: number }>({ kw: '', index: 0 })
  const blurTimer = useRef<number | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl+F 聚焦搜索框（App 里派发自定义事件，避免组件间硬耦合）
  useEffect(() => {
    const focus = (): void => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('disklens:focus-search', focus)
    return () => window.removeEventListener('disklens:focus-search', focus)
  }, [])

  const hits = useMemo(
    () => (result && keyword.trim() ? searchTree(result.root, keyword) : []),
    [result, keyword]
  )

  // 下拉高亮项：渲染期夹紧，不用 effect 同步（避免多余的一轮渲染）
  const rawIndex = active.kw === keyword ? active.index : 0
  const activeRow = hits.length > 0 ? Math.min(rawIndex, hits.length - 1) : 0

  const scheduleClose = (): void => {
    blurTimer.current = window.setTimeout(() => setSearchOpen(false), 160)
  }
  const cancelClose = (): void => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current)
  }

  const jumpToHit = (index: number): void => {
    const hit = hits[index]
    if (!hit) return
    jumpTo(hit.ancestors, hit.node)
    select(hit.node)
    setSearchOpen(false)
  }

  const activeType = filters.types.length === 2 ? 'all' : filters.types[0]
  const filterable = view === 'treemap' || view === 'sunburst'
  const hasFilter =
    filters.category !== null ||
    filters.ext !== null ||
    filters.minSize > 0 ||
    filters.types.length < 2

  const crumbs = breadcrumb.length > 0 ? breadcrumb : result ? [result.root] : []

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <nav className="breadcrumb" aria-label="目录层级">
          {crumbs.map((node, index) => {
            const last = index === crumbs.length - 1
            return (
              <span key={node.path} className="crumb-wrap">
                {index > 0 && (
                  <span className="crumb-sep">
                    <Icon name="chevron-right" size={11} />
                  </span>
                )}
                <button
                  className={`crumb${last && view === 'treemap' ? ' current' : ''}`}
                  title={node.path}
                  onClick={() => {
                    setView('treemap')
                    popTo(index)
                  }}
                >
                  {index === 0 ? (
                    <>
                      <Icon name="drive" size={12} /> {node.name || node.path}
                    </>
                  ) : (
                    node.name
                  )}
                </button>
              </span>
            )
          })}
          {crumbs.length > 1 && (
            <button
              className="crumb ghost"
              title="回到上一层"
              onClick={() => {
                setView('treemap')
                popTo(crumbs.length - 2)
              }}
            >
              <Icon name="arrow-up" size={12} /> 上一层
            </button>
          )}
        </nav>

        <div className="toolbar-right">
          <div className="search-box">
            <Icon name="search" size={13} className="search-icon" />
            <input
              ref={inputRef}
              className="search-input"
              value={keyword}
              placeholder="搜文件名（Ctrl+F）"
              spellCheck={false}
              onChange={(event) => {
                setKeyword(event.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => keyword.trim() && setSearchOpen(true)}
              onBlur={scheduleClose}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setKeyword('')
                  setSearchOpen(false)
                  inputRef.current?.blur()
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActive({
                    kw: keyword,
                    index: Math.min(activeRow + 1, Math.max(0, hits.length - 1))
                  })
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActive({ kw: keyword, index: Math.max(0, activeRow - 1) })
                }
                if (event.key === 'Enter') jumpToHit(activeRow)
              }}
            />
            {keyword && (
              <button
                className="field-clear"
                title="清空搜索"
                onClick={() => {
                  setKeyword('')
                  inputRef.current?.focus()
                }}
              >
                <Icon name="x" size={12} />
              </button>
            )}

            {searchOpen && keyword.trim() && (
              <div
                className="search-results"
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                role="listbox"
              >
                <div className="search-count">
                  {hits.length > 0
                    ? `找到 ${formatCount(hits.length)} 个${hits.length >= SEARCH_LIMIT ? `（最多显示 ${SEARCH_LIMIT} 个）` : ''}`
                    : `没有找到「${keyword.trim()}」`}
                  <span className="search-hint">↑↓ 选择 · Enter 定位</span>
                </div>
                {hits.map((hit, index) => (
                  <button
                    key={hit.node.path}
                    className={`search-item${index === activeRow ? ' active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive({ kw: keyword, index })}
                    onClick={() => jumpToHit(index)}
                    role="option"
                    aria-selected={index === activeRow}
                  >
                    <Icon name={hit.node.type === 'dir' ? 'folder' : 'file'} size={13} />
                    <span className="hit-body">
                      <span className="hit-name">
                        {riskOf(hit.node).level !== 'caution' && `${riskOf(hit.node).icon} `}
                        {hit.node.name}
                      </span>
                      <span className="hit-path">{hit.node.path}</span>
                    </span>
                    <span className="hit-size">{formatBytes(hit.node.size)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn ghost sm"
            onClick={() => void exportReport()}
            title="把大文件清单导出成 CSV（Excel 能直接打开）"
          >
            <Icon name="export" size={13} /> 导出
          </button>
        </div>
      </div>

      <div className="toolbar-row second">
        <div className="view-tabs" role="tablist" aria-label="视图切换">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={view === tab.key}
              className={`tab${view === tab.key ? ' active' : ''}`}
              onClick={() => setView(tab.key)}
              title={tab.hint}
            >
              <Icon name={tab.icon} size={13} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {filterable && (
          <div className="filter-bar">
            <span className="filter-label">只看</span>
            {(['all', 'dir', 'file'] as const).map((key) => (
              <button
                key={key}
                className={`chip${activeType === key ? ' active' : ''}`}
                onClick={() =>
                  setTypes(key === 'all' ? ['dir', 'file'] : key === 'dir' ? ['dir'] : ['file'])
                }
              >
                {key === 'all' ? '全部' : key === 'dir' ? '目录' : '文件'}
              </button>
            ))}

            <select
              className="select sm"
              value={filters.minSize}
              onChange={(event) => setMinSize(Number(event.target.value))}
              title="只影响图表显示，不影响统计"
            >
              {MIN_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {filters.category && (
              <button
                className="chip accent"
                onClick={() => setCategory(null)}
                title="取消类型筛选"
              >
                {CATEGORY_META[filters.category].icon} {CATEGORY_META[filters.category].label} ✕
              </button>
            )}
            {filters.ext !== null && (
              <button className="chip accent" onClick={() => setExt(null)} title="取消后缀筛选">
                .{filters.ext || '无后缀'} ✕
              </button>
            )}
            {hasFilter && (
              <button className="chip subtle" onClick={resetFilters}>
                清空筛选
              </button>
            )}
          </div>
        )}

        {!rememberPath && <span className="filter-note">提示：设置里关掉了「记住上次路径」</span>}
      </div>
    </div>
  )
}
