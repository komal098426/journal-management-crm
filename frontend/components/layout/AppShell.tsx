"use client";

import { ChevronDown, LogOut, Menu, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { FormatProvider, ROLE_LABELS } from "@/lib/format";
import { BACKEND_DISABLED } from "@/lib/offline";
import { authService } from "@/services/erp";
import type { Me } from "@/types/erp";
import { initialsOf } from "../ui/primitives";
import { NAV } from "./nav";

/** The original Northstar shell: brand mark, glass side rail, pill bar and profile chip. */
export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const { can, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const settings = useApi(() => authService.settings(), []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const items = NAV.filter(item => !item.permissions || can(...item.permissions));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const [brandFirst, ...brandRest] = (settings.data?.company_name ?? "Northstar Operations").split(" ");

  return (
    <FormatProvider currency={settings.data?.currency ?? "PKR"}>
      <div className="app-shell">
        <div className="top-brand"><span>{brandFirst}</span><span>{brandRest.join(" ") || "Operations"}</span></div>
        <div className="top-right-mark"><i /><i /></div>
        <aside className={`side-nav ${mobileOpen ? "open" : ""}`} aria-label="Primary navigation">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "active" : ""}
                aria-label={item.label}
                title={item.label}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={16} />
              </Link>
            );
          })}
        </aside>
        <main className="workspace">
          <section className="dashboard-panel">
            <header className="topbar">
              <button className="icon-button mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">
                <Menu size={16} />
              </button>
              <nav className="nav-pills" aria-label="Modules">
                {items.filter(item => item.pill).map(item => (
                  <Link key={item.href} href={item.href} className={`nav-pill ${isActive(item.href) ? "active" : ""}`}>
                    {item.short ?? item.label}
                  </Link>
                ))}
              </nav>
              <div className="profile-chip" style={{ position: "relative" }} ref={menuRef}>
                <div className="profile-avatar">{initialsOf(me.user.name)}</div>
                <div className="profile-copy">
                  <b>{me.user.name}</b>
                  <span>{ROLE_LABELS[me.user.role]}</span>
                </div>
                <button className="profile-menu" onClick={() => setMenuOpen(open => !open)} aria-label="Account menu" aria-expanded={menuOpen}>
                  <ChevronDown size={13} />
                </button>
                {menuOpen && (
                  <div className="menu-pop" role="menu">
                    <button role="menuitem" onClick={() => { setMenuOpen(false); router.push("/settings"); }}>
                      <Settings2 size={12} style={{ verticalAlign: "-2px", marginRight: 6 }} /> Settings
                    </button>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); void signOut(); }}>
                      <LogOut size={12} style={{ verticalAlign: "-2px", marginRight: 6 }} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </header>
            {BACKEND_DISABLED ? (
              <div className="error-state" role="status" style={{ margin: "14px 0 0" }}>
                Backend disabled — you are browsing an empty demo workspace. Data cannot be loaded or saved.
              </div>
            ) : null}
            {children}
          </section>
        </main>
      </div>
    </FormatProvider>
  );
}
