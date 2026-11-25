import { Icon } from './Icon.jsx';

const ToastContext = React.createContext(() => {});
export const useToast = () => React.useContext(ToastContext);

/** toast({ tone: 'success'|'danger'|'info', message }) — bottom-right, 4 s (errors 8 s). */
export function ToastProvider({ children }) {
  const [items, setItems] = React.useState([]);
  const toast = React.useCallback(({ tone = 'success', message }) => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'danger' ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'danger' ? 'error' : t.tone === 'info' ? 'info' : 'check'} size={16} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
