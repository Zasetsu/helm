import { useEffect, useState } from 'react';
import type { BatteryInfo } from '../../electron/shared/types';
import { loadClass } from '../lib/format';

function formatTime(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function healthBand(percent: number): { label: string; className: string } {
  if (percent >= 85) return { label: 'Excellent', className: 'text-good' };
  if (percent >= 70) return { label: 'Good', className: 'text-good' };
  if (percent >= 55) return { label: 'Fair', className: 'text-warn' };
  return { label: 'Service recommended', className: 'text-danger' };
}

function cycleBand(count: number): { label: string; className: string } {
  if (count < 300) return { label: 'Low usage', className: 'text-good' };
  if (count < 800) return { label: 'Normal', className: 'text-muted' };
  if (count < 1000) return { label: 'High', className: 'text-warn' };
  return { label: 'Very high', className: 'text-danger' };
}

export function Battery(): JSX.Element {
  const [info, setInfo] = useState<BatteryInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await window.api.getBatteryInfo();
        if (cancelled) return;
        setInfo(data);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!loaded) {
    return <div className="empty">Reading battery state…</div>;
  }

  if (error) {
    return <div className="empty text-danger">Could not read battery: {error}</div>;
  }

  if (!info) {
    return (
      <div className="empty">
        <strong>No battery detected.</strong>
        <br />
        Helm only reports battery info on Macs with internal batteries (laptops).
      </div>
    );
  }

  const health = healthBand(info.healthPercent);
  const cycles = cycleBand(info.cycleCount);
  const stateLine = info.isCharging
    ? info.isFullyCharged
      ? 'Connected, fully charged'
      : `Charging from ${info.adapterWatts ?? '–'}W adapter`
    : info.externalConnected
      ? 'Connected, not charging'
      : 'Running on battery';

  return (
    <div className="section-row">
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">
            <span>Charge</span>
            <span className={`badge ${info.source === 'AC' ? 'text-good' : 'text-warn'}`}>
              {info.source}
            </span>
          </h2>
          <div className="row-spread" style={{ marginBottom: 14 }}>
            <div className="stat">
              <span className="value">
                {info.chargePercent}
                <span className="unit">%</span>
              </span>
              <span className="meta">{stateLine}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              {info.isCharging ? (
                <>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    Time to full
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {formatTime(info.timeToFullMinutes)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    Time remaining
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {formatTime(info.timeToEmptyMinutes)}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="bar">
            <div
              className={`fill ${loadClass(100 - info.chargePercent)}`}
              style={{ width: `${Math.min(100, info.chargePercent)}%` }}
            />
          </div>
          <div className="bar-row" style={{ marginTop: 14 }}>
            <span>Power flow</span>
            <span className="bar-row-value">
              {info.isCharging ? '+' : info.amperageMa < 0 ? '−' : ''}
              {info.powerDrawWatts.toFixed(1)} W
            </span>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">
            <span>Health</span>
            <span className={`badge ${health.className}`}>{health.label}</span>
          </h2>
          <div className="stat" style={{ marginBottom: 14 }}>
            <span className="value">
              {info.healthPercent.toFixed(0)}
              <span className="unit">%</span>
            </span>
            <span className="meta">
              <span className="key">max</span> {info.maxCapacityMah} mAh ·{' '}
              <span className="key">design</span> {info.designCapacityMah} mAh
            </span>
          </div>
          <div className="bar">
            <div
              className={`fill ${
                info.healthPercent >= 85
                  ? ''
                  : info.healthPercent >= 70
                    ? 'warn'
                    : 'danger'
              }`}
              style={{ width: `${Math.min(100, info.healthPercent)}%` }}
            />
          </div>
          <div className="bar-row" style={{ marginTop: 14 }}>
            <span>
              Cycle count <span className={cycles.className}>({cycles.label})</span>
            </span>
            <span className="bar-row-value">{info.cycleCount}</span>
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">
          <span>Sensors</span>
        </h2>
        <dl className="kv-list" style={{ gridTemplateColumns: 'repeat(2, max-content 1fr)' }}>
          <dt>Voltage</dt>
          <dd>{(info.voltageMv / 1000).toFixed(2)} V</dd>

          <dt>Current</dt>
          <dd>
            {info.amperageMa >= 0 ? '+' : '−'}
            {Math.abs(info.amperageMa)} mA
          </dd>

          <dt>Temperature</dt>
          <dd className={info.temperatureCelsius > 40 ? 'text-warn' : ''}>
            {info.temperatureCelsius.toFixed(1)} °C
          </dd>

          <dt>Adapter</dt>
          <dd>{info.adapterWatts ? `${info.adapterWatts} W` : '—'}</dd>

          <dt>Charged</dt>
          <dd>
            {info.currentCapacityMah} / {info.maxCapacityMah} mAh
          </dd>

          <dt>Power draw</dt>
          <dd>{info.powerDrawWatts.toFixed(2)} W</dd>
        </dl>
      </section>

      <div
        className="text-faint"
        style={{ fontSize: 11, textAlign: 'center', padding: '4px 0' }}
      >
        Battery readings refresh every 5 seconds.
      </div>
    </div>
  );
}
