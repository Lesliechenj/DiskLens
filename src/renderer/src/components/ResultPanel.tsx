import { useCallback, useMemo, useRef, useState } from 'react'
import { useScanStore } from '../store/scanStore'
import { formatBytes } from '../../../shared/format'
import { SEARCH_LIMIT, searchTree } from '../lib/searchTree'
import { TreemapView } from './TreemapView'
import { PieView } from './PieView'

/** 结果区工具栏：视图切换 + 类型筛选 + 搜索（F3/F4） */
export function ResultPanel(): React.JSX.Element {
  const { view, setView, visibleTypes, setVisibleTypes, extFilter, setExtFilter, result, jumpTo } =
    useScanStore()
  const [keyword, setKeyword] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const blurTimer = useRef<number | undefined>(undefined)

  const hits = useMemo(
    () => (result && keyword.trim() ? searchTree(result.root, keyword) : []),
    [result, keyword]
  )

  const activeType = visibleTypes.length === 2 ? 'all' : visibleTypes[0]

  const handleType = useCallback(
    (key: string) => {
      if (key === 'all') setVisibleTypes(['dir', 'file'])
      else if (key === 'dir') setVisibleTypes(['dir'])
      else setVisibleTypes(['file'])
    },
    [setVisibleTypes]
  )

  const jumpToHit = useCallback(
    (index: number) => {
      const hit = hits[index]
      if (!hit) return
      jumpTo(hit.ancestors, hit.node)
      setSearchOpen(false)
    },
    [hits, jumpTo]
  )

  // 失焦延迟关闭，给点击留时间（用 mousedown 抢在 blur 前触发）
  const scheduleClose = useCallback(() => {
    blurTimer.current = window.setTimeout(() => setSearchOpen(false), 180)
  }, [])
  const cancelClose = useCallback(() => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current)
  }, [])

  return (
    <div className="result-panel">
      <div className="toolbar">
        <div className="view-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'treemap'}
            className={`tab ${view === 'treemap' ? 'active' : ''}`}
            onClick={() => setView('treemap')}
          >
            ▦ 面积图
          </button>
          <button
            role="tab"
            aria-selected={view === 'pie'}
            className={`tab ${view === 'pie' ? 'active' : ''}`}
            onClick={() => setView('pie')}
          >
            ◔ 饼图
          </button>
        </div>

        <div className="search-box">
          <input
            className="search-input"
            value={keyword}
            placeholder="搜索文件或目录名…"
            spellCheck={false}
            onChange={(e) => {
              setKeyword(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => keyword.trim() && setSearchOpen(true)}
            onBlur={scheduleClose}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits.length > 0) jumpToHit(0)
              if (e.key === 'Escape') {
                setKeyword('')
                setSearchOpen(false)
              }
            }}
          />
          {searchOpen && keyword.trim() && (
            <div className="search-results" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
              <div className="search-count">
                {hits.length > 0
                  ? `找到 ${hits.length} 个${hits.length >= SEARCH_LIMIT ? `（最多显示 ${SEARCH_LIMIT} 个）` : ''}`
                  : `没有找到匹配「${keyword.trim()}」的内容`}
              </div>
              {hits.map((hit, i) => (
                <button
                  key={hit.node.path}
                  className="search-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => jumpToHit(i)}
                >
                  <span className={`hit-type ${hit.node.type}`}>
                    {hit.node.type === 'dir' ? '目录' : '文件'}
                  </span>
                  <span className="hit-body">
                    <span className="hit-name">{hit.node.name}</span>
                    <span className="hit-path">{hit.node.path}</span>
                  </span>
                  <span className="hit-size">{formatBytes(hit.node.size)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {view === 'treemap' && (
        <div className="filter-bar">
          <span className="filter-label">只看：</span>
          {[
            { key: 'all', label: '全部' },
            { key: 'dir', label: '目录' },
            { key: 'file', label: '文件' }
          ].map((t) => (
            <button
              key={t.key}
              className={`chip ${activeType === t.key ? 'active' : ''}`}
              onClick={() => handleType(t.key)}
            >
              {t.label}
            </button>
          ))}
          {extFilter !== null && (
            <button className="chip ext" onClick={() => setExtFilter(null)} title="点击取消该筛选">
              仅 .{extFilter} 文件 ✕
            </button>
          )}
        </div>
      )}

      {view === 'treemap' ? <TreemapView /> : <PieView />}
    </div>
  )
}
