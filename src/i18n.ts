import { useEffect, useLayoutEffect, useMemo, useState } from "react";

export type AppLanguage = "en" | "zh-CN";

const storageKey = "imessage-exporter-gui.language";
let activeLanguage: AppLanguage = detectInitialLanguage();

const en: Record<string, string> = {
  "数据源": "Data Source",
  "诊断": "Diagnostics",
  "选项": "Options",
  "导出": "Export",
  "Windows iOS 备份导出向导": "Windows iOS Backup Export Wizard",
  "工作区导航": "Workspace navigation",
  "无法检查输出目录，请重新选择或确认权限。": "Could not inspect the output folder. Choose it again or check permissions.",
  "输出目录已有内容或疑似旧导出文件。继续导出会把新结果写入同一个目录，是否继续？": "The output folder already has files or looks like an old export. Continue writing the new export into this folder?",
  "输出路径已存在，但它不是文件夹。": "The output path already exists, but it is not a folder.",
  "输出目录的上级目录不存在，请重新选择。": "The parent folder for the output folder does not exist. Choose another location.",
  "归档目录的上级目录不存在，请先重新选择输出位置。": "The parent folder for the archive folder does not exist. Choose another output location first.",
  "无法生成未占用的归档目录，请手动选择新的输出目录。": "Could not generate an unused archive folder. Choose a new output folder manually.",
  "缺少 imessage-exporter 导出引擎，暂时不能开始导出。": "The imessage-exporter export engine is missing, so export cannot start yet.",
  "缺少 imessage-exporter 导出引擎，暂时不能运行诊断。": "The imessage-exporter export engine is missing, so diagnostics cannot run yet.",
  "请选择 iOS 备份根目录。": "Choose the iOS backup root folder.",
  "备份目录需要同时包含 Manifest.db 和 Info.plist。": "The backup folder must contain both Manifest.db and Info.plist.",
  "开始导出后可查看结果。": "Results are available after export starts.",
  "尚未开始": "Not started",
  "任务已停止。可以调整选项后重新运行，已有日志会保留在本页。": "The task was stopped. You can adjust options and run it again; existing logs stay on this page.",
  "请查看 stderr/stdout 日志。": "Check the stderr/stdout logs.",
  "修正备份路径、密码、输出目录或转换器环境后重试。": "Fix the backup path, password, output folder, or converter environment, then retry.",
  "Export Workspace": "Export Workspace",
  "当前导出状态": "Current export status",
  "界面设置": "Interface settings",
  "备份": "Backup",
  "未选择": "Not selected",
  "输出": "Output",
  "未设置": "Not set",
  "导出引擎": "Export Engine",
  "主题": "Theme",
  "系统": "System",
  "浅色": "Light",
  "深色": "Dark",
  "就绪": "Ready",
  "缺失": "Missing",
  "任务": "Task",
  "运行中": "Running",
  "空闲": "Idle",
  "运行环境": "Environment",
  "刷新环境": "Refresh environment",
  "未找到": "Not found",
  "可用": "Available",
  "未检测到": "Not detected",
  "环境": "Environment",
  "路径": "Path",
  "名称": "Name",
  "密码状态": "Password Status",
  "未确认或缺失": "Not confirmed or missing",
  "未输入": "Not entered",
  "不适用": "Not applicable",
  "已输入，未写入报告": "Entered, omitted from report",
  "暂无日志": "No logs yet",
  "iMessage Exporter GUI 诊断报告": "iMessage Exporter GUI Diagnostic Report",
  "生成时间": "Generated At",
  "脱敏命令": "Redacted Command",
  "脱敏日志": "Redacted Logs",
  "Mock 模式：未调用真实导出引擎。basic/full 附件转换仍会显示依赖提示。": "Mock mode: no real export engine is called. basic/full attachment conversion still shows dependency hints.",
  "Mock 模式：模拟导出引擎缺失，诊断和导出会被禁用。": "Mock mode: simulating a missing export engine, so diagnostics and export are disabled.",
  "仅保存路径和导出选项，不保存备份密码": "Only paths and export options are saved. Backup passwords are never saved.",
  "清除": "Clear",
  "开源与版本资料": "Open-source and version resources",
  "GPL 许可证": "GPL License",
  "第三方声明": "Third-party notices",
  "选择导出引擎": "Choose Engine",
  "下载": "Download",
  "下载导出引擎": "Download Engine",
  "选择": "Choose",
  "未选择；会尝试从 PATH 检测": "Not selected; PATH will be checked",
  "GUI 不内置 imessage-exporter；请单独下载导出引擎，或选择本机已有的可执行文件。": "The GUI does not bundle imessage-exporter. Download the export engine separately, or choose an existing executable on this computer.",
  "下载 imessage-exporter 后选择可执行文件": "Download imessage-exporter, then choose the executable",
  "环境修复建议": "Environment fixes",
  "缺失项处理": "Missing items",
  "未找到 imessage-exporter。请安装命令行工具，或在界面中选择 imessage-exporter 可执行文件。": "imessage-exporter was not found. Install the command-line tool, or choose the imessage-exporter executable in the app.",
  "缺少导出引擎": "Export engine missing",
  "GUI 没能启动 imessage-exporter。": "The GUI could not start imessage-exporter.",
  "下载 imessage-exporter，或在运行环境面板里选择本机已有的 imessage-exporter 可执行文件。": "Download imessage-exporter, or choose an existing imessage-exporter executable in the Environment panel.",
  "安装 basic/full 附件转换器": "Install basic/full attachment converters",
  "复制": "Copy",
  "正在保存设置": "Saving settings",
  "设置保存失败": "Could not save settings",
  "已清除保存设置": "Saved settings cleared",
  "设置已保存": "Settings saved",
  "回到数据源": "Back to Data Source",
  "回到选项": "Back to Options",
  "重试": "Retry",
  "数据准备": "Data Prep",
  "选择 iOS 备份": "Choose iOS Backup",
  "从 Apple Devices 或 iTunes 的本地备份导出 Messages 数据，不修改原始备份。": "Export Messages data from a local Apple Devices or iTunes backup without modifying the original backup.",
  "诊断检查": "Diagnostics Check",
  "导出设置": "Export Settings",
  "运行结果": "Run Results",
  "设置向导": "Setup Guide",
  "关于": "About",
  "导出引擎设置": "Export Engine Setup",
  "获取方式": "Source",
  "已使用本机可执行文件": "Using a local executable",
  "需要下载或选择 imessage-exporter.exe": "Download or choose imessage-exporter.exe",
  "当前位置": "Current location",
  "可用状态": "Availability",
  "检测通过": "Detected",
  "尚未检测到可用版本": "No usable version detected yet",
  "已检测到 imessage-exporter，诊断和导出可以继续运行。": "imessage-exporter is detected. Diagnostics and exports can continue.",
  "GUI 不内置 imessage-exporter；需要先下载或选择本机已有的可执行文件。": "The GUI does not bundle imessage-exporter. Download it or choose an existing executable on this computer.",
  "需要设置": "Needs setup",
  "打开下载页": "Open download page",
  "重新检测": "Check again",
  "关闭关于与诊断": "Close About and Diagnostics",
  "App Diagnostics": "App Diagnostics",
  "关于与诊断": "About and Diagnostics",
  "查看版本、更新、导出引擎和运行环境信息；反馈问题时可以直接复制这份摘要。": "Review version, update, export engine, and runtime details. Copy the snapshot when reporting an issue.",
  "应用信息": "App information",
  "版本": "Version",
  "标识符": "Identifier",
  "平台": "Platform",
  "作者": "Author",
  "自动更新": "Automatic updates",
  "正在连接 GitHub Release 检查新版本。": "Connecting to GitHub Releases to check for a new version.",
  "更新已安装，应用正在重启。": "The update is installed. The app is restarting.",
  "更新检查失败。可以稍后重试，或从 GitHub Releases 手动下载。": "Update check failed. Try again later, or download manually from GitHub Releases.",
  "手动检查 GitHub Releases 上是否有新版本。": "Check GitHub Releases for a new version manually.",
  "更新下载进度": "Update download progress",
  "检查更新": "Check for updates",
  "下载并安装": "Download and install",
  "未检测到 imessage-exporter；可以下载新版或选择本机已有文件。": "imessage-exporter was not detected. Download the latest build or choose an existing local file.",
  "获取 imessage-exporter": "Get imessage-exporter",
  "可执行文件位置": "Executable location",
  "可用性检测": "Availability check",
  "未选择；会检查 PATH": "Not selected; PATH will be checked",
  "支持摘要": "Support snapshot",
  "复制这份信息可以快速说明版本、平台、引擎和依赖状态。": "Copy this information to summarize version, platform, engine, and dependency status.",
  "支持诊断摘要": "Support diagnostics snapshot",
  "复制摘要": "Copy snapshot",
  "首次导出清单": "First Export Checklist",
  "按顺序完成这三项，就能进入导出选项。": "Complete these three items in order, then continue to export options.",
  "First Run": "First Run",
  "首次设置指引": "First-Run Setup Guide",
  "关闭首次设置指引": "Close first-run setup guide",
  "按这条路线完成第一次导出；以后可以从顶部重新打开这个向导。": "Follow this path for the first export. You can reopen this guide from the top bar later.",
  "GUI 不内置导出引擎，请先下载或选择本机可执行文件。": "The GUI does not bundle the export engine. Download it first or choose a local executable.",
  "准备导出引擎": "Prepare Export Engine",
  "已检测到 imessage-exporter，可以继续。": "imessage-exporter is detected, so you can continue.",
  "先下载 imessage-exporter，然后在这里选择可执行文件。": "Download imessage-exporter first, then choose the executable here.",
  "备份目录已就绪。": "Backup folder is ready.",
  "选择包含 Manifest.db 和 Info.plist 的本机 iOS 备份根目录。": "Choose the local iOS backup root folder that contains Manifest.db and Info.plist.",
  "选择 Apple Devices 或 iTunes 创建的本机 iOS 备份根目录。": "Choose the local iOS backup root folder created by Apple Devices or iTunes.",
  "选择备份": "Choose Backup",
  "诊断已通过，可以继续设置导出选项。": "Diagnostics passed. You can continue to export options.",
  "确认数据库、附件、联系人和可选转换器状态。": "Check the database, attachments, contacts, and optional converters.",
  "先确认数据库、附件、联系人和转换器状态。": "Check the database, attachments, contacts, and converter status first.",
  "首次设置操作": "First-run setup actions",
  "稍后": "Later",
  "开始设置": "Start Setup",
  "备份根目录": "Backup Root Folder",
  "自动发现": "Auto-discovered",
  "常见 MobileSync Backup 目录中的候选备份。": "Candidate backups found in common MobileSync Backup folders.",
  "有效": "Valid",
  "不完整": "Incomplete",
  "没有自动发现本机 iOS 备份": "No local iOS backups were found automatically",
  "可以手动选择包含 Manifest.db 和 Info.plist 的备份根目录。": "You can manually choose a backup root folder that contains Manifest.db and Info.plist.",
  "如果这两处都为空，先用 Apple Devices 或 iTunes 在本机创建一次加密备份。": "If both locations are empty, create an encrypted local backup with Apple Devices or iTunes first.",
  "请选择目录": "Choose a folder",
  "iPhone 旧备份": "Old iPhone Backup",
  "备份状态": "Backup Status",
  "存在": "Found",
  "未确认": "Not confirmed",
  "加密": "Encrypted",
  "是": "Yes",
  "否或未知": "No or unknown",
  "这是加密 iOS 备份": "This is an encrypted iOS backup",
  "备份密码": "Backup Password",
  "只保存在当前内存中": "Kept only in memory",
  "清除密码": "Clear password",
  "任务结束后自动清除密码": "Clear password automatically when the task ends",
  "密码会临时传给 CLI，命令预览和日志会脱敏，但系统进程列表仍可能短暂看到。": "The password is passed to the CLI temporarily. Command previews and logs are redacted, but the system process list may briefly show it.",
  "运行诊断": "Run Diagnostics",
  "诊断前需要处理的问题": "Issues to resolve before diagnostics",
  "正在检查": "Checking",
  "已就绪": "Ready",
  "未找到导出引擎，请下载或选择 imessage-exporter": "Export engine not found. Download or choose imessage-exporter.",
  "备份目录": "Backup Folder",
  "需要包含 Manifest.db 和 Info.plist": "Must contain Manifest.db and Info.plist",
  "加密密码": "Encrypted Password",
  "已输入，任务结束后自动清除": "Entered, will be cleared after the task",
  "已输入，仅保存在内存中": "Entered, kept only in memory",
  "加密备份需要密码": "Encrypted backups require a password",
  "加密备份需要输入密码。": "Encrypted backups require a password.",
  "未标记为加密备份": "Not marked as encrypted",
  "附件转换": "Attachment Conversion",
  "basic/full 可用": "basic/full available",
  "clone 可直接导出，basic/full 需要 ffmpeg 和 ImageMagick": "clone can export directly; basic/full require ffmpeg and ImageMagick",
  "启动就绪检查": "Startup readiness checks",
  "首次导出路线": "First export path",
  "就绪检查": "Readiness Checks",
  "重新检查": "Check Again",
  "诊断备份": "Diagnose Backup",
  "先让 imessage-exporter 检查数据库、附件、联系人和转换器状态。": "Let imessage-exporter check the database, attachments, contacts, and converter status first.",
  "诊断摘要": "Diagnostic Summary",
  "先看能否继续，再按下面的诊断卡片定位细节。": "Check whether you can continue, then use the diagnostic cards below for details.",
  "导出引擎可用": "Export engine is available",
  "未就绪": "Not ready",
  "需要有效的 iOS 备份根目录": "A valid iOS backup root folder is required",
  "未检测到导出引擎": "Export engine was not detected",
  "诊断结果": "Diagnostic Result",
  "已通过": "Passed",
  "需处理": "Needs action",
  "联系人解析可用": "Contact parsing is available",
  "缺少 ffmpeg / ImageMagick": "Missing ffmpeg / ImageMagick",
  "诊断已完成，但仍有项目需要处理。": "Diagnostics finished, but some items still need attention.",
  "运行诊断后会汇总检查结果。": "Run diagnostics to summarize the checks.",
  "完整": "Complete",
  "可选缺失": "Optional missing",
  "basic/full 附件转换可用": "basic/full attachment conversion is available",
  "clone 可直接导出；basic/full 需要 ffmpeg 和 ImageMagick": "clone can export directly; basic/full require ffmpeg and ImageMagick",
  "数据库": "Database",
  "附件": "Attachments",
  "联系人": "Contacts",
  "转换器": "Converters",
  "取消诊断": "Cancel Diagnostics",
  "重新诊断": "Run Again",
  "继续设置": "Continue to Options",
  "继续设置前需要处理的问题": "Issues to resolve before continuing",
  "请先成功完成一次诊断。": "Complete diagnostics successfully first.",
  "设置导出选项": "Set Export Options",
  "选择输出格式、附件复制策略、日期范围和会话筛选。": "Choose output format, attachment copy strategy, date range, and conversation filters.",
  "预设": "Presets",
  "只调整格式、附件策略和打印模式，不改备份路径、输出目录或密码。": "Only changes format, attachment strategy, and print mode. Backup path, output folder, and password are kept.",
  "快速归档": "Quick Archive",
  "HTML + clone，保留附件引用，适合第一轮完整导出。": "HTML + clone, keeps attachment references, good for the first complete export.",
  "轻量文本": "Text Lite",
  "TXT + disabled，只导出文本，便于长期保存和搜索。": "TXT + disabled, exports text only for long-term storage and search.",
  "打印准备": "Print Ready",
  "HTML + clone + no-lazy，方便后续用浏览器打印为 PDF。": "HTML + clone + no-lazy, ready for printing to PDF in a browser.",
  "输出目录": "Output Folder",
  "新建归档目录": "New Archive Folder",
  "生成带时间戳的新文件夹，避免导出结果混入旧目录。": "Generate a timestamped folder so new exports do not mix with old files.",
  "格式": "Format",
  "Windows 第一版建议使用 clone；basic/full 依赖本机转换器。": "For the first Windows version, clone is recommended; basic/full depend on local converters.",
  "保留更多富文本和附件引用，适合归档与打印。": "Preserves richer text and attachment references for archiving and printing.",
  "纯文本输出，更轻量，适合检索和长期保存。": "Plain text output, lighter and easier to search or store long term.",
  "不复制附件，导出最快，输出最轻。": "Does not copy attachments. Fastest export and smallest output.",
  "复制原始附件，Windows 第一版推荐。": "Copies original attachments. Recommended for the first Windows release.",
  "基础转换，需要 ffmpeg/ImageMagick。": "Basic conversion; requires ffmpeg/ImageMagick.",
  "完整转换，需要 ffmpeg/ImageMagick，耗时更久。": "Full conversion; requires ffmpeg/ImageMagick and takes longer.",
  "日期范围": "Date Range",
  "开始日期": "Start Date",
  "结束日期": "End Date",
  "清除日期": "Clear Dates",
  "会话筛选": "Conversation Filter",
  "正在读取会话...": "Reading conversations...",
  "正在从备份读取会话列表。": "Reading conversations from the backup.",
  "选择一个会话，导出时会自动传入对应筛选值。": "Choose a conversation; the matching filter value will be passed to export.",
  "会话列表不可用；手动输入后仍会把筛选值传给导出引擎。": "The conversation list is unavailable; manual entries are still passed to the export engine.",
  "将使用手动筛选值导出指定会话。": "The manual filter value will be used for this export.",
  "输入联系人、手机号或聊天标识来筛选单个会话。": "Enter a contact, phone number, or chat identifier to filter one conversation.",
  "没有读取到可选择的会话；默认导出全部会话。": "No selectable conversations were found; all conversations will be exported by default.",
  "无法读取会话列表：": "Could not read the conversation list: ",
  "。仍可手动输入联系人、手机号或聊天标识继续导出。": ". You can still enter a contact, phone number, or chat identifier manually.",
  "这个备份暂时没有可选择的会话列表；需要筛选时可以手动输入。": "This backup does not have a selectable conversation list right now; enter a filter manually if needed.",
  "无法读取 Messages 数据库，可能是备份已加密或数据库不可直接访问": "Could not read the Messages database. The backup may be encrypted or the database may not be directly accessible.",
  "搜索会话": "Search Conversations",
  "姓名、手机号、邮箱或群聊": "Name, phone number, email, or group",
  "排序": "Sort",
  "消息最多": "Most messages",
  "最近消息": "Recent messages",
  "没有匹配的会话；可以换个关键词或手动输入。": "No conversations match. Try another keyword or enter a filter manually.",
  "手动输入...": "Enter manually...",
  "手动输入筛选值": "Enter filter manually",
  "手动筛选值": "Manual Filter Value",
  "清除会话": "Clear Conversation",
  "群聊": "Group chat",
  "单聊": "Direct chat",
  "联系人、手机号或聊天标识": "Contact, phone number, or chat identifier",
  "自定义显示名": "Custom Display Name",
  "留空使用默认联系人解析": "Leave blank to use default contact parsing",
  "HTML 打印友好模式": "HTML print-friendly mode",
  "使用 Caller ID 作为显示名": "Use Caller ID as display name",
  "忽略磁盘空间警告": "Ignore disk space warnings",
  "开始导出": "Start Export",
  "来源": "Source",
  "日期": "Date",
  "会话": "Conversation",
  "显示名": "Display Name",
  "全部会话": "All conversations",
  "导出前复核": "Pre-export Review",
  "确认这次任务会读取哪里、写到哪里，以及哪些选项会影响结果。": "Confirm what this task reads, where it writes, and which options affect the result.",
  "导出风险提示": "Export risk notes",
  "使用 Caller ID": "Use Caller ID",
  "默认联系人解析": "Default contact parsing",
  "加密备份密码只保存在内存中，但运行时仍可能短暂出现在系统进程列表。": "The encrypted backup password is kept only in memory, but it may briefly appear in the system process list while running.",
  "输出目录已有内容，继续导出前请确认旧文件可以保留。": "The output folder already has files. Confirm old files can stay before continuing.",
  "basic/full 附件转换依赖 ffmpeg 和 ImageMagick，当前环境不完整。": "basic/full attachment conversion requires ffmpeg and ImageMagick, and the current environment is incomplete.",
  "HTML 打印友好模式会禁用懒加载，适合后续浏览器打印为 PDF。": "HTML print-friendly mode disables lazy loading and is useful when printing to PDF from a browser.",
  "已选择忽略磁盘空间警告，请确认输出磁盘有足够容量。": "Disk space warnings are ignored. Make sure the output disk has enough free space.",
  "输出目录状态": "Output Folder Status",
  "正在检查目录内容和权限。": "Checking folder contents and permissions.",
  "当前路径不可用于导出。": "The current path cannot be used for export.",
  "上级目录不存在。": "The parent folder does not exist.",
  "目录当前不存在，导出前请确认路径可创建。": "The folder does not exist yet. Make sure it can be created before export.",
  "空文件夹，适合写入新的导出结果。": "Empty folder, suitable for a new export.",
  "请选择导出输出目录。": "Choose the export output folder.",
  "检测到疑似旧导出文件，建议选择一个新的空目录。": "Old export files were detected. Choose a new empty folder.",
  "全部日期": "All dates",
  "导出与结果": "Export and Results",
  "实时查看 imessage-exporter 输出，导出完成后打开结果目录。": "Watch imessage-exporter output in real time, then open the result folder when export finishes.",
  "还没有开始导出": "Export has not started",
  "先在选项页确认输出目录、格式和命令预览，再启动导出任务。": "Confirm the output folder, format, and command preview in Options before starting export.",
  "返回选项": "Back to Options",
  "正在导出": "Exporting",
  "打开首个 HTML": "Open First HTML",
  "打开首个 TXT": "Open First TXT",
  "复制路径": "Copy Path",
  "复制结果路径": "Copy result path",
  "取消导出": "Cancel Export",
  "重新导出": "Export Again",
  "打开输出目录": "Open Output Folder",
  "导出摘要": "Export Summary",
  "状态": "Status",
  "项目": "Items",
  "耗时": "Duration",
  "下一步": "Next Step",
  "日志未报告": "Not reported in logs",
  "未报告": "Not reported",
  "等待导出": "Waiting to export",
  "正在等待 imessage-exporter 输出。": "Waiting for imessage-exporter output.",
  "任务已成功结束。": "The task finished successfully.",
  "任务已停止，已保留当前日志。": "The task stopped and current logs were kept.",
  "请查看日志中的错误信息。": "Check the error details in the logs.",
  "开始导出后会在这里汇总结果。": "A result summary appears here after export starts.",
  "打开首个 HTML 或输出目录检查结果。": "Open the first HTML file or the output folder to review results.",
  "打开首个 TXT 或输出目录检查结果。": "Open the first TXT file or the output folder to review results.",
  "按失败提示修正后重新导出。": "Fix the issue shown in the failure hint, then export again.",
  "调整选项后可重新导出。": "Adjust options, then export again.",
  "保持窗口打开，必要时可取消任务。": "Keep this window open; cancel the task if needed.",
  "开始导出后会显示下一步。": "The next step appears after export starts.",
  "命令预览": "Command Preview",
  "密码和敏感值已脱敏。": "Passwords and sensitive values are redacted.",
  "复制命令": "Copy Command",
  "诊断报告": "Diagnostic Report",
  "复制诊断报告": "Copy Diagnostic Report",
  "下载诊断报告 .txt": "Download Diagnostic Report .txt",
  "日志": "Logs",
  "滚动到最新日志": "Scroll to latest log",
  "最新": "Latest",
  "复制日志": "Copy Logs",
  "搜索日志": "Search logs",
  "日志类型过滤": "Log type filters",
  "没有匹配的日志。": "No matching logs.",
  "任务日志会显示在这里。": "Task logs appear here.",
  "已确认": "Confirmed",
  "需注意": "Needs attention",
  "未解析": "Not parsed",
  "已复制": "Copied",
  "复制失败": "Copy failed",
  "待运行": "Ready",
  "退出 0": "Exit 0",
};

