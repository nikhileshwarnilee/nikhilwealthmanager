import { useToast } from '../app/ToastContext';

const toneClass = {
  info: 'bg-slate-800 text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white'
};

export default function ToastViewport() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[70] w-[calc(100%-1.5rem)] max-w-[440px] -translate-x-1/2 space-y-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`pointer-events-auto w-full rounded-xl px-3 py-2 text-left text-sm font-semibold shadow-card animate-slide-up ${toneClass[toast.type] || toneClass.info}`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

