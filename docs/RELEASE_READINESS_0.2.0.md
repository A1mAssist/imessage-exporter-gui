# iMessage Exporter GUI 0.2.0 Release Readiness

Date: 2026-06-28

## Summary

`v0.2.0` is the first release that no longer depends on an external `imessage-exporter.exe`.
The GUI now vendors the upstream Rust source under `src-tauri/vendor/imessage-exporter`, calls the exporter engine in-process from Tauri, and exposes JSONL as a first-class export format alongside HTML and TXT.

## Release Scope

- Built-in `imessage-exporter` Rust engine based on `4.1.0`.
- JSONL export format in frontend options, backend command mapping, result opening, and mock coverage.
- External exporter path, picker, downloader, sidecar process spawning, and real CLI smoke script removed.
- CI now gates on the built-in Rust command matrix, Rust tests, Rust check, frontend build, and mock UI smoke.
- Environment and support snapshots report the built-in engine version and compatibility status.
- Encrypted backup passwords are passed in-process to the built-in engine for the current task only; they are not saved and are redacted from previews/logs/reports.

## Local Verification

The following checks passed on Windows after restoring this source handoff:

```powershell
npm run check:static
npm test
npm run build
npm run smoke:mock-ui
Push-Location src-tauri
cargo fmt --check
cargo test
cargo check
Pop-Location
npm run package:windows
```

`npm run package:windows` additionally performed:

- static sanity checks
- TypeScript/Vite production build
- Vitest unit tests
- `npm audit --audit-level=moderate`
- mock UI browser smoke
- Rust format, metadata, tests, and check
- unsigned Tauri Windows NSIS/MSI build
- NSIS installer smoke with silent install
- installed executable launch smoke

Local unsigned artifacts were produced under `dist-installers`:

- `iMessage Exporter GUI_0.2.0_x64-setup.exe`
- `iMessage Exporter GUI_0.2.0_x64_zh-CN.msi`
- `SHA256SUMS.txt`

SHA256:

```text
bf89f55eec965b46cf025814e604b8bdb851c0321bb39cecaec5ecf42b1c2e1e  iMessage Exporter GUI_0.2.0_x64_zh-CN.msi
6b13c10ead98961f647068c14a1f8b59bda0016b999429712f745d46a20e42a7  iMessage Exporter GUI_0.2.0_x64-setup.exe
```

Because the local build was unsigned, `latest.json` was intentionally skipped locally. The GitHub release workflow should produce signed updater artifacts when signing secrets are available.

Handoff restore note: the source-only package excluded `node_modules`, `src-tauri/target`, `dist`, `dist-installers`, and `preview/`. Git history was restored from `origin/codex/ci-exporter-compat-smoke`; the tracked preview files were restored from Git, and mock smoke regenerated the `preview/react-mock-*.png` screenshots.

## CI Evidence

Branch: `codex/ci-exporter-compat-smoke`

Merge commit: `34e48681933a9c62b5fca4b1e0690be08a32a01f`

GitHub Actions run:

- Workflow: `CI`
- Job: `windows`
- Status: success
- Run ID: `28316080539`
- URL: <https://github.com/A1mAssist/imessage-exporter-gui/actions/runs/28316080539>

Release workflow:

- Workflow: `Release Installers`
- Status: success
- Run ID: `28316285775`
- URL: <https://github.com/A1mAssist/imessage-exporter-gui/actions/runs/28316285775>

## Published Release

- Tag: `v0.2.0`
- URL: <https://github.com/A1mAssist/imessage-exporter-gui/releases/tag/v0.2.0>
- Published: `2026-06-28T08:31:11Z`
- Draft: no
- Prerelease: no

Published assets:

| Asset | SHA256 |
| --- | --- |
| `iMessage.Exporter.GUI_0.2.0_x64-setup.exe` | `3088cc3278de432fbc18c3ea6fa6b95d436d5ee512e99a0f8280e844e39d073d` |
| `iMessage.Exporter.GUI_0.2.0_x64-setup.exe.sig` | `b0b3829288f334e12d71562ef17d1067f23b2f57acc71e8655b4ba9470610d48` |
| `iMessage.Exporter.GUI_0.2.0_x64_zh-CN.msi` | `a9c0a987a8ead83164e2b69a5276b2bc1b2cff3d137f3bccaeb4be8ff453ab86` |
| `iMessage.Exporter.GUI_0.2.0_x64_zh-CN.msi.sig` | `44a84d1dfb84ea9ef63e93d7f2355558627d63427ba66229ae4a6c7ff39dcd8b` |
| `iMessage.Exporter.GUI_0.2.0_aarch64.dmg` | `88c0ac46a08011e2e40054abc84fb8c336ccfdbfd2f652d2a79b7254a8ac1004` |
| `latest.json` | `716a6312b19c5406dad22da6e4988412ad4068579a015fac07bf811088b00b5c` |
| `SHA256SUMS-windows.txt` | `000ffbd9702c5d11b0f88a56264eb7207238ff56af6dfbe54bcaec361477d2a3` |
| `SHA256SUMS-macos.txt` | `001293a3f03d524c671826e7b9857848d8532929156a1441da544fdf077da25e` |

Post-release verification downloaded the assets to `D:\Tools\Temp\imessage-exporter-gui-release-v0.2.0`.
The GitHub asset digests and downloaded SHA256 values matched. The downloaded NSIS installer passed `scripts\smoke-installed-windows.ps1` with a temporary install directory under `D:\Tools\Temp`.

Updater manifest note: the published `latest.json` contains Windows updater platforms (`windows-x86_64-msi`, `windows-x86_64-nsis`, and `windows-x86_64`) only. The macOS DMG is present as an installer artifact, but macOS updater metadata is not published in this release.

Known release issue: `latest.json` in `v0.2.0` points at updater artifact URLs with spaces in the product name, while the GitHub Release assets were uploaded with dot-normalized names. Those URLs return 404. The packaging scripts should normalize collected artifact filenames before checksum and manifest generation for the next release.

## Release Checklist

1. Done: merge the release branch into `main`.
2. Done: confirm `main` CI is green.
3. Done: create and push tag `v0.2.0` from the merge commit.
4. Done: confirm `Release Installers` completes for Windows and macOS.
5. Done: confirm release assets include Windows NSIS, Windows MSI, macOS DMG, signatures, checksums, and `latest.json`.
6. Done: confirm GitHub Release `v0.2.0` is published as a non-draft, non-prerelease release.
7. Done: download the Windows NSIS asset from GitHub and run `scripts/smoke-installed-windows.ps1` against it.

## Known Follow-Ups

- Cancellation is now cooperative across the GUI job layer, exporter cache build, and per-message export loops. Long-running attachment conversion and external helper work are still not forcibly interrupted mid-call.
- macOS installer smoke still relies on GitHub Actions output because this Windows machine cannot install the macOS DMG.
- Future releases should publish updater manifest URLs that match the uploaded GitHub asset names.
- Future releases should add macOS updater metadata when a signed `.app.tar.gz` or equivalent updater asset is available.
- Vendored upstream source provenance is now tracked in `src-tauri/vendor/imessage-exporter/UPSTREAM.md`.
