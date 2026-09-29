"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Re-runs `fn` every `ms` (Monad blocks are 400ms; a couple of seconds keeps the UI live without hammering RPC). */
export function usePoll<T>(fn: () => Promise<T>, deps: unknown[], ms = 2500) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, refresh };
}

/** Wall-clock seconds, re-rendering once a second (keeps render pure). */
export function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