export function useAppLanguage() {
  const [language, setLanguageState] = useState<AppLanguage>(() => detectInitialLanguage());
  activeLanguage = language;

  const api = useMemo(
    () => ({
      language,
      setLanguage(next: AppLanguage) {
        activeLanguage = next;
        setLanguageState(next);
        try {
          window.localStorage.setItem(storageKey, next);
        } catch {
          // Ignore storage failures; language still changes for this session.
        }
      },
      t: tx,
    }),
    [language],
  );

  return api;
}

export function tx(text: string): string {
  return translateText(activeLanguage, text);
}

export function localizeMultiline(language: AppLanguage, text: string): string {
  return text
    .split("\n")
    .map((line) => translateText(language, line))
    .join("\n");
}

export function useDocumentLocalization(language: AppLanguage) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language === "zh-CN" ? "zh-CN" : "en";
  }, [language]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.querySelector(".app-shell");
    if (!root) return;

    let translating = false;
    const translate = () => {
      if (translating) return;
      translating = true;
      try {
        translateTree(root, language);
      } finally {
        translating = false;
      }
    };

    translate();
    const options: MutationObserverInit = { attributes: true, childList: true, subtree: true, characterData: true };
    const observer = new MutationObserver(() => {
      observer.disconnect();
      translate();
      observer.observe(root, options);
    });
    observer.observe(root, options);
    return () => observer.disconnect();
  }, [language]);
}

