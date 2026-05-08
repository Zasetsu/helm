import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fsp } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { shell } from 'electron';
import type {
  CacheCleanResult,
  CacheLocation,
  CacheSafety,
  CacheScanResult,
} from '../shared/types.js';

const execAsync = promisify(exec);

interface CacheDef {
  id: string;
  label: string;
  description: string;
  paths: string[];
  safety: CacheSafety;
  hint?: string;
  cleanContents?: boolean;
}

function home(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

const DEFINITIONS: CacheDef[] = [
  {
    id: 'xcode-derived-data',
    label: 'Xcode DerivedData',
    description: 'Build intermediates and indexing data. Regenerates on next build.',
    paths: ['~/Library/Developer/Xcode/DerivedData'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'xcode-archives',
    label: 'Xcode Archives',
    description: 'Old app archives. Only delete if you no longer need to symbolicate older builds.',
    paths: ['~/Library/Developer/Xcode/Archives'],
    safety: 'caution',
    cleanContents: true,
  },
  {
    id: 'xcode-ios-device-support',
    label: 'Xcode iOS DeviceSupport',
    description: 'Symbol files for iOS versions. Re-downloaded when needed.',
    paths: [
      '~/Library/Developer/Xcode/iOS DeviceSupport',
      '~/Library/Developer/Xcode/watchOS DeviceSupport',
      '~/Library/Developer/Xcode/tvOS DeviceSupport',
    ],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'core-simulator-caches',
    label: 'iOS Simulator caches',
    description: 'CoreSimulator caches. Devices not affected.',
    paths: ['~/Library/Developer/CoreSimulator/Caches'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'npm-cache',
    label: 'npm cache',
    description: 'Cached packages. Re-downloaded on next install.',
    paths: ['~/.npm/_cacache'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'pnpm-store',
    label: 'pnpm store',
    description: 'Content-addressable store. Re-fetched on next install but breaks current installs.',
    paths: [
      '~/Library/pnpm/store',
      '~/.local/share/pnpm/store',
      '~/.pnpm-store',
    ],
    safety: 'careful',
    hint: 'Run `pnpm store prune` for safer cleanup.',
    cleanContents: true,
  },
  {
    id: 'yarn-cache',
    label: 'Yarn cache',
    description: 'Yarn package cache.',
    paths: ['~/.yarn/cache', '~/Library/Caches/Yarn'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'bun-cache',
    label: 'Bun cache',
    description: 'Bun install cache.',
    paths: ['~/.bun/install/cache'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'pip-cache',
    label: 'pip cache',
    description: 'Python pip wheel cache.',
    paths: ['~/Library/Caches/pip', '~/.cache/pip'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'gradle-cache',
    label: 'Gradle cache',
    description: 'Gradle dependencies and build cache.',
    paths: ['~/.gradle/caches'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'cocoapods-cache',
    label: 'CocoaPods cache',
    description: 'Pod download cache.',
    paths: ['~/Library/Caches/CocoaPods'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'homebrew-cache',
    label: 'Homebrew cache',
    description: 'Downloaded bottles and source tarballs. `brew cleanup -s` is the canonical way.',
    paths: ['~/Library/Caches/Homebrew'],
    safety: 'safe',
    hint: 'Prefer `brew cleanup -s` for full cleanup.',
    cleanContents: true,
  },
  {
    id: 'docker-overlay',
    label: 'Docker Desktop data',
    description:
      'Docker Desktop VM disk image. Cleanup via Docker app (Settings → Resources) is preferred.',
    paths: ['~/Library/Containers/com.docker.docker/Data/vms/0/data'],
    safety: 'caution',
    hint: 'Use Docker → Reset → Clean / purge data instead.',
    cleanContents: false,
  },
  {
    id: 'chrome-cache',
    label: 'Chrome cache',
    description: 'Browser disk cache (not history or passwords).',
    paths: [
      '~/Library/Caches/com.google.Chrome',
      '~/Library/Application Support/Google/Chrome/Default/Cache',
      '~/Library/Application Support/Google/Chrome/Default/Code Cache',
    ],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'safari-cache',
    label: 'Safari cache',
    description: 'Safari browser disk cache.',
    paths: ['~/Library/Caches/com.apple.Safari'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'firefox-cache',
    label: 'Firefox cache',
    description: 'Firefox browser disk cache.',
    paths: ['~/Library/Caches/Firefox'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'arc-cache',
    label: 'Arc browser cache',
    description: 'Arc disk cache.',
    paths: ['~/Library/Caches/company.thebrowser.Browser'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'spotify-cache',
    label: 'Spotify cache',
    description: 'Cached audio data. Songs re-stream after cleanup.',
    paths: [
      '~/Library/Caches/com.spotify.client',
      '~/Library/Application Support/Spotify/PersistentCache',
    ],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'slack-cache',
    label: 'Slack cache',
    description: 'Slack Electron renderer cache.',
    paths: ['~/Library/Application Support/Slack/Cache', '~/Library/Caches/com.tinyspeck.slackmacgap'],
    safety: 'safe',
    cleanContents: true,
  },
  {
    id: 'system-user-caches',
    label: '~/Library/Caches/* (other apps)',
    description: 'Generic per-app caches. Apps will rebuild as needed.',
    paths: ['~/Library/Caches'],
    safety: 'safe',
    hint: 'Includes everything in ~/Library/Caches not listed above.',
    cleanContents: true,
  },
  {
    id: 'ios-backups',
    label: 'iOS device backups',
    description:
      'Old iPhone/iPad backups. Useful only for restore — review carefully before deleting.',
    paths: ['~/Library/Application Support/MobileSync/Backup'],
    safety: 'caution',
    cleanContents: true,
  },
  {
    id: 'time-machine-snapshots',
    label: 'Local Time Machine snapshots',
    description: 'APFS local snapshots. Removed via tmutil.',
    paths: [],
    safety: 'caution',
    hint: 'Run: `tmutil listlocalsnapshots /` and `tmutil deletelocalsnapshots <date>`.',
    cleanContents: false,
  },
  {
    id: 'trash',
    label: 'Trash',
    description: 'Empty the user Trash.',
    paths: ['~/.Trash'],
    safety: 'careful',
    cleanContents: true,
  },
  {
    id: 'downloads-old',
    label: 'Downloads folder',
    description: 'Review and clean manually — may contain documents you need.',
    paths: ['~/Downloads'],
    safety: 'caution',
    hint: 'Use the Disk panel to drill in.',
    cleanContents: false,
  },
];

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function getDirSize(p: string): Promise<{ bytes: number; itemCount: number }> {
  try {
    const { stdout } = await execAsync(`du -skx "${p}" 2>/dev/null`, {
      maxBuffer: 1024 * 1024,
    });
    const tab = stdout.indexOf('\t');
    const kb = tab > 0 ? Number.parseInt(stdout.slice(0, tab), 10) : 0;
    const bytes = Number.isFinite(kb) ? kb * 1024 : 0;

    let itemCount = 0;
    try {
      const stat = await fsp.lstat(p);
      if (stat.isDirectory()) {
        const items = await fsp.readdir(p);
        itemCount = items.length;
      } else {
        itemCount = 1;
      }
    } catch {}

    return { bytes, itemCount };
  } catch {
    return { bytes: 0, itemCount: 0 };
  }
}

export async function scanCaches(): Promise<CacheScanResult> {
  const measured = await Promise.all(
    DEFINITIONS.map(async (def) => {
      const expanded = def.paths.map(home);
      const present = await Promise.all(
        expanded.map(async (p) => ({ path: p, exists: await pathExists(p) })),
      );
      const existing = present.filter((x) => x.exists).map((x) => x.path);
      if (existing.length === 0 && def.paths.length > 0) return null;

      const sizes = await Promise.all(existing.map((p) => getDirSize(p)));
      const bytes = sizes.reduce((acc, s) => acc + s.bytes, 0);
      const items = sizes.reduce((acc, s) => acc + s.itemCount, 0);

      const loc: CacheLocation = {
        id: def.id,
        label: def.label,
        description: def.description,
        paths: existing,
        totalBytes: bytes,
        itemCount: items,
        safety: def.safety,
        hint: def.hint,
      };
      return loc;
    }),
  );

  const locations = measured.filter((l): l is CacheLocation => l !== null);
  locations.sort((a, b) => b.totalBytes - a.totalBytes);
  const totalBytes = locations.reduce((acc, l) => acc + l.totalBytes, 0);
  return { locations, totalBytes, scannedAt: Date.now() };
}

export async function cleanCache(id: string): Promise<CacheCleanResult> {
  const def = DEFINITIONS.find((d) => d.id === id);
  if (!def) return { ok: false, freedBytes: 0, removedPaths: [], errors: [`Unknown id: ${id}`] };
  if (!def.cleanContents) {
    return {
      ok: false,
      freedBytes: 0,
      removedPaths: [],
      errors: ['This location must be cleaned via its app or system tool.'],
    };
  }

  const removedPaths: string[] = [];
  const errors: string[] = [];
  let freedBytes = 0;

  const isTrash = def.id === 'trash';

  for (const raw of def.paths) {
    const p = home(raw);
    if (!(await pathExists(p))) continue;
    try {
      const sizeBefore = (await getDirSize(p)).bytes;
      const stat = await fsp.lstat(p);
      if (stat.isDirectory()) {
        const items = await fsp.readdir(p);
        for (const item of items) {
          const itemPath = join(p, item);
          try {
            if (isTrash) {
              await fsp.rm(itemPath, { recursive: true, force: true });
            } else {
              await shell.trashItem(itemPath);
            }
            removedPaths.push(itemPath);
          } catch (err) {
            errors.push(`${itemPath}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else if (isTrash) {
        await fsp.rm(p, { recursive: true, force: true });
        removedPaths.push(p);
      } else {
        await shell.trashItem(p);
        removedPaths.push(p);
      }
      freedBytes += sizeBefore;
    } catch (err) {
      errors.push(`${p}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    ok: errors.length === 0,
    freedBytes,
    removedPaths,
    errors,
  };
}
