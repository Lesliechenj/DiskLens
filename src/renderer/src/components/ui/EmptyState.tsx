// 空状态：没有内容时给一句人话解释 + 下一步该点哪儿
// （成熟软件的差别就在这里——不是白屏，也不是空白占位框）

import type { JSX } from 'react'
import { Icon, type IconName } from '../icons'

interface EmptyStateProps {
  icon?: IconName
  title: string
  hint?: string
  action?: { label: string; onClick: () => void }
  children?: JSX.Element | null
}

export function EmptyState({
  icon = 'info',
  title,
  hint,
  action,
  children
}: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && (
        <button className="btn primary sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {children}
    </div>
  )
}
