"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/primitives";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/api";

function safeNext() {
  if (typeof window === "undefined") return "/";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm() {
  const { state, signIn, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "ready") router.replace(safeNext());
  }, [state.status, router]);

  return (
    <div className="app-shell">
      <div className="top-brand"><span>Northstar</span><span>Operations</span></div>
      <div className="top-right-mark"><i /><i /></div>
      <div className="login-shell">
        <div className="panel login-card">
          <div className="page-heading" style={{ margin: "4px 0 18px" }}>
            <div>
              <div className="eyebrow">ERP CONTROL CENTER</div>
              <h1 style={{ fontSize: 40 }}>Welcome back</h1>
              <p>Sign in with the account your administrator created for you.</p>
            </div>
          </div>
          {state.status === "error" ? (
            <div className="error-state" style={{ margin: "0 0 14px" }} role="alert">
              {state.error}{" "}
              <button className="secondary-button" style={{ marginTop: 8 }} onClick={() => void signOut()}>Use another account</button>
            </div>
          ) : null}
          <form
            className="page-form"
            style={{ padding: 0 }}
            onSubmit={async event => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setError(null);
              try {
                await signIn(String(form.get("email")), String(form.get("password")));
              } catch (err) {
                setError(errorMessage(err));
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Email">
                <input className="input-dark" name="email" type="email" autoComplete="email" required placeholder="name@organization.com" />
              </Field>
              <Field label="Password">
                <input className="input-dark" name="password" type="password" autoComplete="current-password" required minLength={6} />
              </Field>
            </div>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            <div className="modal-actions">
              <button className="primary-button" type="submit" disabled={busy || state.status === "loading"}>
                <LogIn size={14} /> {busy ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
