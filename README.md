# iMessage Exporter GUI

[中文说明](./README.zh-CN.md)

`iMessage Exporter GUI` is a desktop interface for [`imessage-exporter`](https://github.com/ReagentX/imessage-exporter). It exports SMS and iMessage data from local iOS backups to HTML or TXT.

It turns the common export flow into a guided app: choose an iOS backup, configure the export engine, check backup health, set export options, run the export, and open the result folder.

## Screenshots

![Choose an iOS backup](./preview/example-source.png)

![Export complete](./preview/example-results.png)

## Download

You do not need to clone the source code or install Node.js, Rust, or Visual Studio Build Tools. Download an installer from GitHub Releases:

[Download the latest release](https://github.com/A1mAssist/imessage-exporter-gui/releases/latest)

Choose the file for your system:

- Windows: download the `.exe` or `.msi` installer.
- macOS: download the `.dmg`.
- Linux: download the `.AppImage` or `.deb`.

The installers are not code-signed yet, so your system may show a safety warning:

- Windows SmartScreen: click "More info", then "Run anyway".
- macOS Gatekeeper: right-click the app and choose "Open", or allow it in System Settings -> Privacy & Security.
- Linux: if the `.AppImage` does not start, make it executable first, for example `chmod +x iMessage*.AppImage`.

## Basic Use

1. Download or install [`imessage-exporter`](https://github.com/ReagentX/imessage-exporter/releases/latest).
2. Create a local iPhone or iPad backup with Apple Devices or iTunes.
3. Open iMessage Exporter GUI.
4. In the Environment panel, choose the `imessage-exporter` executable if it is not already available on `PATH`.
5. In Data Source, choose or scan your local iOS backup folder.
6. If the backup is encrypted, enter the backup password.
7. Run diagnostics to check the database, attachments, and optional converters.
8. Choose the export format, attachment strategy, date range, and output folder.
9. Start the export, then open the output folder or the first result file when it completes.

Common backup locations:

```txt
Windows: %APPDATA%\Apple Computer\MobileSync\Backup
macOS: ~/Library/Application Support/MobileSync/Backup
```

## Feature Status

Implemented:

- Guided desktop interface in English and Chinese.
- Automatic UI language detection from the device language.
- Light, dark, and system theme modes.
- Local iOS backup scanning, plus manual backup folder selection.
- Checks for key backup files such as `Manifest.db` and `Info.plist`.
- External `imessage-exporter` engine detection from `PATH`, plus a GUI picker for the executable.
- HTML/TXT export with attachment strategy, date range, conversation filter, and display-name options.
- Output folder checks to avoid writing into the backup folder or mixing with old exports.
- One-click timestamped export folders, for example `Messages Export 2026-06-12 0130`.
- Live export logs with search, stdout/stderr/error filters, and cancellation.
- Diagnostic reports that can be copied or downloaded as `.txt`.
- Passwords are not saved in local settings; logs and reports redact sensitive values.
- Common failure hints for wrong backup passwords, incomplete backups, output folder permissions, missing export engine, and missing converters.
- Optional detection for `ffmpeg` and ImageMagick for some attachment conversion modes.

Current limits:

- v1 only exports from local iOS backups.
- macOS `chat.db`, jailbroken-device `sms.db`, and standalone attachment folders are not supported yet.
- `imessage-exporter` is not bundled in the GUI installer; install it separately or choose its executable in the app.
- `ffmpeg` and ImageMagick are not bundled.
- Native PDF export is not available yet; export HTML first, then print to PDF from a browser.
- Windows and macOS builds are not code-signed yet, so installation may show system safety prompts.

## Privacy And Safety

- Encrypted backup passwords stay in app memory and are not saved to local settings.
- Logs and diagnostic reports hide passwords.
- Because the upstream CLI accepts `--cleartext-password`, the password may still appear briefly in the system process list while a task is running.
- The output folder cannot be the backup folder itself or inside the backup folder.
- Current installers are unsigned and intended for small-scale testing.

## License

GPL-3.0-only. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
