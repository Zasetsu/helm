import { useEffect, useRef, useState } from 'react';
import type { ProcessInfo } from '../../electron/shared/types';

export function useProcessIcons(processes: ProcessInfo[]): Record<string, string | null> {
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pending: string[] = [];
    for (const p of processes) {
      if (!p.command) continue;
      if (requestedRef.current.has(p.command)) continue;
      requestedRef.current.add(p.command);
      pending.push(p.command);
    }
    if (pending.length === 0) return;

    let cancelled = false;
    window.api
      .getProcessIcons(pending)
      .then((next) => {
        if (cancelled) return;
        setIcons((prev) => ({ ...prev, ...next }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [processes]);

  return icons;
}
