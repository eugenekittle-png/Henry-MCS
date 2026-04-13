"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

interface AuthUser {
  username: string; // Principal ID
  email: string;
  role: "admin" | "user";
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, email: string, role: "admin" | "user") => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, login: () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => (res.ok ? res.json() : null))
      .then(data => setUser(data?.user ? { username: data.user.username, email: data.user.email ?? "", role: data.user.role } : null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((username: string, email: string, role: "admin" | "user") => {
    setUser({ username, email, role });
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
