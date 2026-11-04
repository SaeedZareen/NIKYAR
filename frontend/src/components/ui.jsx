import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toFa } from "../fa.js";

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 760 } : undefined} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="x-btn" onClick={onClose} aria-label="بستن">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const show = useCallback((msg, kind = "ok") => {
    setT({ msg, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 3500);
    return () => clearTimeout(h);
  }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast ${t.kind === "error" ? "error" : ""}`} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function StatusBadge({ status, label }) {
  const cls = { running: "", open: "badge-amber", completed: "badge-green", done: "badge-green",
    cancelled: "badge-gray", error: "badge-red" }[status] ?? "badge-gray";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {children}
    </div>
  );
}

export function Loading() {
  return <div className="empty">در حال بارگذاری…</div>;
}

export function Fa({ children }) {
  return <>{toFa(children)}</>;
}
