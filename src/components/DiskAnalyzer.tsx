import { useEffect, useMemo, useState } from 'react';
import type { DiskEntry } from '../../electron/shared/types';
import type { DiskScanState } from '../hooks/useDiskScan';
import { formatBytes } from '../lib/format';

interface DiskAnalyzerProps {
  scan: DiskScanState;
}

const PRESET_PATHS = [
  { label: 'Root /', value: '/' },
  { label: 'Home', value: '~' },
  { label: 'Applications', value: '/Applications' },
  { label: 'Library', value: '/Library' },
  { label: 'Downloads', value: '~/Downloads' },
];

function getPathSegments(path: string): { label: string; path: string }[] {
  if (path === '/') return [{ label: '/', path: '/' }];
  const parts = path.split('/').filter(Boolean);
  const segments: { label: string; path: string }[] = [{ label: '/', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += '/' + part;
    segments.push({ label: part, path: acc });
  }
  return segments;
}

export function DiskAnalyzer({ scan }: DiskAnalyzerProps): JSX.Element {
  const { current, isScanning, start, cancel } = scan;
  const [pathInput, setPathInput] = useState(() => current?.path ?? '/');
  const [homeDir, setHomeDir] = useState<string>('/Users');

  useEffect(() => {
    window.api.getPlatform().then((p) => {
      setHomeDir(`/Users/${p.hostname.split('.')[0] ?? 'me'}`);
    });
  }, []);

  useEffect(() => {
    if (current?.path) setPathInput(current.path);
  }, [current?.path]);

  const resolvePath = (p: string): string => {
    if (p === '~') return homeDir;
    if (p.startsWith('~/')) return homeDir + p.slice(1);
    return p;
  };

  const handleStart = (path: string) => {
    const resolved = resolvePath(path);
    setPathInput(resolved);
    void start(resolved);
  };

  const handleEntryClick = (entry: DiskEntry) => {
    if (!entry.isDirectory) {
      void window.api.openInFinder(entry.path);
      return;
    }
    handleStart(entry.path);
  };

  const handleParent = () => {
    const path = current?.path ?? pathInput;
    if (path === '/') return;
    const parent = path.replace(/\/[^/]+$/, '') || '/';
    handleStart(parent);
  };

  const segments = useMemo(
    () => getPathSegments(current?.path ?? pathInput),
    [current?.path, pathInput],
  );

  const maxSize = current?.entries.reduce((m, e) => Math.max(m, e.sizeBytes), 0) ?? 0;
  const total = current?.totalBytes ?? 0;

  return (
    <div>
      <div className="disk-toolbar">
        <input
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleStart(pathInput);
          }}
          style={{ minWidth: 240, flex: '0 0 320px' }}
          spellCheck={false}
        />
        <button className="primary" onClick={() => handleStart(pathInput)} disabled={isScanning}>
          Scan
        </button>
        {isScanning && (
          <button className="danger" onClick={() => cancel()}>
            Cancel
          </button>
        )}
        <button onClick={handleParent} disabled={!current || current.path === '/'}>
          ↑ Parent
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {PRESET_PATHS.map((p) => (
            <button key={p.value} onClick={() => handleStart(p.value)} disabled={isScanning}>
              {p.label}
            </button>
          ))}
        </span>
      </div>

      {current && (
        <>
          <div className="breadcrumbs" style={{ marginBottom: 12 }}>
            {segments.map((seg, i) => {
              const isLast = i === segments.length - 1;
              return (
                <span key={seg.path} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {i > 0 && <span className="sep">›</span>}
                  <span
                    className={`crumb ${isLast ? 'current' : ''}`}
                    onClick={() => !isLast && handleStart(seg.path)}
                  >
                    {seg.label}
                  </span>
                </span>
              );
            })}
          </div>

          <div className="scan-status">
            {isScanning && <div className="spinner" />}
            <span>
              {current.status === 'running' && 'Scanning…'}
              {current.status === 'done' && 'Scan complete'}
              {current.status === 'cancelled' && 'Scan cancelled'}
              {current.status === 'error' && 'Scan error'}
            </span>
            <span className="text-muted">
              {current.entries.length} entries · total {formatBytes(total)}
              {current.errorCount > 0 && (
                <>
                  {' '}
                  · <span className="text-warn">{current.errorCount} skipped</span>
                </>
              )}
            </span>
            {current.message && <span className="text-faint">· {current.message}</span>}
          </div>

          <div className="disk-list">
            {current.entries.length === 0 && current.status === 'running' && (
              <div className="empty">Walking the filesystem… first results appear shortly.</div>
            )}
            {current.entries.length === 0 && current.status !== 'running' && (
              <div className="empty">Empty directory.</div>
            )}
            {current.entries.map((entry) => {
              const pct = maxSize > 0 ? (entry.sizeBytes / maxSize) * 100 : 0;
              const totalPct = total > 0 ? (entry.sizeBytes / total) * 100 : 0;
              return (
                <div
                  key={entry.path}
                  className="disk-row"
                  style={{ ['--bar-width' as string]: `${pct}%` }}
                  onClick={() => handleEntryClick(entry)}
                  onDoubleClick={() => window.api.openInFinder(entry.path)}
                  title={entry.path}
                >
                  <span className="icon">{entry.isDirectory ? '◆' : '◇'}</span>
                  <div className="label">
                    <div className="name">{entry.name}</div>
                    <div className="path">{entry.path}</div>
                  </div>
                  <div className="size">{formatBytes(entry.sizeBytes)}</div>
                  <div className="pct">{totalPct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!current && (
        <div className="empty">
          Pick a path and hit <strong>Scan</strong>. Tip: scanning <code>/</code> takes longer
          (whole system); start with <code>/Applications</code> or <code>~</code> if you want quick
          results. Permission-denied folders are skipped automatically.
        </div>
      )}
    </div>
  );
}
