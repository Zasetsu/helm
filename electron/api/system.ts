import si from 'systeminformation';
import { app } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  CpuInfo,
  CpuLoad,
  MemoryInfo,
  ProcessAncestor,
  ProcessConnection,
  ProcessDetail,
  ProcessInfo,
  ProcessOpenFile,
  ProcessSnapshot,
  SystemSnapshot,
} from '../shared/types.js';

const execAsync = promisify(exec);

export async function getCpuInfo(): Promise<CpuInfo> {
  const [cpu, temp] = await Promise.all([si.cpu(), si.cpuTemperature().catch(() => null)]);

  return {
    manufacturer: cpu.manufacturer,
    brand: cpu.brand,
    cores: cpu.cores,
    physicalCores: cpu.physicalCores,
    speedGhz: cpu.speed,
    temperatureCelsius: temp && typeof temp.main === 'number' && temp.main > 0 ? temp.main : null,
  };
}

async function getCpuLoad(): Promise<CpuLoad> {
  const load = await si.currentLoad();
  return {
    loadPercent: load.currentLoad,
    loadUserPercent: load.currentLoadUser,
    loadSystemPercent: load.currentLoadSystem,
    perCorePercent: load.cpus.map((c) => c.load),
  };
}

async function getMacMemory(): Promise<MemoryInfo> {
  const [{ stdout: vmOut }, { stdout: sizeOut }, { stdout: pageOut }, { stdout: swapOut }] =
    await Promise.all([
      execAsync('vm_stat'),
      execAsync('sysctl -n hw.memsize'),
      execAsync('sysctl -n hw.pagesize'),
      execAsync('sysctl -n vm.swapusage').catch(() => ({ stdout: '' })),
    ]);

  const totalBytes = Number.parseInt(sizeOut.trim(), 10) || 0;
  const pageSize = Number.parseInt(pageOut.trim(), 10) || 16384;

  const pages: Record<string, number> = {};
  for (const line of vmOut.split('\n')) {
    const match = line.match(/^(.+?):\s+(\d+)\.?$/);
    if (!match) continue;
    pages[match[1].trim()] = Number.parseInt(match[2], 10);
  }

  const pageBytes = (key: string) => (pages[key] ?? 0) * pageSize;

  const free = pageBytes('Pages free');
  const active = pageBytes('Pages active');
  const inactive = pageBytes('Pages inactive');
  const speculative = pageBytes('Pages speculative');
  const wired = pageBytes('Pages wired down');
  const purgeable = pageBytes('Pages purgeable');
  const compressed = pageBytes('Pages occupied by compressor');

  const used = active + wired + compressed;
  const available = free + inactive + speculative + purgeable;

  let swapTotal = 0;
  let swapUsed = 0;
  const swapMatch = swapOut.match(/total = ([\d.]+)([MGK])\s+used = ([\d.]+)([MGK])/);
  if (swapMatch) {
    const unitToBytes = (n: string, u: string) => {
      const value = Number.parseFloat(n);
      const factor = u === 'G' ? 1024 ** 3 : u === 'M' ? 1024 ** 2 : 1024;
      return Math.round(value * factor);
    };
    swapTotal = unitToBytes(swapMatch[1], swapMatch[2]);
    swapUsed = unitToBytes(swapMatch[3], swapMatch[4]);
  }

  return {
    totalBytes,
    freeBytes: free + speculative,
    usedBytes: used,
    activeBytes: active,
    inactiveBytes: inactive,
    wiredBytes: wired,
    compressedBytes: compressed,
    cachedBytes: purgeable,
    availableBytes: available,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapUsed,
  };
}

async function getMemory(): Promise<MemoryInfo> {
  if (process.platform === 'darwin') {
    return getMacMemory();
  }
  const m = await si.mem();
  return {
    totalBytes: m.total,
    freeBytes: m.free,
    usedBytes: m.used,
    activeBytes: m.active,
    inactiveBytes: 0,
    wiredBytes: (m as unknown as { wired?: number }).wired ?? 0,
    compressedBytes: 0,
    cachedBytes: m.cached ?? 0,
    availableBytes: m.available ?? 0,
    swapTotalBytes: m.swaptotal,
    swapUsedBytes: m.swapused,
  };
}

