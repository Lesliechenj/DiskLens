// 清理完成后的报告弹窗：每次清理都会弹，告诉小白"清了多少、前后差多少、清的是什么"
// 最下方固定两个入口：在文件夹中显示报告 / 打开详细 HTML 报告

import { useUiStore } from '../store/uiStore'
import { formatBytes, formatCount, formatPercent } from '../../../shared/format'
import { locatePath, openPath } from '../lib/actions'
import { Icon } from './icons'

export function CleanupReportDialog(): React.JSX.Element | null {
  const report = useUiStore((state) => state.cleanupReport)
  const close = useUiStore((state) => state.closeCleanupReport)
  if (!report) return null

  const beforeByPath = new Map(report.beforeDrives.map((drive) => [drive.path, drive]))
  const allOk = report.failedCount === 0
  const topItems = [...report.targets]
    .filter((target) => report.outcomes.find((item) => item.path === target.path)?.ok)
    .sort((a, b) => b.size - a.size)
    .slice(0, 6)

  return (
    <div className="modal-overlay report-overlay" role="presentation" onMouseDown={close}>
      <div
        className="modal cleanup-report-modal"
        role="dialog"
        aria-modal="true"
        aria-label="清理报告"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="report-hero">
          <div className={`report-badge ${allOk ? 'ok' : 'warn'}`}>
            <Icon name={allOk ? 'check' : 'alert'} size={24} />
          </div>
          <div className="report-hero-text">
            <h2>{allOk ? '清理完成！' : '清理完成，有少量项目没删掉'}</h2>
            <p>
              {report.mode === 'elevated' ? '本次使用了一次管理员授权 · ' : ''}
              共处理 {formatCount(report.itemCount)} 项，用时{' '}
              {(report.durationMs / 1000).toFixed(1)} 秒
            </p>
          </div>
          <button className="icon-btn xs" onClick={close} title="关闭报告" aria-label="关闭报告">
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="report-body">
          <div className="report-big-number">
            <span>{report.purged ? '实际释放空间' : '已清理（移入回收站）'}</span>
            <strong>{formatBytes(report.freedBytes)}</strong>
            <em>
              成功 {formatCount(report.successCount)} 项
              {report.failedCount > 0 ? ` · 失败 ${formatCount(report.failedCount)} 项` : ''}
              {report.purged
                ? ` · 已彻底删除 ${formatCount(report.purgedCount ?? report.successCount)} 项`
                : ' · 可还原'}
            </em>
          </div>

          <section className="report-section">
            <h3>
              <Icon name="drive" size={14} /> 清理前后磁盘可用空间
            </h3>
            <div className="report-drives">
              {report.afterDrives.map((after) => {
                const before = beforeByPath.get(after.path)
                const delta = after.freeBytes - (before?.freeBytes ?? after.freeBytes)
                return (
                  <div key={after.path} className="report-drive">
                    <div className="report-drive-head">
                      <b>{after.label}</b>
                      <span>{after.volumeName || '本地磁盘'}</span>
                      <em className={delta >= 0 ? 'up' : 'down'}>
                        {delta >= 0 ? '+' : '-'}
                        {formatBytes(Math.abs(delta))}
                      </em>
                    </div>
                    <div className="report-drive-bar">
                      <i
                        style={{
                          width: `${Math.max(2, (after.freeBytes / after.totalBytes) * 100)}%`
                        }}
                      />
                    </div>
                    <div className="report-drive-meta">
                      <span>清理前可用 {formatBytes(before?.freeBytes ?? after.freeBytes)}</span>
                      <span>现在可用 {formatBytes(after.freeBytes)}</span>
                      <span>可用率 {formatPercent(after.freeBytes, after.totalBytes)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {report.groups.length > 0 && (
            <section className="report-section">
              <h3>
                <Icon name="tags" size={14} /> 清了哪些类别
              </h3>
              <div className="report-groups">
                {report.groups.map((group) => (
                  <div key={group.id} className="report-group">
                    <span>{group.title}</span>
                    <b>{formatBytes(group.size)}</b>
                    <em>{formatCount(group.count)} 项</em>
                  </div>
                ))}
              </div>
            </section>
          )}

          {topItems.length > 0 && (
            <section className="report-section">
              <h3>
                <Icon name="list" size={14} /> 最大的几项
              </h3>
              <div className="report-items">
                {topItems.map((item) => (
                  <div key={item.path} className="report-item">
                    <Icon name={item.type === 'dir' ? 'folder' : 'file'} size={12} />
                    <span className="ellipsis">{item.name}</span>
                    <b>{formatBytes(item.size)}</b>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className={`report-note${report.purged ? ' warn' : ''}`}>
            <Icon name={report.purged ? 'alert' : 'recycle'} size={13} />
            {report.purged
              ? '这批项目已经从回收站彻底删除，无法恢复；磁盘可用空间已经真正增加。'
              : '删掉的东西都在系统回收站里，可以还原；清空回收站后才会真正释放磁盘空间。'}
          </p>

          {report.failedCount > 0 && (
            <p className="report-note warn">
              <Icon name="alert" size={13} />有 {formatCount(report.failedCount)}{' '}
              项没删掉，通常是文件正在使用或权限不够。详细原因写在报告里。
            </p>
          )}

          <div className="report-path">
            <span>详细报告：</span>
            <code title={report.reportPath}>{report.reportPath}</code>
          </div>
        </div>

        <footer className="report-foot">
          <button className="btn ghost sm" onClick={() => void locatePath(report.reportPath)}>
            <Icon name="locate" size={13} /> 查看报告存放路径
          </button>
          <button className="btn primary sm" onClick={() => void openPath(report.reportPath)}>
            <Icon name="external" size={13} /> 打开详细报告
          </button>
          <button className="btn sm" onClick={close}>
            完成
          </button>
        </footer>
      </div>
    </div>
  )
}
