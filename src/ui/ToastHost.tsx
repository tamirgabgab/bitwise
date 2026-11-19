import { t } from '../i18n/index.ts'
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
          {item.offer && (
            <button
              type="button"
              className="button toast-action"
              onClick={() => {
                dismissToast(item.id)
                item.offer?.run()
              }}
            >
              {item.offer.action}
            </button>
          )}
          <button
            type="button"
            className="tool"
            aria-label={t('Dismiss this message')}
            title={t('Dismiss this message')}
            onClick={() => dismissToast(item.id)}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  )
}
