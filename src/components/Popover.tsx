import { useSnapshot } from '../hooks/useSnapshot';
import { useProcessIcons } from '../hooks/useProcessIcons';
import { formatBytes, formatPercent, formatUptime, loadClass } from '../lib/format';

export function Popover(): JSX.Element {
  const { snapshot } = useSnapshot(1500);
  const top = snapshot
    ? [...snapshot.processes.list].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 8)
    : [];
  const icons = useProcessIcons(top);

  if (!snapshot) {
    return (
      <div className="popover-body">
        <div className="text-muted">Loading…</div>
      </div>
    );
  }

  const memUsedPct = (snapshot.memory.usedBytes / snapshot.memory.totalBytes) * 100;

  return (
    <div className="popover-body">
      <div className="popover-header">
        <span className="title">OsxStats</span>
        <span className="uptime">up {formatUptime(snapshot.uptimeSeconds)}</span>
      </div>

      <div>
        <div className="popover-stat">
          <span className="label">CPU</span>
          <div className="bar">
            <div
              className={`fill ${loadClass(snapshot.cpu.loadPercent)}`}
              style={{ width: `${Math.min(100, snapshot.cpu.loadPercent)}%` }}
            />
          </div>
          <span className="value">{formatPercent(snapshot.cpu.loadPercent, 1)}</span>
        </div>
        <div className="popover-stat">
          <span className="label">RAM</span>
          <div className="bar">
            <div
              className={`fill ${loadClass(memUsedPct)}`}
              style={{ width: `${Math.min(100, memUsedPct)}%` }}
            />
          </div>
          <span className="value">
            {(snapshot.memory.usedBytes / 1024 ** 3).toFixed(1)}/
            {(snapshot.memory.totalBytes / 1024 ** 3).toFixed(0)} GB
          </span>
        </div>
        {snapshot.memory.swapTotalBytes > 0 && snapshot.memory.swapUsedBytes > 0 && (
          <div className="popover-stat">
            <span className="label">Swap</span>
            <div className="bar">
              <div
                className={`fill ${loadClass(
                  (snapshot.memory.swapUsedBytes / snapshot.memory.swapTotalBytes) * 100,
                )}`}
                style={{
                  width: `${Math.min(
                    100,
                    (snapshot.memory.swapUsedBytes / snapshot.memory.swapTotalBytes) * 100,
                  )}%`,
                }}
              />
            </div>
            <span className="value">{formatBytes(snapshot.memory.swapUsedBytes)}</span>
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-faint)', marginTop: 4 }}>
        Top processes
      </div>
      <div className="popover-procs">
        {top.map((p) => {
          const icon = icons[p.command];
          return (
            <div className="row" key={p.pid}>
              <span className="name" title={`${p.name} (${p.pid})`}>
                {icon && (
                  <img
                    src={icon}
                    alt=""
                    width={14}
                    height={14}
                    style={{ verticalAlign: 'middle', marginRight: 6, borderRadius: 2 }}
                  />
                )}
                {p.name}
              </span>
              <span className="num">{p.cpuPercent.toFixed(1)}%</span>
              <span className="num">{formatBytes(p.memRssBytes)}</span>
            </div>
          );
        })}
      </div>

      <div className="popover-actions">
        <button className="primary" onClick={() => window.api.showMainWindow()}>
          Dashboard
        </button>
        <button onClick={() => window.api.hideMainWindow()}>Hide</button>
        <button className="danger" onClick={() => window.api.quit()}>
          Quit
        </button>
      </div>
    </div>
  );
}
