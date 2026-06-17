# iMessage Exporter GUI 0.2.0 Release Readiness

Date: 2026-06-17

## Summary

`v0.2.0` is the first release candidate that no longer depends on an external `imessage-exporter.exe`.
The GUI now vendors the upstream Rust source under `src-tauri/vendor/imessage-exporter`, calls the exporter engine in-process from Tauri, and exposes JSONL as a first-class export format alongside HTML and TXT.

## Release Scope

- Built-in `imessage-exporter` Rust engine based on `4.1.0`.
- JSONL export format in frontend options, backend command mapping, result opening, and mock coverage.
- External exporter path, picker, downloader, sidecar process spawning, and real CLI smoke script removed.
- CI now gates on the built-in Rust command matrix, Rust tests, Rust check, frontend build, and mock UI smoke.
- Environment and support snapshots report the built-in engine version and compatibility status.
- Encrypted backup passwords are passed in-process to the built-in engine for the current task only; they are not saved and are redacted from previews/logs/reports.

## Local Verification

The following checks passed on Windows before marking this candidate release-ready:

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
a2ec34179cba18d818868e0a66219354ece487a126abfd434547d370fb3074fa  iMessage Exporter GUI_0.2.0_x64_zh-CN.msi
7c641d6cf18575edf3485412dab60c12152ab2ab4330a5ed62c8fc01ef82b194  iMessage Exporter GUI_0.2.0_x64-setup.exe
```

Because the local build was unsigned, `latest.json` was intentionally skipped locally. The GitHub release workflow should produce signed updater artifacts when signing secrets are available.

## CI Evidence

Branch: `codex/ci-exporter-compat-smoke`

Commit: `9b55ba4fe2c2ca29451d78766dd6f0a0c870da5d`

GitHub Actions run:

- Workflow: `CI`
- Job: `windows`
- Status: success
- URL: <https://github.com/A1mAssist/imessage-exporter-gui/actions/runs/27693448160>

## Release Checklist

1. Merge the release branch into `main`.
2. Confirm `main` CI is green.
3. Create and push tag `v0.2.0` from the merge commit.
4. Confirm `Release Installers` completes for Windows and macOS.
5. Confirm release assets include Windows NSIS, Windows MSI, macOS DMG, signatures, checksums, and `latest.json`.
6. Confirm GitHub Releases latest points to `v0.2.0`.
7. Download the Windows NSIS asset from GitHub and run `scripts/smoke-installed-windows.ps1` against it when practical.

## Known Follow-Ups

- Cancellation is still cooperative only at the GUI job layer; the built-in exporter does not yet stop mid-run.
- macOS installer smoke still relies on GitHub Actions output because this Windows machine cannot install the macOS DMG.
- Future releases should document the exact upstream `imessage-exporter` commit used for the vendored source.
