"use client";

import { useState, useEffect, useRef, Dispatch, SetStateAction } from "react";

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * Files (non-serialisable) are skipped gracefully.
 */
export function useSessionState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const isFirst = useRef(true);

  useEffect(() => {
    // Skip writing on the very first render to avoid overwriting a just-read value
    if (isFirst.current) { isFirst.current = false; return; }
    try {
      if (state === null || state === undefined ||
          (Array.isArray(state) && state.length === 0) ||
          state === "") {
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, JSON.stringify(state));
      }
    } catch {
      // Ignore serialisation errors (e.g. File objects)
    }
  }, [key, state]);

  return [state, setState];
}
