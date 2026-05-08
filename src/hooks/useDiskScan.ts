import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiskScanProgress } from '../../electron/shared/types';

export interface DiskScanState {
  current: DiskScanProgress | null;
  isScanning: boolean;
  start: (path: string) => Promise<void>;
  cancel: () => Promise<void>;
}

export function useDiskScan(): DiskScanState {
  const [current, setCurrent] = useState<DiskScanProgress | null>(null);
  const activeScanIdRef = useRef<string | null>(null);

  useEffect(() => {
    const off = window.api.onDiskScanUpdate((progress) => {
      if (activeScanIdRef.current && progress.scanId !== activeScanIdRef.current) return;
      setCurrent(progress);
      if (progress.status !== 'running') {
        activeScanIdRef.current = null;
      }
    });
    return off;
  }, []);

  const start = useCallback(async (path: string) => {
    setCurrent({
      scanId: 'pending',
      path,
      status: 'running',
      entries: [],
      totalBytes: 0,
      errorCount: 0,
      message: 'Starting scan...',
    });
    const { scanId } = await window.api.startDiskScan(path);
    activeScanIdRef.current = scanId;
  }, []);

  const cancel = useCallback(async () => {
    const id = activeScanIdRef.current;
    if (!id) return;
    await window.api.cancelDiskScan(id);
    activeScanIdRef.current = null;
  }, []);

  return {
    current,
    isScanning: current?.status === 'running',
    start,
    cancel,
  };
}
