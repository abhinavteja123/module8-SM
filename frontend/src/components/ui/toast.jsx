import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((message, { type = 'success', duration = 4000 } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const api = {
    success: (message, opts) => push(message, { ...opts, type: 'success' }),
    error: (message, opts) => push(message, { ...opts, type: 'error' }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-ink/10"
            >
              {t.type === 'success' ? (
                <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" />
              ) : (
                <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red-600" />
              )}
              <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="shrink-0 text-slate-400 hover:text-ink" aria-label="Dismiss">
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
