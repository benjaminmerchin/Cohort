"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface AuthUser {
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  signIn: (email: string, name?: string) => void;
  signOut: () => void;
}

const STORAGE_KEY = "cohort.auth.user.v1";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as AuthUser);
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  const signIn = useCallback((email: string, name?: string) => {
    const u: AuthUser = {
      email: email.trim().toLowerCase(),
      name: (name?.trim() || email.split("@")[0] || "you").slice(0, 40),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } catch {
      // ignore quota
    }
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