export function translateText(language: AppLanguage, text: string): string {
  if (language === "zh-CN") return text;
  const exact = en[text];
  if (exact) return exact;

  const updateAvailable = text.match(/^发现新版本 (.+)，当前版本 (.+)。$/);
  if (updateAvailable) return `Version ${updateAvailable[1]} is available. Current version: ${updateAvailable[2]}.`;

  const updateInstalling = text.match(/^正在下载 (.+)，安装后会重启应用。$/);
  if (updateInstalling) return `Downloading ${updateInstalling[1]}. The app will restart after installation.`;

  const updateCurrent = text.match(/^当前已经是最新版本 (.+)。$/);
  if (updateCurrent) return `You are already on the latest version, ${updateCurrent[1]}.`;

  const withCode = text.match(/^(诊断|导出)(运行中|完成|已取消|失败)(?:，代码 (.+))?$/);
  if (withCode) {
    const action = withCode[1] === "诊断" ? "Diagnostics" : "Export";
    const state = withCode[2];
    const stateText = state === "运行中" ? "running" : state === "完成" ? "complete" : state === "已取消" ? "cancelled" : "failed";
    return withCode[3] ? `${action} ${stateText}, code ${withCode[3]}` : `${action} ${stateText}`;
  }

  const conversationScanFailure = text.match(/^无法读取会话列表：(.+)。仍可手动输入联系人、手机号或聊天标识继续导出。$/);
  if (conversationScanFailure) {
    return `Could not read the conversation list: ${translateText(language, conversationScanFailure[1])}. You can still enter a contact, phone number, or chat identifier manually.`;
  }

  const conversationFilterCount = text.match(/^已筛出 (.+) 个会话。$/);
  if (conversationFilterCount) return `${conversationFilterCount[1]} conversation(s) shown.`;

  const recentConversation = text.match(/^最近 (.+)$/);
  if (recentConversation) return `Recent ${recentConversation[1]}`;

  const exit = text.match(/^进程退出，代码 (.+)$/);
  if (exit) return `Process exited, code ${exit[1]}`;

  const copiedPath = text.match(/^复制结果路径: (.+)$/);
  if (copiedPath) return `Copy result path: ${copiedPath[1]}`;

  const copiedFullPath = text.match(/^复制完整(.+): (.+)$/);
  if (copiedFullPath) return `Copy full ${translateText(language, copiedFullPath[1]).toLowerCase()}: ${copiedFullPath[2]}`;

  const attachmentSummary = text.match(/^(.+) · 附件 (.+)$/);
  if (attachmentSummary) return `${attachmentSummary[1]} · Attachments ${attachmentSummary[2]}`;

  const copyLabel = text.match(/^复制(.+)$/);
  if (copyLabel) return `Copy ${translateText(language, copyLabel[1])}`;

  const chooseLabel = text.match(/^选择(.+)$/);
  if (chooseLabel) return `Choose ${translateText(language, chooseLabel[1])}`;

  const generatedAt = text.match(/^生成时间: (.+)$/);
  if (generatedAt) return `Generated At: ${generatedAt[1]}`;

  const reportField = text.match(/^- ([^:：]+): (.+)$/);
  if (reportField) return `- ${translateText(language, reportField[1])}: ${translateText(language, reportField[2])}`;

  const logLine = text.match(/^\[([^\]]+)\] (.+)$/);
  if (logLine) return `[${logLine[1]}] ${translateText(language, logLine[2])}`;

  const items = text.match(/^已有 (.+) 个项目。继续导出前建议确认这些文件可以保留。$/);
  if (items) return `${items[1]} item(s) already exist. Confirm these files can stay before continuing.`;

  const messages = text.match(/^(.+) 条消息$/);
  if (messages) return `${messages[1]} messages`;

  const attachments = text.match(/^(.+) 个附件$/);
  if (attachments) return `${attachments[1]} attachments`;

  const genericItems = text.match(/^(.+) 项$/);
  if (genericItems) return `${genericItems[1]} item(s)`;

  const minuteSeconds = text.match(/^(.+) 分 (.+) 秒$/);
  if (minuteSeconds) return `${minuteSeconds[1]} minute(s) ${minuteSeconds[2]} second(s)`;

  const minutes = text.match(/^(.+) 分$/);
  if (minutes) return `${minutes[1]} minute(s)`;

  const seconds = text.match(/^(.+) 秒$/);
  if (seconds) return `${seconds[1]} second(s)`;

  const missing = text.match(/^缺少 (.+)$/);
  if (missing) return `Missing ${missing[1]}`;

  const existingItems = text.match(/^输出目录已有 (.+) 个项目，导出结果可能会与旧文件混在一起。$/);
  if (existingItems) return `The output folder already has ${existingItems[1]} item(s), so new results may mix with old files.`;

  const codeFailure = text.match(/^导出失败，代码 (.+)$/);
  if (codeFailure) return `Export failed, code ${codeFailure[1]}`;

  const dateBetween = text.match(/^(.+) 至 (.+)$/);
  if (dateBetween) return `${dateBetween[1]} to ${dateBetween[2]}`;

  const dateAfter = text.match(/^(.+) 之后$/);
  if (dateAfter) return `After ${dateAfter[1]}`;

  const dateBefore = text.match(/^(.+) 之前$/);
  if (dateBefore) return `Before ${dateBefore[1]}`;

  const iphoneName = text.match(/^(.+) 的 iPhone$/);
  if (iphoneName) return `${iphoneName[1]}'s iPhone`;

  return text;
}

function translateTree(root: Element, language: AppLanguage) {
  translateAttributes(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent;
    if (text?.trim()) {
      const translated = translateTextPreservingWhitespace(language, text);
      if (translated !== text) node.textContent = translated;
    }
    node = walker.nextNode();
  }
}

function translateAttributes(root: Element, language: AppLanguage) {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  const attributes = ["placeholder", "title", "aria-label"] as const;
  for (const element of elements) {
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (!value?.trim()) continue;
      const translated = translateText(language, value);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  }
}

function translateTextPreservingWhitespace(language: AppLanguage, text: string): string {
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const core = text.trim();
  return `${leading}${translateText(language, core)}${trailing}`;
}

function detectInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "en";

  const queryLanguage = parseLanguage(new URLSearchParams(window.location.search).get("lang") ?? undefined);
  if (queryLanguage) return queryLanguage;

  try {
    const stored = parseLanguage(window.localStorage.getItem(storageKey) ?? undefined);
    if (stored) return stored;
  } catch {
    // Ignore storage failures and fall back to device language.
  }

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of languages) {
    const parsed = parseLanguage(candidate);
    if (parsed) return parsed;
  }

  return "en";
}

function parseLanguage(value?: string): AppLanguage | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return undefined;
}
