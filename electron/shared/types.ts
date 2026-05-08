export interface CpuInfo {
  manufacturer: string;
  brand: string;
  cores: number;
  physicalCores: number;
  speedGhz: number;
  temperatureCelsius: number | null;
}

export interface CpuLoad {
  loadPercent: number;
  loadUserPercent: number;
  loadSystemPercent: number;
  perCorePercent: number[];
}

export interface MemoryInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  activeBytes: number;
  inactiveBytes: number;
  wiredBytes: number;
  compressedBytes: number;
  cachedBytes: number;
  availableBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface ProcessInfo {
  pid: number;
  parentPid: number;
  name: string;
  cpuPercent: number;
  memPercent: number;
  memRssBytes: number;
  user: string;
  command: string;
  state: string;
  started: string;
}

export interface ProcessSnapshot {
  all: number;
  running: number;
  sleeping: number;
  list: ProcessInfo[];
}

export interface ProcessAncestor {
  pid: number;
  name: string;
  command: string;
}

export interface ProcessOpenFile {
  fd: string;
  type: string;
  name: string;
}

export interface ProcessConnection {
  protocol: string;
  local: string;
  remote: string;
  state: string;
}

export interface ProcessDetail {
  pid: number;
  parentPid: number;
  name: string;
  command: string;
  user: string;
  cpuPercent: number;
  memRssBytes: number;
  memVirtualBytes: number;
  threads: number;
  startedAt: string;
  state: string;
  niceValue: number;
  workingDir: string | null;
  appBundlePath: string | null;
  ancestors: ProcessAncestor[];
  openFiles: ProcessOpenFile[];
  connections: ProcessConnection[];
  environment: Record<string, string>;
}

export interface SystemSnapshot {
  timestampMs: number;
  cpu: CpuLoad;
  memory: MemoryInfo;
  processes: ProcessSnapshot;
  uptimeSeconds: number;
}

export interface DiskMount {
  fs: string;
  type: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usePercent: number;
  mount: string;
}

export interface DiskEntry {
  name: string;
  path: string;
  sizeBytes: number;
  isDirectory: boolean;
  hasErrors: boolean;
}

export interface DiskScanProgress {
  scanId: string;
  path: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  entries: DiskEntry[];
  totalBytes: number;
  message?: string;
  errorCount: number;
}

export type CacheSafety = 'safe' | 'careful' | 'caution';

export interface CacheLocation {
  id: string;
  label: string;
  description: string;
  paths: string[];
  totalBytes: number;
  itemCount: number;
  safety: CacheSafety;
  hint?: string;
}

export interface CacheScanResult {
  locations: CacheLocation[];
  totalBytes: number;
  scannedAt: number;
}

export interface CacheCleanResult {
  ok: boolean;
  freedBytes: number;
  removedPaths: string[];
  errors: string[];
}

export interface NetworkInterfaceStats {
  iface: string;
  operstate: string;
  rxBytes: number;
  txBytes: number;
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

export interface NetworkProcessUsage {
  pid: number;
  name: string;
  rxBytes: number;
  txBytes: number;
}

export interface NetworkConnection {
  pid: number;
  process: string;
  protocol: string;
  local: string;
  remote: string;
  state: string;
}

export interface NetworkSnapshot {
  timestampMs: number;
  totals: {
    rxBytes: number;
    txBytes: number;
    rxBytesPerSec: number;
    txBytesPerSec: number;
  };
  interfaces: NetworkInterfaceStats[];
  processes: NetworkProcessUsage[];
  connections: NetworkConnection[];
}

export interface BatteryInfo {
  isPresent: boolean;
  isCharging: boolean;
  isFullyCharged: boolean;
  externalConnected: boolean;
  chargePercent: number;
  designCapacityMah: number;
  maxCapacityMah: number;
  currentCapacityMah: number;
  healthPercent: number;
  cycleCount: number;
  voltageMv: number;
  amperageMa: number;
  powerDrawWatts: number;
  temperatureCelsius: number;
  timeToEmptyMinutes: number | null;
  timeToFullMinutes: number | null;
  adapterWatts: number | null;
  source: 'AC' | 'Battery';
}

export interface EnergyImpactProcess {
  pid: number;
  name: string;
  power: number;
  cpuPercent: number;
}

export interface ThermalStatus {
  cpuSpeedLimit: number | null;
  schedulerLimit: number | null;
  available: number | null;
  state: string;
}

export interface SensorReading {
  source: 'sudoless' | 'powermetrics';
  thermal: ThermalStatus | null;
  energyImpactProcesses: EnergyImpactProcess[];
  batteryTemperatureCelsius: number | null;
  cpuDieTemperatureCelsius?: number | null;
  gpuDieTemperatureCelsius?: number | null;
  fanRpms?: number[];
  cpuPackagePowerWatts?: number | null;
  gpuPowerWatts?: number | null;
  anePowerWatts?: number | null;
  combinedPowerWatts?: number | null;
  errors?: string[];
}

export interface OsxStatsApi {
  getCpuInfo(): Promise<CpuInfo>;
  getSnapshot(): Promise<SystemSnapshot>;
  killProcess(pid: number, signal?: 'SIGTERM' | 'SIGKILL'): Promise<{ ok: boolean; error?: string }>;
  getProcessDetail(pid: number): Promise<ProcessDetail | null>;
  getProcessIcons(commands: string[]): Promise<Record<string, string | null>>;
  getDiskMounts(): Promise<DiskMount[]>;

  startDiskScan(path: string): Promise<{ scanId: string }>;
  cancelDiskScan(scanId: string): Promise<void>;
  onDiskScanUpdate(cb: (progress: DiskScanProgress) => void): () => void;

  scanCaches(): Promise<CacheScanResult>;
  cleanCache(id: string): Promise<CacheCleanResult>;

  getNetworkSnapshot(): Promise<NetworkSnapshot>;

  getBatteryInfo(): Promise<BatteryInfo | null>;

  getSensors(): Promise<SensorReading>;
  getAuthorizedSensors(): Promise<SensorReading>;

  showMainWindow(): Promise<void>;
  hideMainWindow(): Promise<void>;
  quit(): Promise<void>;

  openInFinder(path: string): Promise<void>;
  getPlatform(): Promise<{ platform: string; arch: string; release: string; hostname: string }>;
}

declare global {
  interface Window {
    api: OsxStatsApi;
  }
}
