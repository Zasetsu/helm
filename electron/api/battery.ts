import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { BatteryInfo } from '../shared/types.js';

const execAsync = promisify(exec);

async function runText(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stdout?: string };
    return e.stdout ?? '';
  }
}

function findNumber(text: string, key: string): number | null {
  const re = new RegExp(`"${key}"\\s*=\\s*(-?\\d+)`);
  const m = text.match(re);
  return m ? Number.parseInt(m[1], 10) : null;
}

function findBool(text: string, key: string): boolean | null {
  const re = new RegExp(`"${key}"\\s*=\\s*(Yes|No)`);
  const m = text.match(re);
  if (!m) return null;
  return m[1] === 'Yes';
}

function findAdapterWatts(text: string): number | null {
  const adapterMatch = text.match(/"AppleRawAdapterDetails"\s*=\s*\(\{([^}]+)\}/);
  if (!adapterMatch) return null;
  const wattsMatch = adapterMatch[1].match(/"Watts"\s*=\s*(\d+)/);
  return wattsMatch ? Number.parseInt(wattsMatch[1], 10) : null;
}

export async function getBatteryInfo(): Promise<BatteryInfo | null> {
  const ioregOut = await runText('ioreg -l -w0 -r -c AppleSmartBattery');
  if (!ioregOut.trim()) return null;

  const isPresent = findBool(ioregOut, 'BatteryInstalled') ?? true;
  if (!isPresent) return null;

  const isCharging = findBool(ioregOut, 'IsCharging') ?? false;
  const isFullyCharged = findBool(ioregOut, 'FullyCharged') ?? false;
  const externalConnected = findBool(ioregOut, 'ExternalConnected') ?? false;

  const chargePercentRaw = findNumber(ioregOut, 'CurrentCapacity') ?? 0;
  const designCapacity = findNumber(ioregOut, 'DesignCapacity') ?? 0;
  const maxCapacity = findNumber(ioregOut, 'AppleRawMaxCapacity') ?? designCapacity;
  const currentCapacity = findNumber(ioregOut, 'AppleRawCurrentCapacity') ?? 0;

  const voltageMv = findNumber(ioregOut, 'AppleRawBatteryVoltage') ?? findNumber(ioregOut, 'Voltage') ?? 0;
  const amperageMa = findNumber(ioregOut, 'Amperage') ?? 0;
  const temperatureRaw = findNumber(ioregOut, 'Temperature') ?? 0;

  const healthPercent = designCapacity > 0 ? (maxCapacity / designCapacity) * 100 : 0;
  const powerDrawWatts = (voltageMv / 1000) * (Math.abs(amperageMa) / 1000);
  const adapterWatts = findAdapterWatts(ioregOut);

  let timeToEmptyMinutes: number | null = null;
  let timeToFullMinutes: number | null = null;

  if (isCharging) {
    const timeRemaining = findNumber(ioregOut, 'TimeRemaining');
    if (timeRemaining !== null && timeRemaining > 0 && timeRemaining < 9999) {
      timeToFullMinutes = timeRemaining;
    }
  } else if (!externalConnected) {
    const timeRemaining = findNumber(ioregOut, 'TimeRemaining');
    if (timeRemaining !== null && timeRemaining > 0 && timeRemaining < 9999) {
      timeToEmptyMinutes = timeRemaining;
    }
  }

  return {
    isPresent: true,
    isCharging,
    isFullyCharged,
    externalConnected,
    chargePercent: chargePercentRaw,
    designCapacityMah: designCapacity,
    maxCapacityMah: maxCapacity,
    currentCapacityMah: currentCapacity,
    healthPercent,
    cycleCount: findNumber(ioregOut, 'CycleCount') ?? 0,
    voltageMv,
    amperageMa,
    powerDrawWatts,
    temperatureCelsius: temperatureRaw / 100,
    timeToEmptyMinutes,
    timeToFullMinutes,
    adapterWatts,
    source: externalConnected ? 'AC' : 'Battery',
  };
}
