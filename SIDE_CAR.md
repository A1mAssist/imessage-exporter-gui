# Sidecar Version Lock

- Tool: `imessage-exporter`
- Version: `4.1.0`
- Upstream: https://github.com/ReagentX/imessage-exporter
- License: GPL-3.0-only

The GUI bundles `imessage-exporter` as a Tauri sidecar. The source-time sidecar file includes the Rust target triple so Tauri can choose the correct binary for the host platform.

Expected source paths include:

```txt
src-tauri/binaries/imessage-exporter-x86_64-pc-windows-msvc.exe
src-tauri/binaries/imessage-exporter-x86_64-apple-darwin
src-tauri/binaries/imessage-exporter-aarch64-apple-darwin
src-tauri/binaries/imessage-exporter-x86_64-unknown-linux-gnu
```

Runtime names after Tauri copies the sidecar into app resources:

```txt
imessage-exporter.exe  # Windows
imessage-exporter      # macOS/Linux
```

Build from crates.io at the pinned version:

```powershell
.\scripts\build-sidecar.ps1
```

To force a target explicitly:

```powershell
.\scripts\build-sidecar.ps1 -Target x86_64-pc-windows-msvc
```

If you build from an upstream source checkout instead, use the same version tag and keep the final file name unchanged for the target platform so Tauri can bundle it.

Tauri's build step removes the target triple from `externalBin` entries when it copies the sidecar into runtime resources, so the backend looks for both the source filename and the packaged filename. This keeps Tauri dev, unpackaged local runs, and installed bundles on the same path contract.
