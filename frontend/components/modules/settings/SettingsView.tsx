"use client";

import { Bell, Check, Plus, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/Modal";
import { ErrorState, Field, LoadingState, PanelHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/api";
import { formatDate, ROLE_LABELS } from "@/lib/format";
import { authService } from "@/services/erp";
import type { AppUser } from "@/types/erp";

const ROLE_ACCESS: Record<string, string> = {
  admin: "Full access",
  manager: "Sales, purchases, inventory, customers, suppliers, reports",
  sales_staff: "Sales, customers, product lookup",
  inventory_staff: "Inventory, purchases, suppliers",
};

export function SettingsView() {
  const { can, me } = useAuth();
  const toast = useToast();
  const admin = can("settings:write");
  const manageUsers = can("users:manage");
  const settings = useApi(() => authService.settings(), []);
  const users = useApi(() => (manageUsers ? authService.users() : Promise.resolve({ data: [] as AppUser[] })), [manageUsers]);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  if (settings.loading && !settings.data) return <div className="panel page-panel" style={{ marginTop: 27 }}><LoadingState /></div>;
  if (settings.error || !settings.data) {
    return <div className="panel page-panel" style={{ marginTop: 27 }}><ErrorState message={settings.error ?? "Could not load settings"} onRetry={settings.reload} /></div>;
  }
  const s = settings.data;
  const admins = users.data?.data.filter(user => user.role === "admin" && user.is_active).length ?? 0;

  const updateUser = async (user: AppUser, patch: Partial<AppUser>) => {
    try {
      await authService.updateUser(user.id, patch);
      toast(`${user.name} updated`);
      users.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <>
      <form
        className="panel page-panel"
        style={{ marginTop: 27 }}
        onSubmit={async event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setSaving(true);
          try {
            await authService.updateSettings({
              company_name: form.get("company_name"), timezone: form.get("timezone"), currency: form.get("currency"),
              invoice_footer: form.get("invoice_footer"), low_stock_alerts: form.get("low_stock_alerts") === "on",
            });
            toast("Settings saved");
            settings.reload();
          } catch (error) {
            toast(errorMessage(error), "error");
          } finally {
            setSaving(false);
          }
        }}
      >
        <PanelHeader title="Workspace settings" subtitle="Tune the ERP to your organisation"
          actions={admin ? <button className="primary-button" type="submit" disabled={saving}><Check size={14} /> {saving ? "Saving…" : "Save changes"}</button> : null} />
        <div className="dept-grid" style={{ padding: 0 }}>
          <div className="dept-card page-form" style={{ padding: 16 }}>
            <Sparkles size={17} color="#a99fe7" />
            <h3 style={{ display: "block", marginTop: 13 }}>Workspace profile</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              <Field label="Company name"><input className="input-dark" name="company_name" defaultValue={s.company_name} disabled={!admin} required /></Field>
              <Field label="Timezone"><input className="input-dark" name="timezone" defaultValue={s.timezone} disabled={!admin} required /></Field>
              <Field label="Currency"><input className="input-dark" name="currency" defaultValue={s.currency} disabled={!admin} maxLength={3} required /></Field>
            </div>
          </div>
          <div className="dept-card page-form" style={{ padding: 16 }}>
            <Bell size={17} color="#e3c07f" />
            <h3 style={{ display: "block", marginTop: 13 }}>Notifications & invoices</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              <label className="panel-subtitle" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="low_stock_alerts" defaultChecked={s.low_stock_alerts} disabled={!admin} /> Low stock alerts on the dashboard
              </label>
              <Field label="Invoice footer"><textarea className="textarea-dark" name="invoice_footer" defaultValue={s.invoice_footer} disabled={!admin} maxLength={300} /></Field>
            </div>
          </div>
          <div className="dept-card" style={{ padding: 16 }}>
            <Settings2 size={17} color="#9cc794" />
            <h3 style={{ display: "block", marginTop: 13 }}>Access controls</h3>
            <p>Signed in as {me?.user.email}</p>
            <p>Your role · {ROLE_LABELS[me?.user.role ?? ""]}</p>
            {manageUsers ? <p>{admins} active administrator(s)</p> : null}
            {s.updated_at ? <p>Last updated · {formatDate(s.updated_at)}</p> : null}
          </div>
        </div>
      </form>

      {manageUsers ? (
        <div className="panel data-panel page-panel" style={{ marginTop: 10 }}>
          <PanelHeader title="Users & roles" subtitle="Accounts sign in with Supabase Auth; access is enforced by the API on every request"
            actions={<button className="primary-button" onClick={() => setAdding(true)}><Plus size={14} /> Add user</button>} />
          <DataTable<AppUser>
            columns={[
              { key: "name", label: "User", render: u => <div className="person-cell"><div><b>{u.name}</b><span>{u.email}</span></div></div> },
              {
                key: "role", label: "Role",
                render: u => (
                  <select className="select-dark" value={u.role} disabled={u.id === me?.user.id}
                    onChange={e => void updateUser(u, { role: e.target.value as AppUser["role"] })} aria-label={`Role for ${u.name}`}>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                ),
              },
              { key: "access", label: "Access", render: u => <span className="panel-subtitle">{ROLE_ACCESS[u.role]}</span> },
              { key: "is_active", label: "Status", render: u => <StatusBadge status={u.is_active ? "active" : "inactive"} /> },
              { key: "created_at", label: "Added", render: u => <span className="mono">{formatDate(u.created_at)}</span> },
              {
                key: "actions", label: "",
                render: u => u.id === me?.user.id ? <span className="panel-subtitle">You</span> : (
                  <button className="secondary-button" onClick={() => void updateUser(u, { is_active: !u.is_active })}>{u.is_active ? "Deactivate" : "Reactivate"}</button>
                ),
              },
            ]}
            rows={users.data?.data ?? []}
            loading={users.loading}
            error={users.error}
            onRetry={users.reload}
          />
        </div>
      ) : null}

      {adding && (
        <FormModal title="Add user" description="The user can sign in immediately with this email and password." submitLabel="Create user"
          onClose={() => setAdding(false)}
          onSubmit={async form => {
            await authService.createUser({ name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role") });
            toast("User created");
            setAdding(false);
            users.reload();
          }}
        >
          <div className="form-grid">
            <Field label="Name" full><input className="input-dark" name="name" required maxLength={120} /></Field>
            <Field label="Email" full><input className="input-dark" name="email" type="email" required /></Field>
            <Field label="Temporary password"><input className="input-dark" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <Field label="Role">
              <select className="select-dark" name="role" defaultValue="sales_staff">
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>
        </FormModal>
      )}
    </>
  );
}
