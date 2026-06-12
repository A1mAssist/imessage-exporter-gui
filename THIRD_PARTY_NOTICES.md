# Third Party Notices

## imessage-exporter

- Project: https://github.com/ReagentX/imessage-exporter
- Version: 4.1.0
- License: GPL-3.0-only
- Purpose: bundled command-line exporter sidecar

This GUI invokes the bundled `imessage-exporter` executable as a sidecar process. Source code for the upstream project is available at the project URL above.

## Converter Tools

`ffmpeg` and ImageMagick are not bundled. The app detects whether they are available on `PATH` and warns when export options require them.

## Application Framework Dependencies

- Tauri: desktop application shell and Rust command bridge
- React and React DOM: frontend UI
- lucide-react: interface icons
- pngjs: local icon asset generation script

Dependency versions are declared in `package.json` and `src-tauri/Cargo.toml`.
