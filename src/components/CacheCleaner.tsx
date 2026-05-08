import { useCallback, useEffect, useState } from 'react';
import type { CacheLocation, CacheScanResult } from '../../electron/shared/types';
import { formatBytes } from '../lib/format';

const SAFETY_LABEL: Record<CacheLocation['safety'], string> = {
  safe: 'safe',
  careful: 'careful',
  caution: 'caution',
};

const SAFETY_HINT: Record<CacheLocation['safety'], string> = {
  safe: 'Apps will recreate this on demand.',
  careful: 'May briefly affect running apps.',
  caution: 'Review before deleting — may contain data you want.',
};

export function CacheCleaner(): JSX.Element {
  const [scan, setScan] = useState<CacheScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<{ id: string; freed: number; errors: string[] } | null>(
    null,
  );

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const result = await window.api.scanCaches();
      setScan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void runScan();
  }, [runScan]);

  const handleClean = async (loc: CacheLocation) => {
    if (loc.totalBytes === 0) return;
    const isTrashEmpty = loc.id === 'trash';
    const verb = isTrashEmpty ? 'Permanently delete' : 'Move to Trash';
    const consequence = isTrashEmpty
      ? 'This is irreversible. Items will not be recoverable.'
      : 'You can restore from Trash if needed.';
    if (
      !confirm(
        `${verb} "${loc.label}" contents?\n\n${formatBytes(loc.totalBytes)} from ${loc.paths.length} location(s).\n\n${consequence}`,
      )
    ) {
      return;
    }
    setCleaning((prev) => new Set(prev).add(loc.id));
    try {
      const result = await window.api.cleanCache(loc.id);
      setLastResult({ id: loc.id, freed: result.freedBytes, errors: result.errors });
      await runScan();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning((prev) => {
        const next = new Set(prev);
        next.delete(loc.id);
        return next;
      });
    }
  };

  return (
    <div className="cache-cleaner">
      <div className="proc-toolbar">
        <button className="primary" onClick={runScan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Rescan'}
        </button>
        {scan && (
          <span className="toolbar-info">
            <strong>{formatBytes(scan.totalBytes)}</strong> across {scan.locations.length} locations
          </span>
        )}
        <span className="toolbar-info" style={{ marginLeft: 'auto' }}>
          Items moved to <strong>Trash</strong> — recoverable until you empty.
        </span>
      </div>

      {error && (
        <div className="scan-status" style={{ borderColor: 'var(--danger)' }}>
          <span className="text-danger">Error: {error}</span>
        </div>
      )}

      {lastResult && (
        <div className="scan-status">
          <span className="status-text">
            Last action freed <strong>{formatBytes(lastResult.freed)}</strong>.
          </span>
          {lastResult.errors.length > 0 && (
            <span className="text-warn">
              · {lastResult.errors.length} item(s) skipped (permission)
            </span>
          )}
        </div>
      )}

      {scanning && !scan && <div className="empty">Measuring cache directories…</div>}

      {scan && (
        <div className="cache-list">
          {scan.locations.map((loc) => {
            const isCleaning = cleaning.has(loc.id);
            const empty = loc.totalBytes === 0;
            return (
              <div key={loc.id} className={`cache-row safety-${loc.safety}`}>
                <div className="cache-row-main">
                  <div className="cache-row-head">
                    <span className="cache-label">{loc.label}</span>
                    <span className={`safety-pill safety-${loc.safety}`}>
                      {SAFETY_LABEL[loc.safety]}
                    </span>
                  </div>
                  <div className="cache-desc">{loc.description}</div>
                  {loc.hint && <div className="cache-hint">💡 {loc.hint}</div>}
                  {loc.paths.length > 0 && (
                    <div className="cache-paths">
                      {loc.paths.map((p) => (
                        <code key={p} className="cache-path">
                          {p.replace(/^\/Users\/[^/]+/, '~')}
                        </code>
                      ))}
                    </div>
                  )}
                  <div className="cache-safety-hint">{SAFETY_HINT[loc.safety]}</div>
                </div>
                <div className="cache-row-side">
                  <div className="cache-size">{formatBytes(loc.totalBytes)}</div>
                  <button
                    className={loc.safety === 'caution' ? 'danger' : ''}
                    onClick={() => handleClean(loc)}
                    disabled={empty || isCleaning}
                    title={empty ? 'Nothing to clean' : 'Move contents to Trash'}
                  >
                    {isCleaning ? 'Cleaning…' : empty ? 'Empty' : 'Clean'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
