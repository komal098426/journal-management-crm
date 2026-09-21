"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";

/**
 * Client-side guard for the ERP area. It only decides what to render;
 * every API call is still authenticated and authorized by the backend.
 */
export default function ErpLayout({ children }: { children: React.ReactNode }) {
  const { state, reload, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "signed-out") {
      router.replace(pathname && pathname !== "/" ? `/login?next=${encodeURIComponent(pathname)}` : "/login");
    }
  }, [state.status, pathname, router]);

  if (state.status === "ready") return <AppShell me={state.me}>{children}</AppShell>;

  return (
    <div className="app-shell">
      <div className="top-brand"><span>Northstar</span><span>Operations</span></div>
      <div className="top-right-mark"><i /><i /></div>
      <div className="login-shell">
        <div className="panel login-card" role={state.status === "error" ? "alert" : "status"}>
          {state.status === "error" ? (
            <>
              <div className="panel-title">We could not open your workspace</div>
              <div className="panel-subtitle" style={{ margin: "8px 0 16px" }}>{state.error}</div>
              <div className="heading-actions">
                <button className="primary-button" onClick={reload}>Try again</button>
                <button className="secondary-button" onClick={() => void signOut()}>Sign in with another account</button>
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow">ERP CONTROL CENTER</div>
              <span className="skeleton" style={{ height: 14, width: "60%", margin: "14px 0 8px" }} />
              <span className="skeleton" style={{ height: 10, width: "40%" }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
