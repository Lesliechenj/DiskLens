// 二次确认弹窗：删除/清空这类不可逆操作的最后一道闸
// Esc 取消、默认焦点在"取消"上（防手快回车误确认）

import { useEffect, useRef } from 'react'
import { Icon } from '../icons'

interface ConfirmDialogProps {
  title: string
  /** 说明文字，数组每项一行 */
  lines: string[]
  confirmText?: string
  cancelText?: string
  /** danger：确认按钮走警示色 */
  tone?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  lines,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
      if (event.key === 'Enter' && document.activeElement === confirmRef.current) {
        event.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    cancelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`modal-icon ${tone}`}>
          <Icon name={tone === 'danger' ? 'alert' : 'info'} size={20} />
        </div>
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">
          {lines.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </div>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={tone === 'danger' ? 'btn danger' : 'btn primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
