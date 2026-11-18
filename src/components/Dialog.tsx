import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-root">
      <button type="button" className="backdrop" aria-label="关闭对话框" onClick={onClose} />
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
        <div className="modal-head">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
