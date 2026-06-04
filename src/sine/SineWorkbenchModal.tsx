import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function SineWorkbenchModal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="sine-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sine-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sine-modal-head">
          <div>
            {eyebrow ? <span className="sine-eyebrow">{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" className="sine-modal-close" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={18} />
          </button>
        </header>
        <div className="sine-modal-body">{children}</div>
      </section>
    </div>
  );
}
