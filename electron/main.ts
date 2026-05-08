import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getCpuInfo,
  getDiskMounts,
  getPlatformInfo,
  getProcessDetail,
  getProcessIcons,
  getSystemSnapshot,
  killProcess,
} from './api/system.js';
import { cancelAllScans, cancelDiskScan, startDiskScan } from './api/disk.js';
import { cleanCache, scanCaches } from './api/cache.js';
import { getNetworkSnapshot } from './api/network.js';
import { getBatteryInfo } from './api/battery.js';
import { getAuthorizedSensors, getSensors } from './api/sensors.js';
import type { DiskScanProgress, SystemSnapshot } from './shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayUpdateInterval: NodeJS.Timeout | null = null;

const PRELOAD_PATH = join(__dirname, '../preload/index.cjs');

function rendererUrl(hash = ''): string {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${hash ? `#${hash}` : ''}`;
  }
  const base = `file://${join(__dirname, '../renderer/index.html')}`;
  return hash ? `${base}#${hash}` : base;
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'OsxStats',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0e11',
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) console.log(`[renderer:${level}] ${sourceId}:${line} ${message}`);
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.log(`[renderer:fail] ${code} ${desc} ${url}`);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.log(`[renderer:gone] ${JSON.stringify(details)}`);
    });
  }
  win.loadURL(rendererUrl());
  return win;
}

function createPopoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 460,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    vibrancy: 'menu',
    visualEffectState: 'active',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadURL(rendererUrl('popover'));

  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) {
      win.hide();
    }
  });

  return win;
}

function positionPopoverNearTray(win: BrowserWindow, trayInstance: Tray): void {
  const trayBounds = trayInstance.getBounds();
  const winBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + 4);

  const workArea = display.workArea;
  x = Math.max(workArea.x + 8, Math.min(workArea.x + workArea.width - winBounds.width - 8, x));
  y = Math.max(workArea.y + 8, y);

  win.setPosition(x, y, false);
}

function togglePopover(): void {
  if (!popoverWindow) {
    popoverWindow = createPopoverWindow();
  }
  if (popoverWindow.isVisible()) {
    popoverWindow.hide();
    return;
  }
  if (tray) positionPopoverNearTray(popoverWindow, tray);
  popoverWindow.show();
  popoverWindow.focus();
}

function showMainWindow(): void {
  if (!mainWindow) {
    mainWindow = createMainWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  if (popoverWindow?.isVisible()) popoverWindow.hide();
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Quit OsxStats',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ]);
}

function formatTrayTitle(snapshot: SystemSnapshot | null): string {
  if (!snapshot) return ' …';
  const cpu = Math.round(snapshot.cpu.loadPercent);
  const memUsedGb = snapshot.memory.usedBytes / 1024 ** 3;
  return ` ${cpu}% · ${memUsedGb.toFixed(1)}G`;
}

async function updateTrayTitle(): Promise<void> {
  if (!tray) return;
  try {
    const snapshot = await getSystemSnapshot();
    tray.setTitle(formatTrayTitle(snapshot));
  } catch {
    tray.setTitle(' err');
  }
}

function createTray(): void {
  const iconPath = join(__dirname, '../../resources/trayTemplate.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  } else {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setTitle(' …');
  tray.setToolTip('OsxStats');

  tray.on('click', (event) => {
    if (event.altKey || event.ctrlKey) {
      tray?.popUpContextMenu(buildTrayMenu());
      return;
    }
    togglePopover();
  });

  tray.on('right-click', () => tray?.popUpContextMenu(buildTrayMenu()));

  void updateTrayTitle();
  trayUpdateInterval = setInterval(updateTrayTitle, 2000);
}

function broadcastDiskScanUpdate(progress: DiskScanProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('disk:scanUpdate', progress);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('system:getCpuInfo', () => getCpuInfo());
  ipcMain.handle('system:getSnapshot', () => getSystemSnapshot());
  ipcMain.handle('system:killProcess', (_e, pid: number, signal?: 'SIGTERM' | 'SIGKILL') =>
    killProcess(pid, signal),
  );
  ipcMain.handle('system:getProcessDetail', (_e, pid: number) => getProcessDetail(pid));
  ipcMain.handle('system:getProcessIcons', (_e, commands: string[]) => getProcessIcons(commands));
  ipcMain.handle('system:getDiskMounts', () => getDiskMounts());
  ipcMain.handle('system:getPlatform', () => getPlatformInfo());

  ipcMain.handle('disk:startScan', async (_e, targetPath: string) => {
    const scanId = await startDiskScan(targetPath, broadcastDiskScanUpdate);
    return { scanId };
  });
  ipcMain.handle('disk:cancelScan', (_e, scanId: string) => {
    cancelDiskScan(scanId);
  });

  ipcMain.handle('cache:scan', () => scanCaches());
  ipcMain.handle('cache:clean', (_e, id: string) => cleanCache(id));

  ipcMain.handle('network:getSnapshot', () => getNetworkSnapshot());

  ipcMain.handle('battery:getInfo', () => getBatteryInfo());

  ipcMain.handle('sensors:get', () => getSensors());
  ipcMain.handle('sensors:getAuthorized', () => getAuthorizedSensors());

  ipcMain.handle('window:showMain', () => showMainWindow());
  ipcMain.handle('window:hideMain', () => mainWindow?.hide());
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('shell:openInFinder', (_e, p: string) => shell.showItemInFolder(p));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createTray();
  mainWindow = createMainWindow();
});

app.on('before-quit', () => {
  if (trayUpdateInterval) clearInterval(trayUpdateInterval);
  cancelAllScans();
});

app.on('activate', () => {
  showMainWindow();
});
