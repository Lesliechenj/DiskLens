import { useEffect, useRef } from 'react'

interface ConfirmModalProps {
  title: string
  /** 支持 \n 分行的说明文案 */
  message: string
  confirmText?: string
  /** 危险操作样式（回收站按钮用警示色） */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 删前二次确认弹窗（F5 安全红线的一部分） */
export function ConfirmModal({
  title,
  message,
  confirmText = '确定',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmModalProps): React.JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Esc 取消；挂载后焦点落在"取消"上（防误触回车直接确认）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    confirmRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {message.split('\n').map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="modal-actions">
          <button ref={confirmRef} onClick={onCancel}>
            取消
          </button>
          <button className={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
