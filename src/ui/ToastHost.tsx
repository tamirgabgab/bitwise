import { CloseIcon } from './icons.tsx'
import { dismissToast, useToasts } from './toasts.ts'

/** The short messages on show, stacked above the status bar. */
export function ToastHost() {
  const toasts = useToasts((state) => state.toasts)

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className="toast">
          <span>{item.message}</span>
          <button
            type="button"
            className="tool"
            aria-label="Dismiss this message"
            title="Dismiss this message"
            onClick={() => dismissToast(item.id)}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  )
}
