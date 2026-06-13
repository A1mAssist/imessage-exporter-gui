# Changelog

## Unreleased

### Changed
- Made the language and theme controls larger and easier to notice in the top bar.
- Simplified the Environment panel so the export engine row shows availability instead of the exporter version string.

### Fixed
- Completed English localization coverage for export presets, output folder warnings, diagnostic report text, and dynamic review labels.
- Added smoke coverage that scans the English mock flow for untranslated Chinese text.

## v0.2.1 - 2026-06-13

### Added
- Added a first-run setup guide that walks users through choosing or downloading the export engine, selecting an iOS backup, and running diagnostics.
- Added a compact setup guide entry in the top bar so the guide can be reopened after first launch.
- Added release coverage for the onboarding flow and the English/Chinese language switch round trip.

### Changed
- Moved language and theme controls out of the sidebar into compact top-bar utilities.
- Refreshed the preview screenshots for the updated onboarding and preference-control layout.

### Fixed
- Fixed switching from English back to Chinese after the UI had already been translated.
- Fixed mock UI smoke flows so the first-run guide does not block later automation steps.

### Packaging
- Bumped the app, Tauri, and Rust crate versions to `0.2.1`.
- Release artifacts continue to ship Windows and macOS installers only.

