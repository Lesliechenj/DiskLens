// 批量移到回收站的进度条：几百个文件一条条删的时候，用户得知道"还有多久"
// 浮在底部中间，删完自动消失

import { useUiStore } from '../store/uiStore'
import { formatCount } from '../../../shared/format'
import { Icon } from './icons'

export function TrashProgressBar(): React.JSX.Element | null {
  const progress = useUiStore((state) => state.trashProgress)
  if (!progress || progress.total <= 0) return null

  const percent = Math.min(100, Math.round((progress.done / progress.total) * 100))
  const done = progress.done >= progress.total

  return (
    <div className="trash-progress" role="status" aria-live="polite">
      <div className="trash-progress-head">
        <Icon name={done ? 'check' : 'trash'} size={14} />
        <b>{done ? '已全部移到回收站' : '正在移到回收站'}</b>
        <span className="trash-progress-count">
          {formatCount(progress.done)} / {formatCount(progress.total)}
        </span>
      </div>
      <div className="trash-progress-bar">
        <i style={{ width: `${percent}%` }} />
      </div>
      <span className="trash-progress-path" title={progress.current}>
        {done ? '可以随时在「回收站」里还原' : progress.current}
      </span>
    </div>
  )
}
