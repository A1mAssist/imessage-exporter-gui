# Third Party Notices

## imessage-exporter

- Project: https://github.com/ReagentX/imessage-exporter
- License: GPL-3.0-only
- Purpose: built-in Rust export engine

This app vendors the upstream Rust source under `src-tauri/vendor/imessage-exporter` and links it into the desktop app. Source code and releases for the upstream project are available at the project URL above.

## Converter Tools

`ffmpeg` and ImageMagick are not bundled. The app detects whether they are available on `PATH` and warns when export options require them.

## Application Framework Dependencies

- Tauri: desktop application shell and Rust command bridge
- React and React DOM: frontend UI
- lucide-react: interface icons
- pngjs: local icon asset generation script

Dependency versions are declared in `package.json` and `src-tauri/Cargo.toml`.
