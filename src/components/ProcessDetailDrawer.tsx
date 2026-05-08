import { useEffect, useState } from 'react';
import type { ProcessDetail } from '../../electron/shared/types';
import { formatBytes } from '../lib/format';

interface ProcessDetailDrawerProps {
  pid: number | null;
  iconUrl: string | null;
  onClose: () => void;
  onKill: (pid: number, force: boolean) => void;
}

type Section = 'identity' | 'tree' | 'files' | 'connections' | 'env';

export function ProcessDetailDrawer({
  pid,
  iconUrl,
  onClose,
  onKill,
}: ProcessDetailDrawerProps): JSX.Element | null {
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<Section, boolean>>({
    identity: true,
    tree: true,
    files: false,
    connections: true,
    env: false,
  });

  useEffect(() => {
    if (pid === null) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    window.api
      .getProcessDetail(pid)
      .then((d) => {
        if (cancelled) return;
        if (!d) setError(`No process with PID ${pid}`);
        setDetail(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pid]);

  useEffect(() => {
    if (pid === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pid, onClose]);

  if (pid === null) return null;

  const toggle = (s: Section) => setOpen((prev) => ({ ...prev, [s]: !prev[s] }));

  const section = (id: Section, title: string, count: number | null, body: JSX.Element) => (
    <div className="drawer-section">
      <button className="drawer-section-head" onClick={() => toggle(id)}>
        <span className="caret">{open[id] ? '▾' : '▸'}</span>
        <span>{title}</span>
        {count !== null && <span className="drawer-section-count">{count}</span>}
      </button>
      {open[id] && <div className="drawer-section-body">{body}</div>}
    </div>
  );

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <div className="drawer-head-icon">
            {iconUrl ? (
              <img src={iconUrl} alt="" width={32} height={32} />
            ) : (
              <span className="drawer-head-fallback">⚙</span>
            )}
          </div>
          <div className="drawer-head-text">
            <div className="drawer-head-title">{detail?.name ?? `PID ${pid}`}</div>
            <div className="drawer-head-sub">
              <span className="mono">PID {pid}</span>
              {detail && (
                <>
                  {' · '}
                  <span>{detail.user}</span>
                  {' · '}
                  <span>{detail.cpuPercent.toFixed(1)}% CPU</span>
                  {' · '}
                  <span>{formatBytes(detail.memRssBytes)}</span>
                </>
              )}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="drawer-actions">
          <button onClick={() => onKill(pid, false)}>Quit</button>
          <button className="danger" onClick={() => onKill(pid, true)}>
            Force Quit
          </button>
        </div>

        <div className="drawer-body">
          {loading && <div className="drawer-loading">Loading details…</div>}
          {error && <div className="drawer-error">{error}</div>}

          {detail && (
            <>
              {section(
                'identity',
                'Identity',
                null,
                <dl className="drawer-kv">
                  <dt>Command</dt>
                  <dd className="mono break">{detail.command}</dd>
                  {detail.appBundlePath && (
                    <>
                      <dt>App bundle</dt>
                      <dd className="mono break">{detail.appBundlePath}</dd>
                    </>
                  )}
                  <dt>Working dir</dt>
                  <dd className="mono break">{detail.workingDir ?? '—'}</dd>
                  <dt>Started</dt>
                  <dd>{detail.startedAt}</dd>
                  <dt>State</dt>
                  <dd>{detail.state}</dd>
                  <dt>Nice</dt>
                  <dd>{detail.niceValue}</dd>
                  <dt>Threads</dt>
                  <dd>{detail.threads}</dd>
                  <dt>Virtual mem</dt>
                  <dd>{formatBytes(detail.memVirtualBytes)}</dd>
                </dl>,
              )}

              {section(
                'tree',
                'Parent tree',
                detail.ancestors.length,
                detail.ancestors.length === 0 ? (
                  <div className="text-muted">No ancestors found.</div>
                ) : (
                  <ol className="drawer-tree">
                    {detail.ancestors.map((a, i) => (
                      <li key={`${a.pid}-${i}`}>
                        <span className="mono drawer-tree-pid">{a.pid}</span>
                        <span className="drawer-tree-name">{a.name}</span>
                        <span className="drawer-tree-cmd mono" title={a.command}>
                          {a.command}
                        </span>
                      </li>
                    ))}
                  </ol>
                ),
              )}

              {section(
                'connections',
                'Network connections',
                detail.connections.length,
                detail.connections.length === 0 ? (
                  <div className="text-muted">No active connections.</div>
                ) : (
                  <table className="drawer-mini-table">
                    <thead>
                      <tr>
                        <th>Proto</th>
                        <th>Local</th>
                        <th>Remote</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.connections.map((c, i) => (
                        <tr key={i}>
                          <td>{c.protocol}</td>
                          <td className="mono">{c.local}</td>
                          <td className="mono">{c.remote}</td>
                          <td>{c.state}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              )}

              {section(
                'files',
                'Open files',
                detail.openFiles.length,
                detail.openFiles.length === 0 ? (
                  <div className="text-muted">No open files visible.</div>
                ) : (
                  <table className="drawer-mini-table">
                    <thead>
                      <tr>
                        <th>FD</th>
                        <th>Type</th>
                        <th>Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.openFiles.map((f, i) => (
                        <tr key={i}>
                          <td className="mono">{f.fd}</td>
                          <td>{f.type}</td>
                          <td className="mono break">{f.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              )}

              {section(
                'env',
                'Environment',
                Object.keys(detail.environment).length,
                Object.keys(detail.environment).length === 0 ? (
                  <div className="text-muted">Environment not visible (other user?).</div>
                ) : (
                  <dl className="drawer-kv mono">
                    {Object.entries(detail.environment)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => (
                        <span key={k} style={{ display: 'contents' }}>
                          <dt>{k}</dt>
                          <dd className="break">{v}</dd>
                        </span>
                      ))}
                  </dl>
                ),
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