async function getProcesses(): Promise<ProcessSnapshot> {
  const p = await si.processes();

  const totalMemBytes = (await si.mem()).total;

  const list: ProcessInfo[] = p.list
    .map((proc) => ({
      pid: proc.pid,
      parentPid: proc.parentPid,
      name: proc.name,
      cpuPercent: proc.cpu,
      memPercent: proc.mem,
      memRssBytes: Math.round((proc.mem / 100) * totalMemBytes),
      user: proc.user,
      command: proc.command,
      state: proc.state,
      started: proc.started,
    }))
    .sort((a, b) => b.cpuPercent - a.cpuPercent);

  return {
    all: p.all,
    running: p.running,
    sleeping: p.sleeping,
    list,
  };
}

async function getUptimeSeconds(): Promise<number> {
  const t = await si.time();
  return t.uptime;
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const [cpu, memory, processes, uptimeSeconds] = await Promise.all([
    getCpuLoad(),
    getMemory(),
    getProcesses(),
    getUptimeSeconds(),
  ]);

  return {
    timestampMs: Date.now(),
    cpu,
    memory,
    processes,
    uptimeSeconds,
  };
}

export async function killProcess(
  pid: number,
  signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM',
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(pid) || pid <= 1) {
    return { ok: false, error: `Invalid pid: ${pid}` };
  }
  try {
    process.kill(pid, signal);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('EPERM')) {
      try {
        await execAsync(`kill -${signal === 'SIGKILL' ? '9' : '15'} ${pid}`);
        return { ok: true };
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        return { ok: false, error: m2 };
      }
    }
    return { ok: false, error: message };
  }
}

export async function getDiskMounts() {
  const fs = await si.fsSize();
  return fs.map((d) => ({
    fs: d.fs,
    type: d.type,
    sizeBytes: d.size,
    usedBytes: d.used,
    availableBytes: d.available,
    usePercent: d.use,
    mount: d.mount,
  }));
}

export async function getPlatformInfo() {
  const o = await si.osInfo();
  return {
    platform: o.platform,
    arch: o.arch,
    release: o.release,
    hostname: o.hostname,
  };
}

export function extractAppBundle(command: string): string | null {
  if (!command || !command.startsWith('/')) return null;
  const idx = command.indexOf('.app/');
  if (idx >= 0) return command.slice(0, idx + 4);
  const trailingIdx = command.indexOf('.app');
  if (trailingIdx > 0 && trailingIdx + 4 === command.length) {
    return command.slice(0, trailingIdx + 4);
  }
  return null;
}

const iconCache = new Map<string, string>();

export async function getProcessIcons(
  commands: string[],
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const unique = Array.from(new Set(commands));

  await Promise.all(
    unique.map(async (cmd) => {
      const appPath = extractAppBundle(cmd);
      if (!appPath) {
        result[cmd] = null;
        return;
      }
      const cached = iconCache.get(appPath);
      if (cached) {
        result[cmd] = cached;
        return;
      }
      try {
        const icon = await app.getFileIcon(appPath, { size: 'normal' });
        if (icon.isEmpty()) {
          result[cmd] = null;
          return;
        }
        const dataUrl = icon.toDataURL();
        iconCache.set(appPath, dataUrl);
        result[cmd] = dataUrl;
      } catch {
        result[cmd] = null;
      }
    }),
  );

  return result;
}

async function runText(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stdout?: string };
    return e.stdout ?? '';
  }
}

async function getAncestors(pid: number): Promise<ProcessAncestor[]> {
  const ancestors: ProcessAncestor[] = [];
  let currentPid = pid;
  for (let depth = 0; depth < 16; depth++) {
    const out = await runText(`ps -o ppid=,comm=,command= -p ${currentPid}`);
    const trimmed = out.trim();
    if (!trimmed) break;
    const tokens = trimmed.split(/\s+/);
    const ppid = Number.parseInt(tokens[0] ?? '', 10);
    if (!Number.isFinite(ppid) || ppid <= 0) break;
    if (currentPid !== pid) {
      const comm = tokens[1] ?? '';
      const command = trimmed.slice(tokens[0]!.length + 1).trim();
      ancestors.push({
        pid: currentPid,
        name: comm.split('/').pop() ?? comm,
        command,
      });
    }
    if (ppid === 1 || ppid === 0) {
      ancestors.push({ pid: 1, name: 'launchd', command: '/sbin/launchd' });
      break;
    }
    currentPid = ppid;
  }
  return ancestors;
}

async function getThreadCount(pid: number): Promise<number> {
  const out = await runText(`ps -M -p ${pid}`);
  const lines = out.trim().split('\n');
  return Math.max(0, lines.length - 1);
}

