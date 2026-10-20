// 新手向导：扫描全部磁盘 → 看推荐清理项 → 一次清理 → 自动报告
// 目标是把"我该从哪下手"变成三个大按钮，默认只勾选安全项。

import { useMemo, useState } from 'react'
import { useScanStore } from '../store/scanStore'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore, toast } from '../store/uiStore'
import { useStartScan } from '../hooks/useStartScan'
import { useCleanupGroups } from '../hooks/useDerived'
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatRelativeTime
} from '../../../shared/format'
import { findCleanupGroups, mergeCleanupGroups, type CleanupGroup } from '../lib/cleanup'
import type { CleanupTarget, ScanResult } from '../../../shared/types'
import { runCleanup, toCleanupTargets } from '../lib/cleanupRun'
import { Icon } from './icons'

type WizardStep = 'locations' | 'scanning' | 'review' | 'cleaning'

export function CleanupWizard(): React.JSX.Element {
  const close = useUiStore((state) => state.closeWizard)
  const settings = useSettingsStore((state) => state.settings)
  const patch = useSettingsStore((state) => state.patch)
  const drives = useSettingsStore((state) => state.drives)
  const status = useScanStore((state) => state.status)
  const progress = useScanStore((state) => state.progress)
  const result = useScanStore((state) => state.result)
  const error = useScanStore((state) => state.error)
  const loadResult = useScanStore((state) => state.loadResult)
  const snapshotMeta = useScanStore((state) => state.snapshotMeta)
  const setView = useScanStore((state) => state.setView)
  const startScan = useStartScan()
  const fullGroups = useCleanupGroups()

  const [junkResult, setJunkResult] = useState<ScanResult | null>(null)
  const [phase, setPhase] = useState<'junk' | 'disk'>('junk')
  const [mode, setMode] = useState<'quick' | 'full'>(result ? 'full' : 'quick')
  const groups = useMemo(
    () =>
      mergeCleanupGroups(
        mode === 'full' ? fullGroups : [],
        junkResult ? findCleanupGroups(junkResult.root) : []
      ),
    [fullGroups, junkResult, mode]
  )

  const [step, setStep] = useState<WizardStep>(result ? 'review' : 'locations')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () =>
      new Set(
        (drives.length > 0 ? drives : [{ path: 'C:/', removable: false }])
          .filter((drive) => !drive.removable)
          .map((drive) => drive.path)
      )
  )
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({})
  const [purgeAfter, setPurgeAfter] = useState(false)
  const [busy, setBusy] = useState(false)

  const effectiveStep: WizardStep =
    step === 'scanning' && status === 'done'
      ? 'review'
      : step === 'scanning' && (status === 'idle' || status === 'error')
        ? 'locations'
        : step

  const safeGroups = useMemo(() => groups.filter((group) => group.level === 'safe'), [groups])
  const cautionGroups = useMemo(() => groups.filter((group) => group.level === 'caution'), [groups])

  const isGroupSelected = (group: CleanupGroup): boolean =>
    groupOverrides[group.id] ?? group.level === 'safe'

  const selectedGroups = useMemo(
    () => groups.filter((group) => isGroupSelected(group)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupOverrides 是唯一可变来源
    [groups, groupOverrides]
  )

  const selectedTargets = useMemo(() => {
    const targets: CleanupTarget[] = []
    for (const group of selectedGroups) {
      targets.push(...toCleanupTargets(group.nodes, group.title, group.id))
    }
    return targets
  }, [selectedGroups])

  const selectedSize = selectedTargets.reduce((sum, target) => sum + target.size, 0)

  const togglePath = (path: string): void => {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleGroup = (group: CleanupGroup): void => {
    setGroupOverrides((current) => ({ ...current, [group.id]: !isGroupSelected(group) }))
  }

  const start = async (): Promise<void> => {
    const paths = [...selectedPaths]
    if (mode === 'full' && paths.length === 0) {
      toast('info', '至少选一个磁盘或文件夹')
      return
    }
    setStep('scanning')
    setPhase('junk')
    // 先扫已知临时/缓存目录（快）；快速模式下这就是全部扫描
    const junk: { ok: boolean; result?: ScanResult } = await window.api
      .scanJunk()
      .catch(() => ({ ok: false }))
    if (junk.ok && junk.result) setJunkResult(junk.result)
    if (mode === 'quick') {
      setStep('review')
      return
    }
    setPhase('disk')
    await startScan(paths)
  }

  const restoreSnapshot = async (): Promise<void> => {
    const loaded = await window.api.loadSnapshot().catch(() => null)
    if (!loaded) {
      toast('err', '这份快照读不出来，重新扫描一次吧')
      return
    }
    loadResult(loaded)
    setJunkResult(null)
    setMode('full')
    setStep('review')
    toast('ok', '已恢复上次扫描结果，不用重新扫盘')
  }

  const clean = async (): Promise<void> => {
    if (selectedTargets.length === 0) {
      toast('info', '还没有勾选要清理的内容')
      return
    }
    setBusy(true)
    setStep('cleaning')
    const ok = await runCleanup(selectedTargets, {
      label: selectedGroups.map((group) => group.title).join(' / ') || '新手向导',
      elevation: settings.cleanupElevation,
      purgeAfter
    })
    setBusy(false)
    if (ok) {
      await patch({ onboarded: true })
      close()
    } else {
      setStep('review')
    }
  }

  const finish = (): void => {
    void patch({ onboarded: true })
    close()
  }

  const showReview = effectiveStep === 'review'
  const showCleaning = effectiveStep === 'cleaning'

  return (
    <div className="modal-overlay wizard-overlay" role="presentation" onMouseDown={finish}>
      <div
        className="modal cleanup-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="新手清理向导"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="wizard-head">
          <div>
            <h2>
              <Icon name="sparkle" size={18} /> 新手清理向导
            </h2>
            <p>跟着三步走，只清理临时文件、缓存和空文件夹，不碰你的文档和照片。</p>
          </div>
          <button className="icon-btn xs" onClick={finish} title="关闭" aria-label="关闭向导">
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="wizard-steps">
          {[
            { key: 'locations', label: '1 选位置' },
            { key: 'scanning', label: '2 扫描' },
            { key: 'review', label: '3 确认清理' }
          ].map((item, index) => {
            const active =
              (item.key === 'locations' && effectiveStep === 'locations') ||
              (item.key === 'scanning' && effectiveStep === 'scanning') ||
              (item.key === 'review' && (showReview || showCleaning))
            const done =
              (item.key === 'locations' && effectiveStep !== 'locations') ||
              (item.key === 'scanning' && (showReview || showCleaning))
            return (
              <span
                key={item.key}
                className={`wizard-step${active ? ' active' : ''}${done ? ' done' : ''}`}
              >
                {done ? <Icon name="check" size={12} /> : <b>{index + 1}</b>}
                {item.label.slice(2)}
              </span>
            )
          })}
        </div>

        <div className="wizard-body">
          {effectiveStep === 'locations' && (
            <div className="wizard-locations">
              <div className="wizard-modes">
                <button
                  className={`wizard-mode${mode === 'quick' ? ' active' : ''}`}
                  onClick={() => setMode('quick')}
                >
                  <Icon name="broom" size={17} />
                  <b>快速清理（推荐）</b>
                  <span>只查临时文件、浏览器缓存、系统更新缓存、错误报告，通常 1–2 分钟</span>
                </button>
                <button
                  className={`wizard-mode${mode === 'full' ? ' active' : ''}`}
                  onClick={() => setMode('full')}
                >
                  <Icon name="search" size={17} />
                  <b>完整扫描</b>
                  <span>连三个盘的所有文件一起扫，能发现大文件/旧文件，但可能要几分钟</span>
                </button>
              </div>

              {mode === 'full' ? (
                <>
                  <p className="wizard-lead">
                    勾选要检查的位置。默认三个本地磁盘都选上；DiskLens 会自动跳过 Windows
                    等系统危险目录。
                  </p>
                  <div className="wizard-drive-grid">
                    {drives.map((drive) => {
                      const checked = selectedPaths.has(drive.path)
                      return (
                        <label
                          key={drive.path}
                          className={`wizard-drive${checked ? ' checked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePath(drive.path)}
                          />
                          <span className="wizard-drive-letter">{drive.label}</span>
                          <span className="wizard-drive-body">
                            <b>{drive.volumeName || '本地磁盘'}</b>
                            <span>
                              可用 {formatBytes(drive.freeBytes)} / 共{' '}
                              {formatBytes(drive.totalBytes)}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="wizard-lead">
                  会检查所有磁盘上的临时文件、浏览器缓存、Windows 更新缓存和错误报告，
                  不会扫描你的文档、照片或游戏文件。
                </p>
              )}

              {snapshotMeta && (
                <button className="wizard-snapshot" onClick={() => void restoreSnapshot()}>
                  <Icon name="clock" size={15} />
                  <span>
                    <b>恢复上次扫描结果</b>
                    <em>
                      {formatRelativeTime(snapshotMeta.createdAt)} ·{' '}
                      {formatBytes(snapshotMeta.totalBytes)} · {formatCount(snapshotMeta.files)}{' '}
                      个文件（不用重扫）
                    </em>
                  </span>
                  <Icon name="chevronRight" size={14} />
                </button>
              )}

              {error && <p className="trash-error">{error}</p>}

              <p className="wizard-hint">
                <Icon name="info" size={12} />
                扫描只读取文件名和大小，不会修改任何文件；清理时删除的东西也只会进回收站。
              </p>
            </div>
          )}

          {effectiveStep === 'scanning' && (
            <div className="wizard-scanning">
              <div className="scanning-spinner" aria-hidden="true" />
              <h3>
                {phase === 'junk'
                  ? '正在扫描系统临时文件与浏览器缓存…'
                  : `正在扫描 ${selectedPaths.size} 个位置…`}
              </h3>
              {phase === 'disk' && (
                <>
                  <p>
                    {formatCount(progress?.files ?? 0)} 个文件 · {formatCount(progress?.dirs ?? 0)}{' '}
                    个目录 · {formatBytes(progress?.bytes ?? 0)} ·{' '}
                    {formatDuration(progress?.elapsedMs ?? 0)}
                  </p>
                  <p className="wizard-current" title={progress?.currentPath}>
                    {progress?.currentPath ?? '正在准备…'}
                  </p>
                </>
              )}
              {phase === 'junk' && (
                <p className="wizard-current">只扫已知缓存目录，比整盘快；扫完会继续扫磁盘</p>
              )}
              <button
                className="btn danger sm"
                onClick={() => {
                  window.api.cancelJunkScan()
                  window.api.cancelScan()
                }}
              >
                <Icon name="stop" size={13} /> 取消
              </button>
              {error && <p className="trash-error">{error}</p>}
            </div>
          )}

          {showReview && (
            <div className="wizard-review">
              <div className="wizard-summary">
                <span>建议清理</span>
                <strong>{formatBytes(selectedSize)}</strong>
                <em>{formatCount(selectedTargets.length)} 项</em>
              </div>
              {junkResult && (
                <p className="wizard-hint">
                  <Icon name="check" size={12} /> 已额外扫描系统临时文件和浏览器缓存（
                  {formatCount(junkResult.stats.files)} 个文件），所以比只看整盘更彻底。
                </p>
              )}

              <label className="wizard-purge">
                <input
                  type="checkbox"
                  checked={purgeAfter}
                  onChange={(event) => setPurgeAfter(event.target.checked)}
                />
                <span>
                  <b>清理后立即彻底释放空间</b>
                  <em>
                    勾选后，这批项目会从回收站彻底删除，无法恢复，但磁盘可用空间会马上增加。
                    不勾选则只移到回收站，随时能还原。
                  </em>
                </span>
              </label>

              {groups.length === 0 ? (
                <div className="wizard-empty">
                  <Icon name="sparkle" size={24} />
                  <b>没找到可以放心清理的东西</b>
                  <p>你的磁盘挺干净的。也可以点「看看完整清理建议」自己挑。</p>
                </div>
              ) : (
                <>
                  {safeGroups.length > 0 && (
                    <section className="wizard-group">
                      <h3>
                        <Icon name="shield" size={14} /> 推荐清理（默认已勾选）
                      </h3>
                      {safeGroups.map((group) => (
                        <label key={group.id} className="wizard-item">
                          <input
                            type="checkbox"
                            checked={isGroupSelected(group)}
                            onChange={() => toggleGroup(group)}
                          />
                          <Icon name={group.icon} size={14} />
                          <span className="wizard-item-body">
                            <b>{group.title}</b>
                            <em>{group.desc}</em>
                          </span>
                          <span className="wizard-item-size">{formatBytes(group.totalSize)}</span>
                          <span className="wizard-item-count">{formatCount(group.count)} 项</span>
                        </label>
                      ))}
                    </section>
                  )}

                  {cautionGroups.length > 0 && (
                    <section className="wizard-group caution">
                      <h3>
                        <Icon name="alert" size={14} /> 需要你确认（默认不勾）
                      </h3>
                      {cautionGroups.map((group) => (
                        <label key={group.id} className="wizard-item">
                          <input
                            type="checkbox"
                            checked={isGroupSelected(group)}
                            onChange={() => toggleGroup(group)}
                          />
                          <Icon name={group.icon} size={14} />
                          <span className="wizard-item-body">
                            <b>{group.title}</b>
                            <em>{group.desc}</em>
                          </span>
                          <span className="wizard-item-size">{formatBytes(group.totalSize)}</span>
                          <span className="wizard-item-count">{formatCount(group.count)} 项</span>
                        </label>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {showCleaning && (
            <div className="wizard-cleaning">
              <div className="scanning-spinner" aria-hidden="true" />
              <h3>正在清理…</h3>
              <p>{busy ? '正在移到回收站，需要一点时间' : '正在生成报告'}</p>
              <p className="wizard-hint">
                <Icon name="shield" size={12} /> 如果这次包含系统缓存，只会弹一次管理员授权。
              </p>
            </div>
          )}
        </div>

        <footer className="wizard-foot">
          {effectiveStep === 'locations' && (
            <>
              <button className="btn ghost sm" onClick={finish}>
                先不用了
              </button>
              <button
                className="btn primary"
                onClick={() => void start()}
                disabled={mode === 'full' && selectedPaths.size === 0}
              >
                <Icon name="search" size={14} />{' '}
                {mode === 'quick' ? '开始快速扫描' : `开始扫描（${selectedPaths.size} 个位置）`}
              </button>
            </>
          )}
          {effectiveStep === 'scanning' && (
            <span className="muted">扫描完成后会自动进入确认页</span>
          )}
          {showReview && (
            <>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setView('cleanup')
                  finish()
                }}
              >
                看看完整清理建议
              </button>
              <button
                className="btn danger"
                disabled={selectedTargets.length === 0}
                onClick={() => void clean()}
              >
                <Icon name="trash" size={14} /> 清理这 {formatCount(selectedTargets.length)} 项（
                {formatBytes(selectedSize)}）
              </button>
            </>
          )}
          {showCleaning && <span className="muted">正在处理，请不要关闭窗口…</span>}
        </footer>
      </div>
    </div>
  )
}
