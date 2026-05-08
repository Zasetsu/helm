import { useEffect, useState } from 'react';
import type { SensorReading } from '../../electron/shared/types';

function tempClass(c: number | null | undefined): string {
  if (c === null || c === undefined) return '';
  if (c >= 90) return 'text-danger';
  if (c >= 75) return 'text-warn';
  return 'text-good';
}

function thermalLabel(state: string): { label: string; className: string } {
  if (state === 'normal' || state === 'Normal') return { label: 'Normal', className: 'text-good' };
  if (/light|moderate/i.test(state)) return { label: state, className: 'text-warn' };
  if (/heavy|critical/i.test(state)) return { label: state, className: 'text-danger' };
  return { label: state, className: 'text-muted' };
}

export function Sensors(): JSX.Element {
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await window.api.getSensors();
        if (cancelled) return;
        setReading((prev) =>
          prev?.source === 'powermetrics' ? { ...prev, ...r, source: prev.source } : r,
        );
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const authorize = async () => {
    setAuthorizing(true);
    setError(null);
    try {
      const r = await window.api.getAuthorizedSensors();
      setReading(r);
      if (r.errors && r.errors.length > 0) {
        setError(r.errors.join(' · '));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthorizing(false);
    }
  };

  if (loading && !reading) return <div className="empty">Reading sensors…</div>;
  if (!reading) return <div className="empty text-danger">{error ?? 'No sensor data'}</div>;

  const thermal = reading.thermal;
  const thLabel = thermal ? thermalLabel(thermal.state) : null;
  const hasAuthorizedData =
    reading.cpuDieTemperatureCelsius !== null && reading.cpuDieTemperatureCelsius !== undefined;

  return (
    <div className="section-row">
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">
            <span>Thermal pressure</span>
            {thLabel && <span className={`badge ${thLabel.className}`}>{thLabel.label}</span>}
          </h2>
          {thermal ? (
            <dl className="kv-list" style={{ gridTemplateColumns: 'repeat(2, max-content 1fr)' }}>
              <dt>CPU speed limit</dt>
              <dd className={thermal.cpuSpeedLimit !== null && thermal.cpuSpeedLimit < 100 ? 'text-warn' : ''}>
                {thermal.cpuSpeedLimit !== null ? `${thermal.cpuSpeedLimit}%` : '—'}
              </dd>
              <dt>Scheduler limit</dt>
              <dd>{thermal.schedulerLimit !== null ? `${thermal.schedulerLimit}%` : '—'}</dd>
              <dt>Available CPUs</dt>
              <dd>{thermal.available ?? '—'}</dd>
              <dt>Battery temp</dt>
              <dd className={tempClass(reading.batteryTemperatureCelsius ?? null)}>
                {reading.batteryTemperatureCelsius !== null
                  ? `${reading.batteryTemperatureCelsius?.toFixed(1)} °C`
                  : '—'}
              </dd>
            </dl>
          ) : (
            <div className="text-muted">No thermal data available.</div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">
            <span>Die temperatures &amp; fans</span>
            <span className="badge">
              {reading.source === 'powermetrics' ? 'authorized' : 'sudoless'}
            </span>
          </h2>
          {hasAuthorizedData ? (
            <dl className="kv-list" style={{ gridTemplateColumns: 'repeat(2, max-content 1fr)' }}>
              <dt>CPU die</dt>
              <dd className={tempClass(reading.cpuDieTemperatureCelsius)}>
                {reading.cpuDieTemperatureCelsius !== null
                  ? `${reading.cpuDieTemperatureCelsius?.toFixed(1)} °C`
                  : '—'}
              </dd>
              <dt>GPU die</dt>
              <dd className={tempClass(reading.gpuDieTemperatureCelsius)}>
                {reading.gpuDieTemperatureCelsius !== null && reading.gpuDieTemperatureCelsius !== undefined
                  ? `${reading.gpuDieTemperatureCelsius.toFixed(1)} °C`
                  : '—'}
              </dd>
              <dt>Fan(s)</dt>
              <dd>
                {reading.fanRpms && reading.fanRpms.length > 0
                  ? reading.fanRpms.map((r) => `${r} rpm`).join(' · ')
                  : 'fanless or no readings'}
              </dd>
              <dt>CPU power</dt>
              <dd>
                {reading.cpuPackagePowerWatts !== null && reading.cpuPackagePowerWatts !== undefined
                  ? `${reading.cpuPackagePowerWatts.toFixed(2)} W`
                  : '—'}
              </dd>
              <dt>GPU power</dt>
              <dd>
                {reading.gpuPowerWatts !== null && reading.gpuPowerWatts !== undefined
                  ? `${reading.gpuPowerWatts.toFixed(2)} W`
                  : '—'}
              </dd>
              <dt>ANE power</dt>
              <dd>
                {reading.anePowerWatts !== null && reading.anePowerWatts !== undefined
                  ? `${reading.anePowerWatts.toFixed(2)} W`
                  : '—'}
              </dd>
              {reading.combinedPowerWatts !== null && reading.combinedPowerWatts !== undefined && (
                <>
                  <dt>Combined</dt>
                  <dd>{reading.combinedPowerWatts.toFixed(2)} W</dd>
                </>
              )}
            </dl>
          ) : (
            <div>
              <p className="text-muted" style={{ marginTop: 0 }}>
                On Apple Silicon, CPU/GPU temperatures and fan speeds are gated behind admin
                privileges. Click below to read them via <code>powermetrics</code>.
              </p>
              <p className="text-faint" style={{ fontSize: 11 }}>
                Touch ID accepted. Each click prompts once; auth is not stored.
              </p>
              <button
                className="primary"
                onClick={authorize}
                disabled={authorizing}
                style={{ marginTop: 8 }}
              >
                {authorizing ? 'Reading…' : 'Read full sensors'}
              </button>
            </div>
          )}
          {error && <div className="text-danger" style={{ marginTop: 10, fontSize: 12 }}>{error}</div>}
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">
          <span>Top processes by energy impact</span>
          <span className="badge">{reading.energyImpactProcesses.length}</span>
        </h2>
        {reading.energyImpactProcesses.length === 0 ? (
          <div className="text-muted">No energy data — system is idle.</div>
        ) : (
          <table className="proc-table">
            <thead>
              <tr>
                <th>Process</th>
                <th style={{ width: 90 }}>PID</th>
                <th className="right" style={{ width: 100 }}>Energy</th>
                <th className="right" style={{ width: 80 }}>CPU</th>
              </tr>
            </thead>
            <tbody>
              {reading.energyImpactProcesses.map((p) => (
                <tr key={p.pid}>
                  <td className="name">{p.name}</td>
                  <td className="pid">{p.pid}</td>
                  <td
                    className={`right ${
                      p.power > 50 ? 'text-danger' : p.power > 20 ? 'text-warn' : ''
                    }`}
                  >
                    {p.power.toFixed(1)}
                  </td>
                  <td className="right">{p.cpuPercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-faint" style={{ fontSize: 11, marginTop: 10 }}>
          Energy score is macOS' relative power measure (similar to Activity Monitor's "Energy
          Impact"). Higher = more battery drain.
        </div>
      </section>

      {reading.source === 'powermetrics' && (
        <button onClick={authorize} disabled={authorizing} style={{ alignSelf: 'flex-start' }}>
          {authorizing ? 'Refreshing…' : 'Refresh authorized sensors'}
        </button>
      )}
    </div>
  );
}
