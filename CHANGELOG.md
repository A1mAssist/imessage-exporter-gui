# Changelog

## Unreleased

## v0.1.1 - 2026-06-14

### Added
- Added a conversation picker that scans the selected iOS backup, lists chats before filtering, and supports searching and sorting by recent activity or message count.
- Added release packaging smoke coverage for installed Windows artifacts.

### Changed
- Reworked the workspace navigation labels so source, diagnostics, options, and results are presented as peer areas instead of numbered steps.
- Replaced free-text date range fields with date picker controls.
- Kept regular PR CI focused on unsigned checks while signed installer and updater packaging runs in the release workflow.

### Fixed
- Fixed selected option and preset buttons so their borders remain visually symmetric.
- Improved dialog keyboard handling with Escape close, focus trapping, and focus restoration.

## v0.1.0 - 2026-06-13

### Added
- Added a guided desktop workflow for selecting an iOS backup, configuring an external `imessage-exporter` binary, running diagnostics, choosing export options, viewing logs, cancelling long-running jobs, and opening generated output folders.
- Added first-run setup guidance, startup readiness checks, recovery hints, export summaries, and bundled license/resource links.
- Added English and Simplified Chinese localization with automatic device-language detection and a manual language switch.
- Added light, dark, and system theme modes.
- Added Windows and macOS release packaging for installer artifacts and checksums.

### Changed
- Uses `A1mAssist` as the app author and package publisher, with the bundle identifier `com.a1massist.imessage-exporter-gui`.
- Keeps `imessage-exporter` as an external user-provided engine instead of bundling it in the installer.
- Uses a wider desktop workspace so maximized browser and app windows make better use of available space.

### Fixed
- Completed English localization coverage for export presets, output folder warnings, diagnostic report text, and dynamic review labels.
- Added smoke coverage that scans the English mock flow for untranslated Chinese text.
- Fixed the available export engine status icon so it uses the green success state.
- Fixed the language and theme toggle backgrounds in dark mode.

### Packaging
- Reset the public release line to `0.1.0` after correcting package identity metadata before public adoption.

