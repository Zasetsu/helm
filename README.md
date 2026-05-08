# OsxStats

A native-feeling macOS system & disk analyzer. Live CPU / memory / per-process stats, network throughput, battery health, sensors, full-system disk drill-down, and a one-click cache cleaner — all in one menubar-resident app.

Built with Electron + Vite + React + TypeScript. Free, open source, no telemetry.

> Status: early beta. Apple Silicon native, x64 also bundled (universal binary).

## Features

- **Overview** — live CPU load with sparkline + per-core list, real macOS memory accounting (`vm_stat`-based: wired + active + compressed = used), top processes by CPU and memory, mounted volumes.
- **Processes** — sortable / filterable list of every process with native app icons. Single click selects, double click opens an inspector drawer with parent tree, open files (`lsof`), live network connections, environment variables, and signal controls (TERM / KILL).
- **Network** — download/upload throughput sparklines, per-interface stats, top bandwidth processes (cumulative since boot via `nettop`), filterable active connection list.
- **Battery** — charge %, time-to-full / time-to-empty, cycle count with health classification, voltage / current / temperature, adapter wattage. All sourced from `ioreg AppleSmartBattery`.
- **Sensors** — sudoless thermal pressure (`pmset -g therm`), top processes by Energy Impact (`top -stats power`), battery temperature. Optional admin-authorized read of CPU/GPU die temperatures, fan RPM, and per-subsystem power via `powermetrics` (Touch ID supported).
- **Disk** — incremental directory scanning with streaming `du -kx -d 1`. Drill down by clicking folders, breadcrumb navigation, "Reveal in Finder" on double-click. Permission-denied paths skipped automatically.
- **Cache Cleaner** — 22 known cache locations (Xcode DerivedData, npm/pnpm/yarn/bun, Homebrew, browser caches, Spotify, iOS backups, Trash, Downloads…). Each shows size + safety classification (safe / careful / caution). Items move to Trash (recoverable) except the Trash itself, which is permanently deleted with confirmation.
- **Menubar tray** — live `CPU% · MEMG` in the menubar title. Click for compact popover with quick stats and top processes. "Dashboard" button opens the full window.

## Install

### From the latest release

1. Download `OsxStats-<version>-universal.dmg` from the [Releases](../../releases) page.
2. Open the DMG and drag **OsxStats.app** to **Applications**.
3. **First launch:** right-click the app → **Open** → confirm. macOS will warn that the app is from an "unidentified developer"; this is expected for unsigned indie open source apps.

   Alternatively, from Terminal:
   ```bash
   xattr -d com.apple.quarantine /Applications/OsxStats.app
   ```

After the first launch the app will open normally from Spotlight, Launchpad, or the Dock.

### Why the warning?

OsxStats is **ad-hoc signed** — built without an Apple Developer Program subscription ($99/year). The app is not malicious, but macOS Gatekeeper flags any app that wasn't notarized by Apple. Code is fully open in this repository if you want to audit or build it yourself.

## Build from source

Requires Node.js 22+ and Xcode Command Line Tools.

```bash
git clone https://github.com/<your-username>/OsxStats.git
cd OsxStats
npm install
npm run dev          # hot-reload development
npm run build:mac    # produces dist/OsxStats-*.dmg
```

The icon is regenerated from `build/icon.svg`:

```bash
brew install librsvg          # one-time
npm run build:icon
```

## Architecture

```
electron/
  main.ts             Electron main process: tray, windows, IPC handlers
  preload.ts          Context-bridged API exposed to renderer
  shared/types.ts     Type contracts shared by main and renderer
  api/
    system.ts         CPU, memory (vm_stat), processes, killing, app icons
    disk.ts           Streaming `du` scanner with throttled IPC progress
    cache.ts          Curated cache definitions + Trash-aware cleanup
    network.ts        nettop / lsof / systeminformation network stats
    battery.ts        ioreg AppleSmartBattery parser
    sensors.ts        pmset / top -stats power / authorized powermetrics

src/
  App.tsx             Tab shell (Overview / Processes / Network / Battery / Sensors / Disk / Cache)
  components/         Per-tab UI + ProcessDetailDrawer + Sparkline + Popover
  hooks/              useSnapshot, useDiskScan, useNetwork, useProcessIcons
  lib/format.ts       Bytes / percent / uptime formatters
```

## Data sources

| What | How |
|---|---|
| CPU / memory / processes | `systeminformation` + native `vm_stat`, `sysctl hw.memsize`, `sysctl hw.pagesize` |
| Process detail | `ps`, `lsof`, `lsof -i`, `ps eww` |
| App icons | `electron.app.getFileIcon(.app bundle)` |
| Disk usage | `du -kx -d 1` streamed line-by-line |
| Network | `nettop -P -L 1 -x -t external -J bytes_in,bytes_out`, `lsof -i -nP -F` |
| Battery | `ioreg -l -w0 -r -c AppleSmartBattery` |
| Thermal | `pmset -g therm`, `top -stats power` |
| Authorized sensors | `powermetrics --samplers thermal,cpu_power,gpu_power` via `osascript ... with administrator privileges` |

## Privacy

- No telemetry, analytics, or network calls to any server we control.
- The only network activity is what your existing system tools (`lsof`, `nettop`, `du`) initiate, which OsxStats reads.
- The `Sensors` panel's optional `powermetrics` call is a one-shot read; admin auth is not stored.

## License

[MIT](LICENSE) © 2026 zasetsu