async function getWorkingDir(pid: number): Promise<string | null> {
  const out = await runText(`lsof -a -d cwd -p ${pid} -Fn`);
  for (const line of out.split('\n')) {
    if (line.startsWith('n')) return line.slice(1).trim() || null;
  }
  return null;
}

async function getOpenFiles(pid: number, limit = 200): Promise<ProcessOpenFile[]> {
  const out = await runText(`lsof -p ${pid} -n -P`);
  const lines = out.split('\n').slice(1);
  const files: ProcessOpenFile[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 9) continue;
    const fd = cols[3] ?? '';
    const type = cols[4] ?? '';
    const name = cols.slice(8).join(' ');
    if (!name || name.startsWith('TCP') || name.startsWith('UDP')) continue;
    files.push({ fd, type, name });
    if (files.length >= limit) break;
  }
  return files;
}

async function getConnections(pid: number): Promise<ProcessConnection[]> {
  const out = await runText(`lsof -i -n -P -a -p ${pid}`);
  const lines = out.split('\n').slice(1);
  const conns: ProcessConnection[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 9) continue;
    const protocol = cols[7] ?? '';
    const nameField = cols.slice(8).join(' ');
    let local = nameField;
    let remote = '';
    let state = '';
    const arrowIdx = nameField.indexOf('->');
    if (arrowIdx >= 0) {
      local = nameField.slice(0, arrowIdx).trim();
      const rest = nameField.slice(arrowIdx + 2).trim();
      const stateMatch = rest.match(/^(\S+)\s*\(([^)]+)\)$/);
      if (stateMatch) {
        remote = stateMatch[1];
        state = stateMatch[2];
      } else {
        remote = rest;
      }
    } else {
      const stateMatch = nameField.match(/^(\S+)\s*\(([^)]+)\)$/);
      if (stateMatch) {
        local = stateMatch[1];
        state = stateMatch[2];
      }
    }
    conns.push({ protocol, local, remote, state });
  }
  return conns;
}

async function getEnvironment(pid: number): Promise<Record<string, string>> {
  const out = await runText(`ps eww -o command= -p ${pid}`);
  const env: Record<string, string> = {};
  if (!out.trim()) return env;
  const tokens = out.trim().split(/\s+/);
  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    env[key] = token.slice(eq + 1);
  }
  return env;
}

export async function getProcessDetail(pid: number): Promise<ProcessDetail | null> {
  if (!Number.isInteger(pid) || pid <= 0) return null;

  const psOut = await runText(
    `ps -o pid=,ppid=,user=,pcpu=,pmem=,rss=,vsz=,nice=,state=,lstart=,command= -p ${pid}`,
  );
  const trimmed = psOut.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  const numericFields = tokens.slice(0, 8);
  const state = tokens[8] ?? '';
  const startedAt = tokens.slice(9, 14).join(' ');
  const command = trimmed
    .slice(numericFields.join(' ').length)
    .trim()
    .replace(/^\S+\s+/, '')
    .replace(new RegExp(`^${state}\\s+`), '')
    .replace(new RegExp(`^${startedAt.split(/\s+/).join('\\s+')}\\s+`), '');

  const [threads, workingDir, ancestors, openFiles, connections, environment] = await Promise.all([
    getThreadCount(pid),
    getWorkingDir(pid),
    getAncestors(pid),
    getOpenFiles(pid),
    getConnections(pid),
    getEnvironment(pid),
  ]);

  const name = command.split(/[\s/]/).slice(-1)[0] ?? command;
  const appBundle = extractAppBundle(command);

  return {
    pid: Number.parseInt(numericFields[0] ?? `${pid}`, 10) || pid,
    parentPid: Number.parseInt(numericFields[1] ?? '0', 10) || 0,
    name,
    command,
    user: tokens[2] ?? '',
    cpuPercent: Number.parseFloat(numericFields[3] ?? '0') || 0,
    memRssBytes: (Number.parseInt(numericFields[5] ?? '0', 10) || 0) * 1024,
    memVirtualBytes: (Number.parseInt(numericFields[6] ?? '0', 10) || 0) * 1024,
    threads,
    startedAt,
    state,
    niceValue: Number.parseInt(numericFields[7] ?? '0', 10) || 0,
    workingDir,
    appBundlePath: appBundle,
    ancestors,
    openFiles,
    connections,
    environment,
  };
}
