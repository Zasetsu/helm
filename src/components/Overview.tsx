import { useEffect, useState } from 'react';
import type { DiskMount, SystemSnapshot } from '../../electron/shared/types';
import { formatBytes, formatPercent, loadClass } from '../lib/format';
import { useProcessIcons } from '../hooks/useProcessIcons';
import { Sparkline } from './Sparkline';

interface OverviewProps {
  snapshot: SystemSnapshot | null;
  history: SystemSnapshot[];
}

export function Overview({ snapshot, history }: OverviewProps): JSX.Element {
  const [mounts, setMounts] = useState<DiskMount[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const m = await window.api.getDiskMounts();
        if (!cancelled) setMounts(m);
      } catch {}
    };
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const topCpu = snapshot
    ? [...snapshot.processes.list].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 6)
    : [];
  const topMem = snapshot
    ? [...snapshot.processes.list].sort((a, b) => b.memRssBytes - a.memRssBytes).slice(0, 6)
    : [];

  const icons = useProcessIcons([...topCpu, ...topMem]);

  if (!snapshot) {
    return <div className="empty">Loading system stats…</div>;
  }

  const memUsedPct = (snapshot.memory.usedBytes / snapshot.memory.totalBytes) * 100;
  const swapUsedPct =
    snapshot.memory.swapTotalBytes > 0
      ? (snapshot.memory.swapUsedBytes / snapshot.memory.swapTotalBytes) * 100
      : 0;
  const cpuHistory = history.map((s) => s.cpu.loadPercent);
  const memHistory = history.map((s) =>
    s.memory.totalBytes > 0 ? (s.memory.usedBytes / s.memory.totalBytes) * 100 : 0,
  );
  const cores = snapshot.cpu.perCorePercent;

  return (
    <div className="section-row">
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">
            <span>CPU Load</span>
            <span className="badge">{cores.length} cores</span>
          </h2>
          <div className="row-spread" style={{ marginBottom: 14 }}>
            <div className="stat">
              <span className="value">
                {snapshot.cpu.loadPercent.toFixed(1)}
                <span className="unit">%</span>
              </span>
              <span className="meta">
                <span className="key">user</span> {snapshot.cpu.loadUserPercent.toFixed(0)}%{' '}
                <span className="key">· sys</span> {snapshot.cpu.loadSystemPercent.toFixed(0)}%
              </span>
            </div>
            <div style={{ flex: 1, marginLeft: 16, alignSelf: 'stretch' }}>
              <Sparkline data={cpuHistory} />
            </div>
          </div>
          <div className="cores">
            {cores.map((load, i) => (
              <div className="core" key={i}>
                <span className="core-label">C{i}</span>
                <div className="core-bar">
                  <div
                    className={`core-fill ${loadClass(load)}`}
                    style={{ width: `${Math.min(100, Math.max(0, load))}%` }}
                  />
                </div>
                <span className="core-pct">{load.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">
            <span>Memory</span>
            <span className="badge">{(snapshot.memory.totalBytes / 1024 ** 3).toFixed(0)} GB</span>
          </h2>
          <div className="row-spread" style={{ marginBottom: 14 }}>
            <div className="stat">
              <span className="value">
                {(snapshot.memory.usedBytes / 1024 ** 3).toFixed(1)}
                <span className="unit">/ {(snapshot.memory.totalBytes / 1024 ** 3).toFixed(0)} GB used</span>
              </span>
              <span className="meta">
                <span className="key">available</span> {formatBytes(snapshot.memory.availableBytes)}
              </span>
            </div>
            <div style={{ flex: 1, marginLeft: 16, alignSelf: 'stretch' }}>
              <Sparkline data={memHistory} />
            </div>
          </div>

          <div className="bar-row">
            <span>Memory pressure</span>
            <span className="bar-row-value">{formatPercent(memUsedPct, 1)}</span>
          </div>
          <div className="bar">
            <div
              className={`fill ${loadClass(memUsedPct)}`}
              style={{ width: `${Math.min(100, memUsedPct)}%` }}
            />
          </div>

          {snapshot.memory.swapTotalBytes > 0 && (
            <>
              <div className="bar-row" style={{ marginTop: 14 }}>
                <span>
                  Swap{' '}
                  <span className="text-faint">
                    ({formatBytes(snapshot.memory.swapUsedBytes)} of{' '}
                    {formatBytes(snapshot.memory.swapTotalBytes)})
                  </span>
                </span>
                <span className="bar-row-value">{formatPercent(swapUsedPct, 1)}</span>
              </div>
              <div className="bar">
                <div
                  className={`fill ${loadClass(swapUsedPct)}`}
                  style={{ width: `${Math.min(100, swapUsedPct)}%` }}
                />
              </div>
            </>
          )}

          <dl className="kv-list" style={{ marginTop: 14 }}>
            <dt>Wired</dt>
            <dd>{formatBytes(snapshot.memory.wiredBytes)}</dd>
            <dt>Active</dt>
            <dd>{formatBytes(snapshot.memory.activeBytes)}</dd>
            <dt>Compressed</dt>
            <dd>{formatBytes(snapshot.memory.compressedBytes)}</dd>
            <dt>Cached</dt>
            <dd>{formatBytes(snapshot.memory.cachedBytes)}</dd>
          </dl>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">
            <span>Top by CPU</span>
            <span className="badge">{snapshot.processes.all} total</span>
          </h2>
          <table className="proc-table">
            <thead>
              <tr>
                <th>Process</th>
                <th className="right">CPU</th>
                <th className="right">Memory</th>
              </tr>
            </thead>
            <tbody>
              {topCpu.map((p) => {
                const icon = icons[p.command];
                return (
                  <tr key={p.pid}>
                    <td className="name" title={p.command}>
                      <div className="proc-name-cell">
                        <span className="proc-icon">
                          {icon ? <img src={icon} alt="" width={16} height={16} /> : <span>·</span>}
                        </span>
                        <span className="truncate">{p.name}</span>
                      </div>
                    </td>
                    <td className="right">{p.cpuPercent.toFixed(1)}%</td>
                    <td className="right">{formatBytes(p.memRssBytes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="card-title">
            <span>Top by Memory</span>
            <span className="badge">RSS</span>
          </h2>
          <table className="proc-table">
            <thead>
              <tr>
                <th>Process</th>
                <th className="right">Memory</th>
                <th className="right">CPU</th>
              </tr>
            </thead>
            <tbody>
              {topMem.map((p) => {
                const icon = icons[p.command];
                return (
                  <tr key={p.pid}>
                    <td className="name" title={p.command}>
                      <div className="proc-name-cell">
                        <span className="proc-icon">
                          {icon ? <img src={icon} alt="" width={16} height={16} /> : <span>·</span>}
                        </span>
                        <span className="truncate">{p.name}</span>
                      </div>
                    </td>
                    <td className="right">{formatBytes(p.memRssBytes)}</td>
                    <td className="right">{p.cpuPercent.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">
          <span>Volumes</span>
          <span className="badge">{mounts.length} mounted</span>
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mounts.length === 0 && <div className="text-muted">No volume info available.</div>}
          {mounts.map((m) => (
            <div key={m.mount} className="volume">
              <div className="volume-head">
                <div>
                  <span className="volume-name">{m.mount}</span>{' '}
                  <span className="volume-meta">
                    {m.fs} · {m.type}
                  </span>
                </div>
                <span className="volume-size">
                  {formatBytes(m.usedBytes)} of {formatBytes(m.sizeBytes)} ·{' '}
                  {m.usePercent.toFixed(0)}%
                </span>
              </div>
              <div className="bar">
                <div
                  className={`fill ${loadClass(m.usePercent)}`}
                  style={{ width: `${Math.min(100, m.usePercent)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="text-faint" style={{ fontSize: 11, textAlign: 'center', padding: '4px 0' }}>
        {snapshot.processes.all} processes · {snapshot.processes.running} running ·{' '}
        {snapshot.processes.sleeping} sleeping · refreshed every 1.5s
      </div>
    </div>
  );
}
