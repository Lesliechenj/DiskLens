// 轻提示（toast）：操作结果一句话说清，自动消失

import { useUiStore } from '../../store/uiStore'
import { Icon } from '../icons'

export function ToastHost(): React.JSX.Element {
  const toasts = useUiStore((state) => state.toasts)
  const dismiss = useUiStore((state) => state.dismissToast)

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span className="toast-icon">
            <Icon
              name={toast.kind === 'ok' ? 'check' : toast.kind === 'err' ? 'alert' : 'info'}
              size={15}
            />
          </span>
          <span className="toast-text">{toast.text}</span>
          <button className="toast-close" onClick={() => dismiss(toast.id)} title="关闭">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
