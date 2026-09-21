import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

const COMPLETED = new Set(["completed", "present", "active", "paid", "in_stock", "received", "in", "increase"]);
const PROGRESS = new Set(["in progress", "late", "partial", "returned", "half day"]);
const LEAVE = new Set(["low stock alerts", "leave", "cancelled", "out_of_stock", "absent", "offline", "out", "on leave", "inactive", "decrease"]);

export function titleize(value: string) {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Same badge as the original app, extended to ERP statuses. */
export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="status-badge">—</span>;
  const key = status.toLowerCase();
  const variant = COMPLETED.has(key) ? "completed" : PROGRESS.has(key) ? "progress" : LEAVE.has(key) ? "leave" : "pending";
  return <span className={`status-badge ${variant}`}>{label ?? titleize(status)}</span>;
}

const AVATAR_COLORS = ["#d7b9a6", "#c4bced", "#bad2b4", "#e4c494", "#b9c6d2", "#d5b9c9"];

export function initialsOf(name: string | null | undefined) {
  return (name ?? "?").split(/\s+/).filter(Boolean).map(word => word[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function colorFor(name: string | null | undefined) {
  const text = name ?? "";
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({ name, color, size = "normal" }: { name: string | null | undefined; color?: string; size?: "normal" | "large" }) {
  return (
    <span className={`avatar ${size === "large" ? "avatar-large" : ""}`} style={{ background: color ?? colorFor(name) }}>
      {initialsOf(name)}
    </span>
  );
}

export function StatCard({ label, value, foot, accent, icon: Icon }: { label: string; value: string; foot: string; accent: string; icon: LucideIcon }) {
  return (
    <div className="glass-card stat-card" style={{ "--card-accent": accent } as CSSProperties}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot"><Icon size={12} /> <span>{foot}</span></div>
    </div>
  );
}

export function PanelHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="panel-header">
      <div>
        <div className="panel-title">{title}</div>
        {subtitle ? <div className="panel-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="heading-actions" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>{actions}</div> : null}
    </div>
  );
}

export function Field({ label, full, children, hint }: { label: string; full?: boolean; children: ReactNode; hint?: string }) {
  return (
    <div className={`form-field ${full ? "full" : ""}`}>
      <label>{label}</label>
      {children}
      {hint ? <span className="panel-subtitle" style={{ marginTop: 0 }}>{hint}</span> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="skeleton" style={{ height: 12, width: 180, margin: "0 auto 10px" }} />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span>{message}</span>
      {onRetry ? <button className="secondary-button" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
