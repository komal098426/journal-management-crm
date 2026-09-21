"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { BACKEND_DISABLED, OFFLINE_ME } from "@/lib/offline";
import { getSupabase } from "@/lib/supabase";
import { authService } from "@/services/erp";
import type { Me, Permission } from "@/types/erp";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; error: string }
  | { status: "ready"; me: Me };

type AuthContextValue = {
  state: AuthState;
  me: Me | null;
  can: (...permissions: Permission[]) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const loadMe = useCallback(async () => {
    try {
      setState({ status: "ready", me: await authService.me() });
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        await getSupabase().auth.signOut();
        setState(error.status === 403 ? { status: "error", error: error.message } : { status: "signed-out" });
      } else {
        setState({ status: "error", error: errorMessage(error) });
      }
    }
  }, []);

  useEffect(() => {
    if (BACKEND_DISABLED) {
      setState({ status: "ready", me: OFFLINE_ME });
      return;
    }
    let supabase;
    try {
      supabase = getSupabase();
    } catch (error) {
      setState({ status: "error", error: errorMessage(error) });
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        setState(current => (current.status === "error" ? current : { status: "signed-out" }));
        return;
      }
      // Defer: Supabase recommends not awaiting other calls inside this callback.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(loadMe, 0);
    });
    const onUnauthorized = () => void supabase.auth.signOut();
    window.addEventListener("erp:unauthorized", onUnauthorized);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("erp:unauthorized", onUnauthorized);
    };
  }, [loadMe]);

  const value = useMemo<AuthContextValue>(() => {
    const me = state.status === "ready" ? state.me : null;
    return {
      state,
      me,
      can: (...permissions) => !!me && permissions.some(permission => me.permissions.includes(permission)),
      signIn: async (email, password) => {
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Incorrect email or password" : error.message);
      },
      signOut: async () => {
        await getSupabase().auth.signOut();
        setState({ status: "signed-out" });
      },
      reload: () => {
        setState({ status: "loading" });
        void loadMe();
      },
    };
  }, [state, loadMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
