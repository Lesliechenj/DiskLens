// 被跳过的路径清单：扫描时无权限/已被删除的目录，扫完一次说清楚
// 顺便告诉小白"怎么扫得更全"（以管理员身份运行）——需求文档里 V1.x 的引导

import { useUiStore } from '../store/uiStore'
import { useScanStore } from '../store/scanStore'
import { formatCount } from '../../../shared/format'
import { Icon } from './icons'
import { EmptyState } from './ui/EmptyState'

export function SkippedDialog(): React.JSX.Element | null {
  const open = useUiStore((state) => state.skippedOpen)
  const close = useUiStore((state) => state.closeSkipped)
  const result = useScanStore((state) => state.result)

  if (!open || !result) return null

  const skipped = result.skipped

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={close}>
      <div
        className="modal skipped-modal"
        role="dialog"
        aria-modal="true"
        aria-label="被跳过的路径"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h3>
            <Icon name="alert" size={16} /> 被跳过的路径
          </h3>
          <button className="icon-btn xs" onClick={close} title="关闭" aria-label="关闭">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="skipped-body">
          <p className="skipped-summary">
            这次扫描一共跳过 <b>{formatCount(result.skippedCount)}</b>{' '}
            个路径（没有权限、或扫描时已被删除）。 跳过不影响其它内容的统计。
          </p>

          {skipped.length === 0 ? (
            <EmptyState
              icon="check"
              title="没有记录到具体路径"
              hint="可能是权限问题导致的整体跳过。"
            />
          ) : (
            <ul className="skipped-list selectable">
              {skipped.map((path) => (
                <li key={path} title={path}>
                  {path}
                </li>
              ))}
            </ul>
          )}
          {result.skippedCount > skipped.length && (
            <p className="muted skipped-more">
              只列出了前 {formatCount(skipped.length)} 条，其余{' '}
              {formatCount(result.skippedCount - skipped.length)} 条省略。
            </p>
          )}

          <div className="skipped-tip">
            <Icon name="shield" size={14} />
            <span>
              想扫得更全？关掉 DiskLens，右键图标选「以管理员身份运行」再试——
              某些系统目录普通权限读不到。
            </span>
          </div>
        </div>

        <footer className="modal-foot">
          <span className="muted">删除只进回收站，删除前会二次确认</span>
          <button className="btn primary sm" onClick={close}>
            知道了
          </button>
        </footer>
      </div>
    </div>
  )
}
