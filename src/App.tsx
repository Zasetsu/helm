import { useEffect, useState } from 'react';
import { useSnapshot } from './hooks/useSnapshot';
import { useDiskScan } from './hooks/useDiskScan';
import { Overview } from './components/Overview';
import { Processes } from './components/Processes';
import { DiskAnalyzer } from './components/DiskAnalyzer';
import { CacheCleaner } from './components/CacheCleaner';
import { Network } from './components/Network';
import { Battery } from './components/Battery';
import { Sensors } from './components/Sensors';
import { formatUptime } from './lib/format';
import iconUrl from './assets/icon.png';

type Tab = 'overview' | 'processes' | 'disk' | 'cache' | 'network' | 'battery' | 'sensors';

interface PlatformInfo {
  platform: string;
  arch: string;
  release: string;
  hostname: string;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◐' },
  { id: 'processes', label: 'Processes', icon: '☰' },
  { id: 'network', label: 'Network', icon: '⇅' },
  { id: 'battery', label: 'Battery', icon: '⚡' },
  { id: 'sensors', label: 'Sensors', icon: '◉' },
  { id: 'disk', label: 'Disk', icon: '◇' },
  { id: 'cache', label: 'Cache Cleaner', icon: '✦' },
];

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview');
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const { snapshot, history, error } = useSnapshot(1500);
  const diskScan = useDiskScan();

  useEffect(() => {
    window.api.getPlatform().then(setPlatform).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return;
      const idx = Number.parseInt(e.key, 10);
      if (!Number.isFinite(idx) || idx < 1 || idx > TABS.length) return;
      e.preventDefault();
      setTab(TABS[idx - 1]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="drag-spacer" />
        <div className="brand">
          <img className="brand-icon" src={iconUrl} alt="" width={22} height={22} />
          <span>Helm</span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              <span style={{ flex: 1 }}>{t.label}</span>
              {t.id === 'disk' && diskScan.isScanning && (
                <span
                  className="spinner"
                  title="Scan in progress"
                  style={{ width: 10, height: 10, borderWidth: 1.5 }}
                />
              )}
            </button>
          ))}
        </nav>
        <div className="footer">
          {platform && (
            <div className="footer-info">
              <strong style={{ color: 'var(--text)' }}>{platform.hostname}</strong>
              <br />
              {platform.platform} · {platform.arch}
              <br />
              {platform.release}
              {snapshot && (
                <>
                  <br />
                  uptime {formatUptime(snapshot.uptimeSeconds)}
                </>
              )}
            </div>
          )}
          <button onClick={() => window.api.quit()}>Quit Helm</button>
        </div>
      </aside>

      <main className="main">
        <header className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1>{TABS.find((t) => t.id === tab)?.label}</h1>
            {error && <span className="subtitle text-danger">· {error}</span>}
          </div>
          <div className="header-actions">
            {snapshot && (
              <>
                <span className="header-pill">
                  CPU <strong>{snapshot.cpu.loadPercent.toFixed(0)}%</strong>
                </span>
                <span className="header-pill">
                  MEM{' '}
                  <strong>
                    {(snapshot.memory.usedBytes / 1024 ** 3).toFixed(1)} /{' '}
                    {(snapshot.memory.totalBytes / 1024 ** 3).toFixed(0)} GB
                  </strong>
                </span>
              </>
            )}
          </div>
        </header>

        <div className="content">
          {tab === 'overview' && <Overview snapshot={snapshot} history={history} />}
          {tab === 'processes' && <Processes snapshot={snapshot} />}
          {tab === 'network' && <Network />}
          {tab === 'battery' && <Battery />}
          {tab === 'sensors' && <Sensors />}
          {tab === 'disk' && <DiskAnalyzer scan={diskScan} />}
          {tab === 'cache' && <CacheCleaner />}
        </div>
      </main>
    </div>
  );
}
