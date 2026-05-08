import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  EnergyImpactProcess,
  SensorReading,
  ThermalStatus,
} from '../shared/types.js';
import { getBatteryInfo } from './battery.js';

const execAsync = promisify(exec);

async function runText(cmd: string, timeoutMs = 10000): Promise<string> {
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

async function getThermalStatus(): Promise<ThermalStatus | null> {
  const out = await runText('pmset -g therm');
  if (!out.trim()) return null;
  const cpu = out.match(/CPU_Speed_Limit\s*=\s*(\d+)/);
  const sched = out.match(/CPU_Scheduler_Limit\s*=\s*(\d+)/);
  const avail = out.match(/CPU_Available_CPUs\s*=\s*(\d+)/);
  const stateMatch = out.match(/Current Thermal State:\s*(\S+)/i);
  return {
    cpuSpeedLimit: cpu ? Number.parseInt(cpu[1], 10) : null,
    schedulerLimit: sched ? Number.parseInt(sched[1], 10) : null,
    available: avail ? Number.parseInt(avail[1], 10) : null,
    state: stateMatch ? stateMatch[1] : 'normal',
  };
}

async function getEnergyImpact(limit = 12): Promise<EnergyImpactProcess[]> {
  const out = await runText('top -l 1 -n 60 -stats pid,command,cpu,power,mem -o power');
  const lines = out.split('\n');
  let started = false;
  const processes: EnergyImpactProcess[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!started) {
      if (/^PID\s/.test(line)) started = true;
      continue;
    }
    if (!line.trim()) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 4) continue;
    const pid = Number.parseInt(cols[0], 10);
    if (!Number.isFinite(pid)) continue;
    const power = Number.parseFloat(cols[cols.length - 2]);
    const cpu = Number.parseFloat(cols[cols.length - 3]);
    const name = cols.slice(1, cols.length - 3).join(' ');
    if (!Number.isFinite(power) || power <= 0) continue;
    processes.push({ pid, name, power, cpuPercent: Number.isFinite(cpu) ? cpu : 0 });
    if (processes.length >= limit) break;
  }
  return processes;
}

export async function getSensors(): Promise<SensorReading> {
  const [thermal, processes, battery] = await Promise.all([
    getThermalStatus(),
    getEnergyImpact(),
    getBatteryInfo().catch(() => null),
  ]);
  return {
    source: 'sudoless',
    thermal,
    energyImpactProcesses: processes,
    batteryTemperatureCelsius: battery?.temperatureCelsius ?? null,
  };
}

function parsePowermetricsThermal(out: string): {
  cpuTemp: number | null;
  gpuTemp: number | null;
  fans: number[];
  cpuPower: number | null;
  gpuPower: number | null;
  anePower: number | null;
  combinedPower: number | null;
} {
  const matchNum = (re: RegExp) => {
    const m = out.match(re);
    return m ? Number.parseFloat(m[1]) : null;
  };
  const cpuTemp =
    matchNum(/CPU die temperature:\s*([\d.]+)\s*C/i) ??
    matchNum(/CPU\s+temperature:\s*([\d.]+)\s*C/i);
  const gpuTemp =
    matchNum(/GPU die temperature:\s*([\d.]+)\s*C/i) ??
    matchNum(/GPU\s+temperature:\s*([\d.]+)\s*C/i);
  const cpuPower = matchNum(/CPU Power:\s*([\d.]+)\s*mW/);
  const gpuPower = matchNum(/GPU Power:\s*([\d.]+)\s*mW/);
  const anePower = matchNum(/ANE Power:\s*([\d.]+)\s*mW/);
  const combinedPower = matchNum(/Combined Power[^:]*:\s*([\d.]+)\s*mW/);
  const fans: number[] = [];
  for (const fanMatch of out.matchAll(/Fan\s*(?:\d+)?:\s*(\d+)\s*rpm/gi)) {
    fans.push(Number.parseInt(fanMatch[1], 10));
  }
  return {
    cpuTemp,
    gpuTemp,
    fans,
    cpuPower: cpuPower !== null ? cpuPower / 1000 : null,
    gpuPower: gpuPower !== null ? gpuPower / 1000 : null,
    anePower: anePower !== null ? anePower / 1000 : null,
    combinedPower: combinedPower !== null ? combinedPower / 1000 : null,
  };
}

export async function getAuthorizedSensors(): Promise<SensorReading> {
  const baseline = await getSensors();
  const cmd =
    "powermetrics -n 1 -i 200 --samplers thermal,cpu_power,gpu_power 2>/dev/null || powermetrics -n 1 -i 200 -A 2>/dev/null";
  const escaped = cmd.replace(/"/g, '\\"');
  const osa = `do shell script "${escaped}" with administrator privileges`;
  let stdout = '';
  let errors: string[] = [];
  try {
    const result = await execAsync(`osascript -e '${osa.replace(/'/g, "'\\''")}'`, {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30000,
    });
    stdout = result.stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const msg = e.stderr ?? e.message ?? 'unknown error';
    if (msg.includes('User canceled') || msg.includes('-128')) {
      errors.push('Authorization cancelled.');
    } else {
      errors.push(`powermetrics failed: ${msg.split('\n')[0]}`);
    }
    return { ...baseline, source: 'sudoless', errors };
  }

  const parsed = parsePowermetricsThermal(stdout);
  return {
    ...baseline,
    source: 'powermetrics',
    cpuDieTemperatureCelsius: parsed.cpuTemp,
    gpuDieTemperatureCelsius: parsed.gpuTemp,
    fanRpms: parsed.fans,
    cpuPackagePowerWatts: parsed.cpuPower,
    gpuPowerWatts: parsed.gpuPower,
    anePowerWatts: parsed.anePower,
    combinedPowerWatts: parsed.combinedPower,
    errors,
  };
}
