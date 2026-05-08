import { useMemo, useState } from 'react';
import { useNetwork } from '../hooks/useNetwork';
import { formatBytes } from '../lib/format';
import { Sparkline } from './Sparkline';

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function Network(): JSX.Element {
  const { snapshot, history, error } = useNetwork(2000);
  const [filter, setFilter] = useState('');

  const filteredConnections = useMemo(() => {
    if (!snapshot) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return snapshot.connections.slice(0, 200);
    return snapshot.connections
      .filter(
        (c) =>
          c.process.toLowerCase().includes(q) ||
          c.local.toLowerCase().includes(q) ||
          c.remote.toLowerCase().includes(q) ||
          c.protocol.toLowerCase().includes(q) ||
          String(c.pid).includes(q),
      )
      .slice(0, 200);
  }, [snapshot, filter]);

  if (!snapshot) {
    return <div className="empty">{error ?? 'Loading network…'}</div>;
  }

  const rxHistory = history.map((h) => h.rx);
  const txHistory = history.map((h) => h.tx);
  const maxRate = Math.max(1024, ...rxHistory, ...txHistory);

  return (
    <div className="section-row">
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">
            <span>Download</span>
            <span className="badge">{formatRate(snapshot.totals.rxBytesPerSec)}</span>
          </h2>
          <div className="row-spread" style={{ marginBottom: 12 }}>
            <div className="stat">
              <span className="value">
                {formatBytes(snapshot.totals.rxBytesPerSec).split(' ')[0]}
                <span className="unit">{formatBytes(snapshot.totals.rxBytesPerSec).split(' ')[1]}/s</span>
              </span>
              <span className="meta">
                <span className="key">total</span> {formatBytes(snapshot.totals.rxBytes)} since boot
              </span>
            </div>
          </div>
          <Sparkline data={rxHistory} max={maxRate} height={60} />
        </section>

        <section className="card">
          <h2 className="card-title">
            <span>Upload</span>
            <span className="badge">{formatRate(snapshot.totals.txBytesPerSec)}</span>
          </h2>
          <div className="row-spread" style={{ marginBottom: 12 }}>
            <div className="stat">
              <span className="value">
                {formatBytes(snapshot.totals.txBytesPerSec).split(' ')[0]}
                <span className="unit">{formatBytes(snapshot.totals.txBytesPerSec).split(' ')[1]}/s</span>
              </span>
              <span className="meta">
                <span className="key">total</span> {formatBytes(snapshot.totals.txBytes)} since boot
              </span>
            </div>
          </div>
          <Sparkline data={txHistory} max={maxRate} height={60} />
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">
          <span>Interfaces</span>
          <span className="badge">{snapshot.interfaces.length}</span>
        </h2>
        <table className="proc-table">
          <thead>
            <tr>
              <th>Interface</th>
              <th>State</th>
              <th className="right">Down</th>
              <th className="right">Up</th>
              <th className="right">RX total</th>
              <th className="right">TX total</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.interfaces.map((iface) => (
              <tr key={iface.iface}>
                <td className="mono">{iface.iface}</td>
                <td className={iface.operstate === 'up' ? 'text-good' : 'text-faint'}>
                  {iface.operstate}
                </td>
                <td className="right">{formatRate(iface.rxBytesPerSec)}</td>
                <td className="right">{formatRate(iface.txBytesPerSec)}</td>
                <td className="right">{formatBytes(iface.rxBytes)}</td>
                <td className="right">{formatBytes(iface.txBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="card-title">
          <span>Top processes by total bandwidth</span>
          <span className="badge">cumulative since process start</span>
        </h2>
        {snapshot.processes.length === 0 ? (
          <div className="text-muted">
            No process bandwidth data. nettop may need a moment, or no recent traffic.
          </div>
        ) : (
          <table className="proc-table">
            <thead>
              <tr>
                <th>Process</th>
                <th style={{ width: 90 }}>PID</th>
                <th className="right">RX</th>
                <th className="right">TX</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.processes.map((p) => (
                <tr key={`${p.pid}-${p.name}`}>
                  <td className="name">{p.name}</td>
                  <td className="pid">{p.pid}</td>
                  <td className="right">{formatBytes(p.rxBytes)}</td>
                  <td className="right">{formatBytes(p.txBytes)}</td>
                  <td className="right">{formatBytes(p.rxBytes + p.txBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">
          <span>Active connections</span>
          <span className="badge">
            {filteredConnections.length} of {snapshot.connections.length}
          </span>
        </h2>
        <div className="proc-toolbar" style={{ marginBottom: 10 }}>
          <input
            type="search"
            placeholder="Filter by process, host, port, protocol…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1, maxWidth: 360 }}
          />
        </div>
        {filteredConnections.length === 0 ? (
          <div className="text-muted">No connections match.</div>
        ) : (
          <table className="proc-table">
            <thead>
              <tr>
                <th>Process</th>
                <th style={{ width: 90 }}>PID</th>
                <th style={{ width: 70 }}>Proto</th>
                <th>Local</th>
                <th>Remote</th>
                <th style={{ width: 110 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {filteredConnections.map((c, i) => (
                <tr key={`${c.pid}-${c.local}-${c.remote}-${i}`}>
                  <td className="name">{c.process}</td>
                  <td className="pid">{c.pid}</td>
                  <td className="mono">{c.protocol}</td>
                  <td className="mono break" style={{ fontSize: 11.5 }}>
                    {c.local}
                  </td>
                  <td className="mono break" style={{ fontSize: 11.5 }}>
                    {c.remote || '—'}
                  </td>
                  <td className="text-muted">{c.state || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
