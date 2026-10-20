// 详情面板：选中任何一块/一行之后，右边告诉你"这是什么、能不能删、删了会怎样"
// 图片给缩略图、文本给头部内容——"我操作得到底是哪个文件"一眼可见

import { useEffect, useMemo, useState } from 'react'
import { useScanStore } from '../store/scanStore'
import {
  formatBytes,
  formatCount,
  formatPercent,
  formatRelativeTime,
  formatTime
} from '../../../shared/format'
import { CATEGORY_META, extInfo } from '../../../shared/extCategories'
import { RISK, riskOf } from '../../../shared/risk'
import type { PreviewResult } from '../../../shared/previewKinds'
import { countChildren, findNodeByPath } from '../lib/insights'
import { categoryColor, categoryOfNode } from '../lib/chartCommon'
import { copyText, locatePath, openPath } from '../lib/actions'
import { useUiStore } from '../store/uiStore'
import { Icon } from './icons'

/** 目录里"最大的几项"显示几条 */
const MINI_LIST = 5

export function DetailsPanel(): React.JSX.Element | null {
  const selected = useScanStore((state) => state.selected)
  const select = useScanStore((state) => state.select)
  const result = useScanStore((state) => state.result)
  const treeVersion = useScanStore((state) => state.treeVersion)
  const jumpTo = useScanStore((state) => state.jumpTo)
  const setExt = useScanStore((state) => state.setExt)
  const setView = useScanStore((state) => state.setView)
  const requestTrash = useUiStore((state) => state.requestTrash)

  const [preview, setPreview] = useState<{ path: string; data: PreviewResult } | null>(null)

  // 选中变化 → 拉预览（只对文件；目录不预览）。防串台：回来时对一下路径
  useEffect(() => {
    if (!selected || selected.type !== 'file') return
    let stale = false
    const path = selected.path
    window.api
      .previewFile(path)
      .then((data) => {
        if (!stale) setPreview({ path, data })
      })
      .catch(() => {
        if (!stale) setPreview({ path, data: { kind: 'error', message: '预览读取失败' } })
      })
    return () => {
      stale = true
    }
  }, [selected])

  // 目录里到底有多少文件：走子树统计，结果按选中节点+树版本记忆化（别每次渲染都扫一遍）
  const subtree = useMemo(() => {
    if (!selected || selected.type !== 'dir') return null
    return countChildren(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- treeVersion 让"删完之后"重算
  }, [selected, treeVersion])

  // 真正的上一层（大文件榜/搜索结果里的节点不一定在当前面包屑上）
  const parent = useMemo(
    () => {
      if (!result || !selected) return null
      const found = findNodeByPath(result.root, selected.path)
      return found && found.ancestors.length > 0
        ? found.ancestors[found.ancestors.length - 1]
        : null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- treeVersion 让"删完之后"重算
    [result, selected, treeVersion]
  )

  if (!selected || !result) return null

  const totalSize = result.root.size
  const parentSize = parent?.size ?? totalSize
  const risk = riskOf(selected)
  const isDir = selected.type === 'dir'
  const isVirtualRoot = !selected.path.trim()
  const info = isDir ? null : extInfo(selected.name)
  const category = categoryOfNode(selected)
  const activePreview = preview && preview.path === selected.path ? preview.data : null
  const children = isDir ? [...(selected.children ?? [])].sort((a, b) => b.size - a.size) : []

  const enterDir = (): void => {
    const found = findNodeByPath(result.root, selected.path)
    if (!found) return
    jumpTo(found.ancestors, found.node)
    select(null)
    setView('treemap')
  }

  const onlyThisType = (): void => {
    if (isDir) return
    const found = findNodeByPath(result.root, selected.path)
    if (found) jumpTo(found.ancestors)
    const dot = selected.name.lastIndexOf('.')
    setExt(dot > 0 ? selected.name.slice(dot + 1).toLowerCase() : '')
    setView('treemap')
  }

  return (
    <aside className="details">
      <header className="details-head">
        <span className="details-kind">
          <Icon name={isDir ? 'folder' : 'file'} size={14} />
          {isDir ? '文件夹' : '文件'}
        </span>
        <button
          className="icon-btn xs"
          onClick={() => select(null)}
          title="关闭详情"
          aria-label="关闭详情"
        >
          <Icon name="close" size={13} />
        </button>
      </header>

      <div className="details-title">
        <i className="cat-dot" style={{ background: categoryColor(category) }} />
        <h2 title={selected.name}>{selected.name}</h2>
      </div>

      <div className="details-badges">
        <span className={`risk-badge ${risk.level}`} title={risk.hint}>
          <Icon name={risk.icon} size={13} /> {risk.label}
        </span>
        <span className="tag">
          <Icon name={CATEGORY_META[category]?.icon ?? 'other'} size={13} />
          {CATEGORY_META[category]?.label ?? '其他'}
        </span>
        {info && <span className="tag">{info.label}</span>}
      </div>

      <dl className="details-metrics">
        <div>
          <dt>占用大小</dt>
          <dd className="strong">{formatBytes(selected.size)}</dd>
        </div>
        <div>
          <dt>占上一层</dt>
          <dd>{formatPercent(selected.size, parentSize)}%</dd>
        </div>
        <div>
          <dt>占扫描范围</dt>
          <dd>{formatPercent(selected.size, totalSize)}%</dd>
        </div>
        <div>
          <dt>修改时间</dt>
          <dd title={formatTime(selected.mtime)}>{formatRelativeTime(selected.mtime)}</dd>
        </div>
        {isDir && subtree && (
          <>
            <div>
              <dt>包含文件</dt>
              <dd>{formatCount(subtree.files)} 个</dd>
            </div>
            <div>
              <dt>包含子目录</dt>
              <dd>{formatCount(subtree.dirs)} 个</dd>
            </div>
          </>
        )}
      </dl>

      <p className="details-risk-hint">{risk.hint}</p>

      {!isDir && activePreview && (
        <div className="details-preview">
          {activePreview.kind === 'image' && (
            <img src={activePreview.dataUrl} alt={selected.name} />
          )}
          {activePreview.kind === 'text' && <pre>{(activePreview.text ?? '').slice(0, 1600)}</pre>}
          {activePreview.kind === 'toobig' && <p className="muted">文件太大，不预览了（怕卡）</p>}
          {activePreview.kind === 'none' && <p className="muted">这类文件不预览</p>}
          {activePreview.kind === 'error' && (
            <p className="muted">预览失败：{activePreview.message ?? '读不了这个文件'}</p>
          )}
        </div>
      )}

      {isDir && children.length > 0 && (
        <div className="details-mini">
          <div className="mini-head">里面最大的 {Math.min(MINI_LIST, children.length)} 项</div>
          {children.slice(0, MINI_LIST).map((child) => (
            <button
              key={child.path}
              className="mini-row"
              onClick={() => select(child)}
              title={child.path}
            >
              <Icon name={child.type === 'dir' ? 'folder' : 'file'} size={12} />
              <span className="ellipsis">{child.name}</span>
              <span className="mini-bar">
                <i
                  style={{
                    width: `${children[0].size > 0 ? (child.size / children[0].size) * 100 : 0}%`
                  }}
                />
              </span>
              <b>{formatBytes(child.size)}</b>
            </button>
          ))}
        </div>
      )}

      {isVirtualRoot ? (
        <p className="details-foot">
          <Icon name="info" size={12} />
          这是多盘扫描的汇总层，没有对应的磁盘路径。请从目录树/图表里选择具体磁盘或文件夹。
        </p>
      ) : (
        <>
          <div className="details-path" title={selected.path}>
            <span>{selected.path}</span>
            <button
              className="icon-btn xs"
              onClick={() => void copyText(selected.path)}
              title="复制完整路径"
            >
              <Icon name="copy" size={12} />
            </button>
          </div>

          <div className="details-actions">
            <button className="btn sm" onClick={() => void locatePath(selected.path)}>
              <Icon name="locate" size={13} /> 定位
            </button>
            <button
              className="btn sm"
              onClick={() => void openPath(selected.path)}
              title={isDir ? '用资源管理器打开' : '用默认程序打开'}
            >
              <Icon name="external" size={13} /> 打开
            </button>
            {isDir ? (
              <button className="btn sm" onClick={enterDir}>
                <Icon name="chevronRight" size={13} /> 进入
              </button>
            ) : (
              <button
                className="btn sm"
                onClick={onlyThisType}
                title="回到上一层的面积图，只显示这类文件"
              >
                <Icon name="search" size={13} /> 只看这类
              </button>
            )}
            <button className="btn danger sm full" onClick={() => requestTrash([selected])}>
              <Icon name="trash" size={13} /> 移到回收站
            </button>
          </div>

          <p className="details-foot">
            <Icon name="shield" size={12} />
            {risk.level === RISK.danger.level
              ? '这类文件删了可能让软件/系统出问题，建议用卸载程序'
              : '删除只进回收站，随时能恢复'}
          </p>
        </>
      )}
    </aside>
  )
}
