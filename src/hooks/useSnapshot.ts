import { useEffect, useRef, useState } from 'react';
import type { SystemSnapshot } from '../../electron/shared/types';

export function useSnapshot(intervalMs = 1500): {
  snapshot: SystemSnapshot | null;
  history: SystemSnapshot[];
  error: string | null;
} {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<SystemSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timeoutId: number | undefined;

    const tick = async () => {
      try {
        const next = await window.api.getSnapshot();
        if (cancelledRef.current) return;
        setSnapshot(next);
        setHistory((prev) => {
          const updated = [...prev, next];
          if (updated.length > 60) updated.shift();
          return updated;
        });
        setError(null);
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelledRef.current) {
          timeoutId = window.setTimeout(tick, intervalMs);
        }
      }
    };

    tick();

    return () => {
      cancelledRef.current = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [intervalMs]);

  return { snapshot, history, error };
}
