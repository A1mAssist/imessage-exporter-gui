# Sidecar Version Lock

- Tool: `imessage-exporter`
- Version: `4.1.0`
- Upstream: https://github.com/ReagentX/imessage-exporter
- License: GPL-3.0-only
- Expected Tauri sidecar path: `src-tauri/binaries/imessage-exporter-x86_64-pc-windows-msvc.exe`
- Runtime sidecar name after Tauri copies it: `imessage-exporter.exe`

Build from source:

```powershell
.\scripts\build-sidecar.ps1
```

The script installs from crates.io at the pinned version and copies the resulting executable to the Tauri sidecar path. If you build from an upstream source checkout instead, use the same version tag and keep the final file name unchanged so Tauri can bundle it.

Tauri's build step removes the target triple from `externalBin` entries when it copies the sidecar into the app resources, so the backend looks for both the source filename and the packaged filename. This keeps Tauri dev, unpackaged local runs, and installed Windows bundles on the same path contract.
