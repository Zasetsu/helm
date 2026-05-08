import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import si from 'systeminformation';
import type {
  NetworkConnection,
  NetworkInterfaceStats,
  NetworkProcessUsage,
  NetworkSnapshot,
} from '../shared/types.js';

const execAsync = promisify(exec);

async function runText(cmd: string, timeoutMs = 5000): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 8 * 1024 * 1024,
      timeout: timeoutMs,
    });
    return stdout;
  } catch (err) {
    const e = err as { stdout?: string };
    return e.stdout ?? '';
  }
}

async function getInterfaceStats(): Promise<NetworkInterfaceStats[]> {
  const stats = await si.networkStats('*');
  return stats
    .filter((s) => s.iface && !s.iface.startsWith('lo') && !s.iface.startsWith('utun'))
    .map((s) => ({
      iface: s.iface,
      operstate: s.operstate || 'unknown',
      rxBytes: s.rx_bytes,
      txBytes: s.tx_bytes,
      rxBytesPerSec: Math.max(0, s.rx_sec ?? 0),
      txBytesPerSec: Math.max(0, s.tx_sec ?? 0),
    }));
}

async function getProcessBandwidth(): Promise<NetworkProcessUsage[]> {
  const out = await runText('nettop -P -L 1 -x -t external -J bytes_in,bytes_out', 8000);
  const lines = out.split('\n');

  const results: NetworkProcessUsage[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    if (cols.length < 3) continue;
    const procField = cols[0];
    if (!procField || procField === 'time') continue;
    const dotIdx = procField.lastIndexOf('.');
    if (dotIdx < 0) continue;
    const name = procField.slice(0, dotIdx);
    const pid = Number.parseInt(procField.slice(dotIdx + 1), 10);
    if (!Number.isFinite(pid)) continue;
    const rxBytes = Number.parseInt(cols[1] ?? '0', 10) || 0;
    const txBytes = Number.parseInt(cols[2] ?? '0', 10) || 0;
    if (rxBytes === 0 && txBytes === 0) continue;
    results.push({ pid, name, rxBytes, txBytes });
  }
  results.sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes));
  return results.slice(0, 25);
}

async function getConnections(): Promise<NetworkConnection[]> {
  const out = await runText('lsof -i -nP -F pcPnT', 5000);
  const records: NetworkConnection[] = [];
  let current: Partial<NetworkConnection> = {};
  for (const line of out.split('\n')) {
    if (!line) continue;
    const tag = line.charAt(0);
    const value = line.slice(1);
    switch (tag) {
      case 'p': {
        if (current.pid !== undefined && current.local) {
          records.push({
            pid: current.pid,
            process: current.process ?? '',
            protocol: current.protocol ?? '',
            local: current.local ?? '',
            remote: current.remote ?? '',
            state: current.state ?? '',
          });
        }
        current = { pid: Number.parseInt(value, 10) };
        break;
      }
      case 'c':
        current.process = value;
        break;
      case 'P':
        current.protocol = value;
        break;
      case 'n': {
        const arrowIdx = value.indexOf('->');
        if (arrowIdx >= 0) {
          current.local = value.slice(0, arrowIdx);
          current.remote = value.slice(arrowIdx + 2);
        } else {
          current.local = value;
          current.remote = '';
        }
        break;
      }
      case 'T': {
        const eq = value.indexOf('=');
        if (eq > 0 && value.startsWith('ST=')) {
          current.state = value.slice(3);
        }
        break;
      }
    }
  }
  if (current.pid !== undefined && current.local) {
    records.push({
      pid: current.pid,
      process: current.process ?? '',
      protocol: current.protocol ?? '',
      local: current.local ?? '',
      remote: current.remote ?? '',
      state: current.state ?? '',
    });
  }
  return records;
}

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const [interfaces, processes, connections] = await Promise.all([
    getInterfaceStats(),
    getProcessBandwidth().catch(() => [] as NetworkProcessUsage[]),
    getConnections().catch(() => [] as NetworkConnection[]),
  ]);

  const totals = interfaces.reduce(
    (acc, iface) => ({
      rxBytes: acc.rxBytes + iface.rxBytes,
      txBytes: acc.txBytes + iface.txBytes,
      rxBytesPerSec: acc.rxBytesPerSec + iface.rxBytesPerSec,
      txBytesPerSec: acc.txBytesPerSec + iface.txBytesPerSec,
    }),
    { rxBytes: 0, txBytes: 0, rxBytesPerSec: 0, txBytesPerSec: 0 },
  );

  return {
    timestampMs: Date.now(),
    totals,
    interfaces,
    processes,
    connections,
  };
}
