"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface NetDocumentsContextValue {
  isConnected: boolean;
  isLoading: boolean;
  connect: (returnUrl?: string) => void;
  disconnect: () => Promise<void>;
  checkStatus: () => Promise<void>;
}

const NetDocumentsContext = createContext<NetDocumentsContextValue>({
  isConnected: false,
  isLoading: true,
  connect: () => {},
  disconnect: async () => {},
  checkStatus: async () => {},
});

export function useNetDocuments() {
  return useContext(NetDocumentsContext);
}

export function NetDocumentsProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/netdocuments/status");
      const data = await res.json();
      setIsConnected(data.connected);
    } catch {
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const connect = useCallback((returnUrl?: string) => {
    const url = returnUrl || window.location.pathname;
    window.location.href = `/api/netdocuments/auth?returnUrl=${encodeURIComponent(url)}`;
  }, []);

  const disconnect = useCallback(async () => {
    await fetch("/api/netdocuments/disconnect", { method: "POST" });
    setIsConnected(false);
  }, []);

  return (
    <NetDocumentsContext.Provider value={{ isConnected, isLoading, connect, disconnect, checkStatus }}>
      {children}
    </NetDocumentsContext.Provider>
  );
}
