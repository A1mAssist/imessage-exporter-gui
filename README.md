# iMessage Exporter GUI

Desktop GUI for [`imessage-exporter`](https://github.com/ReagentX/imessage-exporter), built with Tauri v2, React, and TypeScript.

The v1 product is a guided exporter for local iOS backups: select a backup, run diagnostics, configure export options, stream logs, cancel long jobs, and open the output directory.

## Current Status

Implemented:

- Tauri v2 desktop app with release packaging for Windows, macOS, and Linux through GitHub Actions.
- React Chinese wizard UI for source selection, diagnostics, export options, and results.
- Browser mock mode for reviewing React interactions without Tauri.
- Rust backend commands for environment checks, iOS backup scanning, diagnostics/export jobs, cancellation, command previews, and native path opening.
- Startup readiness checks for the sidecar, selected backup, encrypted-backup password, and optional converters.
- Source-step blocking for incomplete backups that are missing `Manifest.db` or `Info.plist`.
- Wizard step gating with accessible disabled states, diagnostics-success gating for continue, and a resilient empty state for the results page before any export has started.
- Diagnostics cards parse scoped log lines for database, attachments, contacts, and converters so converter warnings do not contaminate healthy backup checks; message and attachment counts are surfaced when present.
- Export-step blocking when the sidecar is unavailable, with the same in-app remediation path shown in the environment panel.
- In-app remediation commands for missing sidecar and optional attachment converters.
- Sidecar version lock for `imessage-exporter` `4.1.0`.
- Password redaction in command previews and logs.
- Output directory inspection with warnings and confirmation before writing into non-empty or likely previous-export folders.
- One-click timestamped archive directory generation, for example `Messages Export 2026-06-12 0130`, so new exports do not mix into older result folders.
- Export option presets for quick HTML archiving, lightweight TXT output, and print-ready HTML with no-lazy enabled.
- Calendar-aware date validation on both the React and Rust command paths.
- HTML-only print-friendly mode: TXT exports do not expose or pass the `-l` no-lazy flag, and the results page opens the first exported HTML or TXT file according to the selected format.
- Export results include a compact summary panel with status, format, attachment strategy, output directory, and the latest meaningful completion detail.
- Export review panel that summarizes source, destination, format, attachment strategy, date range, conversation filter, display-name mode, and risk notes before running.
- Failure notices classify common recovery paths such as wrong backup password, incomplete backup, output permission issues, missing sidecar, and missing converters.
- Log search plus stdout/stderr/error filters; copying logs still uses the full redacted log stream.
- Diagnostic reports can be copied or downloaded as `.txt` and include environment, backup state, diagnostic summary, redacted command, and redacted logs.
- Backup, output, and result paths have copy actions and full-path tooltips for long paths.
- First-use empty state gives concrete Apple Devices and iTunes backup locations when no local backup is auto-discovered.
- Local persistence for non-sensitive wizard settings such as paths and export options; encrypted-backup passwords are explicitly excluded, can be cleared manually, and can be auto-cleared when a job ends.
- Converter detection for `ffmpeg` and ImageMagick.
- In-app links to bundled GPL license text, third-party notices, and sidecar version notes.
- Chrome-verified React mock flow with responsive layout checks and generated screenshots in `preview/`.
- Result-opening actions report failures through the main notice area instead of failing silently.
- Tauri JS/Rust package versions pinned and checked by `npm run check:static`.

Still required on a build machine:

- Install Node.js/npm and Rust/Cargo.
- Install the native toolchain for the target OS.
- Build the pinned `imessage-exporter` sidecar for the target OS.
- Run full `npm install`, tests, Tauri dev, and Tauri bundle.

Verified in this workspace:

- GitHub Actions CI passes on Windows: static checks, dependency audit, frontend tests, production build, mock UI smoke, Rust format, sidecar build, Rust tests, and Tauri app build.
- `npm run check:static` passes locally in this workspace.
- `npm run smoke:mock-ui` walks the production-built React wizard and verifies compact responsive layout, step navigation gating, password redaction and clearing, scoped diagnostic details, incomplete-backup blocking, saved manual backup revalidation, generated archive directories, export presets, failure recovery hints, log search/filtering, diagnostic report redaction, path copy actions, first-use empty state guidance, format-specific controls, result summaries, result-file actions for HTML/TXT, missing-sidecar export blocking, cancellation, and successful mock diagnostics/export.
- Native packaging is delegated to GitHub Actions when the local machine does not have the platform toolchain or sidecar binary.

## Preview UI

Open the static preview directly in Chrome:

```powershell
start chrome (Resolve-Path .\preview\index.html)
```

Latest generated screenshot:

![Desktop preview](./preview/preview-desktop.png)

This preview is for visual review only. The real app runs through Tauri.

Regenerate preview screenshots with Chrome or Edge:

```powershell
.\scripts\render-preview.ps1
```

## Prerequisites

- Node.js 20+ with npm
- Rust stable with Cargo
- Native desktop build dependencies for the target OS
- Optional: `ffmpeg` and ImageMagick `magick` on `PATH` for `basic`/`full` attachment conversion

Windows local native builds need Visual Studio Build Tools 2022 with the Desktop development with C++ workload, Windows SDK libraries such as `kernel32.lib`, and Microsoft WebView2 Runtime.

Linux local native builds need the WebKitGTK and AppIndicator development packages used by Tauri. The release workflow installs these on Ubuntu.

macOS local native builds need Xcode command line tools.

Check the local Windows development machine:

```powershell
.\scripts\doctor.ps1
```

Optional Windows dry-run setup helper:

```powershell
.\scripts\setup-windows.ps1
```

To install missing Node.js LTS and Rustup on Windows with `winget`, run:

```powershell
.\scripts\setup-windows.ps1 -Install
```

The same setup helper also installs Visual Studio Build Tools 2022 with the C++ workload and WebView2 Runtime when they are missing. To include optional attachment converters too:

```powershell
.\scripts\setup-windows.ps1 -Install -InstallOptionalTools
```

After installing Windows Build Tools, restart PowerShell so `link.exe` and Windows SDK library paths are visible.

## Development

This repository keeps Windows as the primary local development baseline because local iOS backups and the current helper scripts are most complete there. Cross-platform release builds are handled by GitHub Actions.

Install dependencies:

```powershell
npm install
```

Run static checks and tests:

```powershell
npm run verify
```

For restricted or offline environments, run the same local checks without the network audit:

```powershell
npm run verify:offline
```

Or run individual checks:

```powershell
npm run check:static
npm test
npm audit
npm run smoke:mock-ui
```

If PowerShell blocks `npm.ps1`, call `npm.cmd` explicitly:

```powershell
npm.cmd run check:static
npm.cmd test
```

Run the desktop app:

```powershell
npm run tauri dev
```

Run the React app in browser mock mode:

```powershell
npm run dev:mock
```

Mock mode uses simulated backups, diagnostics, export logs, cancellation, failure scenarios, empty backup discovery, and open-file actions. It is useful for UI review before the sidecar and Tauri runtime are ready. Add query parameters such as `&fail=password` or `&emptyBackups=1` to exercise recovery and first-use states.

Serve the latest production build in mock mode without Vite's dev optimizer:

```powershell
npm run build
npm run serve:mock
```

Then open <http://127.0.0.1:4173/?mock=1>.

The smoke test launches Chrome or Edge headlessly, walks the full wizard, checks password redaction, checks for broken Unicode, verifies no horizontal overflow at a compact viewport, and writes:

- `preview/react-mock-source.png`
- `preview/react-mock-source-compact.png`
- `preview/react-mock-diagnostics.png`
- `preview/react-mock-options.png`
- `preview/react-mock-options-compact.png`
- `preview/react-mock-cancelled.png`
- `preview/react-mock-results.png`

## Sidecar

The GUI bundles `imessage-exporter` as a Tauri sidecar. Build it after Rust is installed:

```powershell
.\scripts\build-sidecar.ps1
```

Expected output examples:

```txt
src-tauri\binaries\imessage-exporter-x86_64-pc-windows-msvc.exe
src-tauri/binaries/imessage-exporter-aarch64-apple-darwin
src-tauri/binaries/imessage-exporter-x86_64-unknown-linux-gnu
```

The sidecar is pinned to `4.1.0`. See [SIDE_CAR.md](./SIDE_CAR.md).

At source time the sidecar file includes the Rust target triple. During Tauri build it is copied into runtime resources as `imessage-exporter.exe` on Windows and `imessage-exporter` on macOS/Linux; the backend checks both names so local development and installed bundles use the same code path.

## Packaging

Recommended path: build native release artifacts in GitHub Actions so local machines do not need every platform toolchain or sidecar binary.

Manual Actions build:

1. Open the GitHub repository's **Actions** tab.
2. Select **Release Installers**.
3. Click **Run workflow** on the target branch.
4. Download the platform artifacts after the workflow finishes:
   - `imessage-exporter-gui-windows`
   - `imessage-exporter-gui-macos`
   - `imessage-exporter-gui-linux`

Tagged release build:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The tag workflow uploads platform artifacts and attaches them plus `SHA256SUMS.txt` files to the GitHub Release.

Local native packaging is still supported after dependencies and sidecar are ready:

```powershell
npm run package:release
```

Artifacts are copied to:

```txt
dist-release\
```

The legacy Windows-only packaging shortcut remains available:

```powershell
npm run package:windows
```

The release workflow `.github/workflows/release.yml` builds on Windows, macOS, and Linux. It builds the pinned sidecar for each runner, runs native checks, bundles Tauri, uploads platform artifacts, and when pushed from a `v*` tag attaches the artifacts to a GitHub Release.

## Scope Notes

- v1 only exposes iOS backup export paths. macOS `chat.db`, separate attachment roots, and jailbroken `sms.db` are left for later.
- v1 does not implement native PDF export. Use HTML export with print-friendly mode, then print to PDF from a browser.
- The export directory must be separate from the selected iOS backup directory; the UI and backend both reject exporting into the backup itself.
- Encrypted iOS backup passwords are kept only in app state, are never written to local settings storage, can be cleared manually or automatically when a job ends, and command previews are redacted. The upstream CLI's `--cleartext-password` can still be visible in the OS process table while the job runs.
- `ffmpeg` and ImageMagick are detected but not bundled.

## License

GPL-3.0-only. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
