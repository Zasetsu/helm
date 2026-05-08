import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { promises as fsp } from 'node:fs';
import type { DiskEntry, DiskScanProgress } from '../shared/types.js';

type Emit = (progress: DiskScanProgress) => void;

interface ActiveScan {
  scanId: string;
  path: string;
  proc: ChildProcessWithoutNullStreams;
  entries: Map<string, DiskEntry>;
  totalBytes: number;
  errorCount: number;
  cancelled: boolean;
}

const activeScans = new Map<string, ActiveScan>();

const KB_TO_BYTES = 1024;

function parseDuLine(line: string): { sizeBytes: number; path: string } | null {
  const tabIndex = line.indexOf('\t');
  if (tabIndex < 1) return null;
  const sizeKb = Number.parseInt(line.slice(0, tabIndex), 10);
  if (!Number.isFinite(sizeKb)) return null;
  const path = line.slice(tabIndex + 1).trimEnd();
  if (!path) return null;
  return { sizeBytes: sizeKb * KB_TO_BYTES, path };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fsp.lstat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function startDiskScan(targetPath: string, emit: Emit): Promise<string> {
  const scanId = randomUUID();

  let resolved = targetPath;
  try {
    const real = await fsp.realpath(targetPath);
    resolved = real;
  } catch {
    emit({
      scanId,
      path: targetPath,
      status: 'error',
      entries: [],
      totalBytes: 0,
      errorCount: 0,
      message: `Cannot access path: ${targetPath}`,
    });
    return scanId;
  }

  const proc = spawn('du', ['-kx', '-d', '1', resolved], {
    env: { ...process.env, LANG: 'C' },
  });

  const scan: ActiveScan = {
    scanId,
    path: resolved,
    proc,
    entries: new Map(),
    totalBytes: 0,
    errorCount: 0,
    cancelled: false,
  };
  activeScans.set(scanId, scan);

  emit({
    scanId,
    path: resolved,
    status: 'running',
    entries: [],
    totalBytes: 0,
    errorCount: 0,
    message: `Scanning ${resolved}...`,
  });

  let stdoutBuffer = '';
  let lastEmitMs = 0;
  const EMIT_THROTTLE_MS = 250;

  const flush = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastEmitMs < EMIT_THROTTLE_MS) return;
    lastEmitMs = now;
    const entries = Array.from(scan.entries.values()).sort((a, b) => b.sizeBytes - a.sizeBytes);
    emit({
      scanId,
      path: resolved,
      status: 'running',
      entries,
      totalBytes: scan.totalBytes,
      errorCount: scan.errorCount,
    });
  };

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', async (chunk: string) => {
    stdoutBuffer += chunk;
    const newlineIdx = stdoutBuffer.lastIndexOf('\n');
    if (newlineIdx < 0) return;
    const completeLines = stdoutBuffer.slice(0, newlineIdx).split('\n');
    stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);

    for (const line of completeLines) {
      const parsed = parseDuLine(line);
      if (!parsed) continue;

      if (parsed.path === resolved) {
        scan.totalBytes = parsed.sizeBytes;
        continue;
      }

      const dir = await isDirectory(parsed.path);
      const entry: DiskEntry = {
        name: basename(parsed.path) || parsed.path,
        path: parsed.path,
        sizeBytes: parsed.sizeBytes,
        isDirectory: dir,
        hasErrors: false,
      };
      scan.entries.set(parsed.path, entry);
    }

    flush(false);
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk: string) => {
    const lines = chunk.split('\n').filter(Boolean);
    scan.errorCount += lines.length;
  });

  proc.on('close', (code) => {
    activeScans.delete(scanId);
    const entries = Array.from(scan.entries.values()).sort((a, b) => b.sizeBytes - a.sizeBytes);
    if (scan.cancelled) {
      emit({
        scanId,
        path: resolved,
        status: 'cancelled',
        entries,
        totalBytes: scan.totalBytes,
        errorCount: scan.errorCount,
        message: 'Scan cancelled',
      });
      return;
    }
    emit({
      scanId,
      path: resolved,
      status: code === 0 || scan.entries.size > 0 ? 'done' : 'error',
      entries,
      totalBytes: scan.totalBytes,
      errorCount: scan.errorCount,
      message:
        scan.errorCount > 0
          ? `Done. ${scan.errorCount} permission errors (skipped).`
          : 'Done.',
    });
  });

  proc.on('error', (err) => {
    activeScans.delete(scanId);
    emit({
      scanId,
      path: resolved,
      status: 'error',
      entries: Array.from(scan.entries.values()),
      totalBytes: scan.totalBytes,
      errorCount: scan.errorCount,
      message: err.message,
    });
  });

  return scanId;
}

export function cancelDiskScan(scanId: string): void {
  const scan = activeScans.get(scanId);
  if (!scan) return;
  scan.cancelled = true;
  scan.proc.kill('SIGTERM');
}

export function cancelAllScans(): void {
  for (const scan of activeScans.values()) {
    scan.cancelled = true;
    scan.proc.kill('SIGTERM');
  }
  activeScans.clear();
}
