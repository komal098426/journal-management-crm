"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";

/** The original app's glass modal, reusable for every quick form. */
export function Modal({
  eyebrow = "Quick create",
  title,
  description,
  onClose,
  children,
  wide,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxHeight: "calc(100vh - 40px)", overflowY: "auto", ...(wide ? { width: "min(760px, 100%)" } : {}) }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : <div style={{ height: 16 }} />}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A modal form that handles submit state and shows server errors inline. */
export function FormModal({
  title,
  description,
  eyebrow,
  submitLabel,
  onClose,
  onSubmit,
  children,
  wide,
  danger,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
  children: React.ReactNode;
  wide?: boolean;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={title} description={description} eyebrow={eyebrow} onClose={onClose} wide={wide}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSubmit(new FormData(event.currentTarget));
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        {children}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={busy} style={danger ? { color: "#9a5e57" } : undefined}>
            <Check size={14} /> {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
