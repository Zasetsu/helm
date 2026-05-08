import { contextBridge, ipcRenderer } from 'electron';
import type {
  BatteryInfo,
  CacheCleanResult,
  CacheScanResult,
  CpuInfo,
  DiskMount,
  DiskScanProgress,
  NetworkSnapshot,
  HelmApi,
  ProcessDetail,
  SensorReading,
  SystemSnapshot,
} from './shared/types.js';

const DISK_SCAN_UPDATE = 'disk:scanUpdate';

const api: HelmApi = {
  getCpuInfo: () => ipcRenderer.invoke('system:getCpuInfo') as Promise<CpuInfo>,
  getSnapshot: () => ipcRenderer.invoke('system:getSnapshot') as Promise<SystemSnapshot>,
  killProcess: (pid, signal) =>
    ipcRenderer.invoke('system:killProcess', pid, signal) as Promise<{ ok: boolean; error?: string }>,
  getProcessDetail: (pid) =>
    ipcRenderer.invoke('system:getProcessDetail', pid) as Promise<ProcessDetail | null>,
  getProcessIcons: (commands) =>
    ipcRenderer.invoke('system:getProcessIcons', commands) as Promise<Record<string, string | null>>,
  getDiskMounts: () => ipcRenderer.invoke('system:getDiskMounts') as Promise<DiskMount[]>,

  startDiskScan: (path) => ipcRenderer.invoke('disk:startScan', path) as Promise<{ scanId: string }>,
  cancelDiskScan: (scanId) => ipcRenderer.invoke('disk:cancelScan', scanId) as Promise<void>,
  onDiskScanUpdate: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: DiskScanProgress) => cb(progress);
    ipcRenderer.on(DISK_SCAN_UPDATE, listener);
    return () => ipcRenderer.removeListener(DISK_SCAN_UPDATE, listener);
  },

  scanCaches: () => ipcRenderer.invoke('cache:scan') as Promise<CacheScanResult>,
  cleanCache: (id) => ipcRenderer.invoke('cache:clean', id) as Promise<CacheCleanResult>,

  getNetworkSnapshot: () => ipcRenderer.invoke('network:getSnapshot') as Promise<NetworkSnapshot>,

  getBatteryInfo: () => ipcRenderer.invoke('battery:getInfo') as Promise<BatteryInfo | null>,

  getSensors: () => ipcRenderer.invoke('sensors:get') as Promise<SensorReading>,
  getAuthorizedSensors: () =>
    ipcRenderer.invoke('sensors:getAuthorized') as Promise<SensorReading>,

  showMainWindow: () => ipcRenderer.invoke('window:showMain') as Promise<void>,
  hideMainWindow: () => ipcRenderer.invoke('window:hideMain') as Promise<void>,
  quit: () => ipcRenderer.invoke('app:quit') as Promise<void>,

  openInFinder: (path) => ipcRenderer.invoke('shell:openInFinder', path) as Promise<void>,
  getPlatform: () => ipcRenderer.invoke('system:getPlatform') as Promise<{
    platform: string;
    arch: string;
    release: string;
    hostname: string;
  }>,
};

contextBridge.exposeInMainWorld('api', api);
