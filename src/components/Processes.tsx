import { useMemo, useState } from 'react';
import type { ProcessInfo, SystemSnapshot } from '../../electron/shared/types';
import { formatBytes } from '../lib/format';
import { useProcessIcons } from '../hooks/useProcessIcons';
import { ProcessDetailDrawer } from './ProcessDetailDrawer';

interface ProcessesProps {
  snapshot: SystemSnapshot | null;
}

type SortKey = 'cpuPercent' | 'memRssBytes' | 'pid' | 'name' | 'user';

export function Processes({ snapshot }: ProcessesProps): JSX.Element {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpuPercent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [drawerPid, setDrawerPid] = useState<number | null>(null);

  const baseList = snapshot?.processes.list ?? [];
  const icons = useProcessIcons(baseList);

  const processes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list: ProcessInfo[] = baseList;
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.command.toLowerCase().includes(q) ||
          String(p.pid).includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [baseList, filter, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'user' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (key: SortKey) => {
    if (key !== sortKey) return null;
    return <span className="sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  const handleKill = async (pid: number, force: boolean) => {
    const proc = processes.find((p) => p.pid === pid);
    const name = proc?.name ?? `pid ${pid}`;
    const verb = force ? 'force quit' : 'quit';
    if (!confirm(`${verb} "${name}" (pid ${pid})?`)) return;
    const result = await window.api.killProcess(pid, force ? 'SIGKILL' : 'SIGTERM');
    if (!result.ok) {
      alert(`Could not ${verb} ${name}: ${result.error}`);
    } else if (drawerPid === pid) {
      setDrawerPid(null);
    }
  };

  if (!snapshot) {
    return <div className="empty">Loading…</div>;
  }

  const drawerIcon = drawerPid !== null
    ? icons[processes.find((p) => p.pid === drawerPid)?.command ?? ''] ?? null
    : null;

  return (
    <div className="processes">
      <div className="proc-toolbar">
        <input
          type="search"
          placeholder="Filter by name, command or PID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
        <span className="toolbar-info">
          {processes.length} of {snapshot.processes.all} processes
        </span>
        {selectedPid !== null && (
          <>
            <button onClick={() => setDrawerPid(selectedPid)}>Inspect</button>
            <button onClick={() => handleKill(selectedPid, false)}>Quit</button>
            <button className="danger" onClick={() => handleKill(selectedPid, true)}>
              Force Quit
            </button>
          </>
        )}
      </div>

      <div className="proc-table-wrap">
        <table className="proc-table">
          <thead>
            <tr>
              <th onClick={() => onSort('name')}>Process{sortArrow('name')}</th>
              <th onClick={() => onSort('pid')} style={{ width: 80 }}>
                PID{sortArrow('pid')}
              </th>
              <th onClick={() => onSort('user')} style={{ width: 110 }}>
                User{sortArrow('user')}
              </th>
              <th className="right" onClick={() => onSort('cpuPercent')} style={{ width: 80 }}>
                CPU{sortArrow('cpuPercent')}
              </th>
              <th className="right" onClick={() => onSort('memRssBytes')} style={{ width: 110 }}>
                Memory{sortArrow('memRssBytes')}
              </th>
            </tr>
          </thead>
          <tbody>
            {processes.map((p) => {
              const icon = icons[p.command];
              return (
                <tr
                  key={p.pid}
                  className={selectedPid === p.pid ? 'selected' : ''}
                  onClick={() => setSelectedPid(p.pid === selectedPid ? null : p.pid)}
                  onDoubleClick={() => setDrawerPid(p.pid)}
                >
                  <td className="name" title={p.command}>
                    <div className="proc-name-cell">
                      <span className="proc-icon">
                        {icon ? <img src={icon} alt="" width={16} height={16} /> : <span>·</span>}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </div>
                  </td>
                  <td className="pid">{p.pid}</td>
                  <td className="user">{p.user}</td>
                  <td className="right">{p.cpuPercent.toFixed(1)}%</td>
                  <td className="right">{formatBytes(p.memRssBytes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {processes.length === 0 && <div className="empty">No processes match.</div>}

      <ProcessDetailDrawer
        pid={drawerPid}
        iconUrl={drawerIcon}
        onClose={() => setDrawerPid(null)}
        onKill={handleKill}
      />
    </div>
  );
}
