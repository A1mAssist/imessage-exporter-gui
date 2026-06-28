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
  "内置导出引擎暂未就绪，暂时不能开始导出。": "The built-in export engine is not ready yet, so export cannot start.",
  "内置导出引擎暂未就绪，暂时不能运行诊断。": "The built-in export engine is not ready yet, so diagnostics cannot run.",
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
  "部分可用": "Partially available",
  "未配置": "Not configured",
  "未检测到": "Not detected",
  "已验证版本": "Verified version",
  "兼容状态": "Compatibility",
  "低于已验证版本": "Below verified version",
  "版本不可识别": "Version unrecognized",
  "已验证": "Verified",
  "未检测": "Not checked",
  "环境": "Environment",
  "路径": "Path",
  "名称": "Name",
  "已验证导出引擎版本": "Verified Export Engine Version",
  "导出引擎兼容状态": "Export Engine Compatibility",
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
  "Mock 模式：未调用真实内置导出引擎。basic/full 附件转换仍会显示依赖提示。": "Mock mode: the real built-in export engine is not called. basic/full attachment conversion still shows dependency hints.",
  "Mock 模式：模拟导出引擎缺失，诊断和导出会被禁用。": "Mock mode: simulating a missing export engine, so diagnostics and export are disabled.",
  "仅保存路径和导出选项，不保存备份密码": "Only paths and export options are saved. Backup passwords are never saved.",
  "清除": "Clear",
  "开源与版本资料": "Open-source and version resources",
  "GPL 许可证": "GPL License",
  "第三方声明": "Third-party notices",
  "下载": "Download",
  "选择": "Choose",
  "详情": "Details",
  "环境修复建议": "Environment fixes",
  "缺失项处理": "Missing items",
  "内置导出引擎未能启动": "Built-in export engine could not start",
  "GUI 没能调用内置 imessage-exporter 引擎。": "The GUI could not call the built-in imessage-exporter engine.",
  "重启应用后再试；反馈问题时复制诊断报告。": "Restart the app and try again. Copy the diagnostic report when reporting the issue.",
  "导出引擎参数不兼容": "Export engine arguments are incompatible",
  "内置 imessage-exporter 拒绝了 GUI 生成的命令参数，通常是 GUI 后端与内置引擎源码不同步。": "The built-in imessage-exporter rejected the GUI-generated command arguments. This usually means the GUI backend and built-in engine source are out of sync.",
  "更新 GUI 后重试；反馈问题时复制诊断报告。": "Update the GUI and retry. Copy the diagnostic report when reporting the issue.",
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
  "当前位置": "Current location",
  "可用状态": "Availability",
  "检测通过": "Detected",
  "内置 imessage-exporter 已集成到应用内，诊断和导出可以继续运行。": "The built-in imessage-exporter is integrated into the app. Diagnostics and exports can continue.",
  "导出引擎信息暂不可用，请稍后重试。": "Export engine information is not available yet. Try again later.",
  "重新检测": "Check again",
  "关闭关于与诊断": "Close About and Diagnostics",
  "App Diagnostics": "App Diagnostics",
  "关于与诊断": "About and Diagnostics",
  "查看版本、更新、导出引擎和运行环境信息；反馈问题时可以直接复制这份摘要。": "Review version, update, export engine, and runtime details. Copy the snapshot when reporting an issue.",
  "关闭运行环境详情": "Close Environment Details",
  "运行环境详情": "Environment Details",
  "管理内置导出引擎、附件转换依赖和本机资源。侧栏只保留摘要，这里放完整状态。": "Review the built-in export engine, attachment conversion dependencies, and local resources. The sidebar keeps the summary; full status lives here.",
  "应用信息": "App information",
  "版本": "Version",
  "标识符": "Identifier",
  "平台": "Platform",
  "作者": "Author",
  "自动更新": "Automatic updates",
  "正在连接 GitHub Release 检查新版本。": "Connecting to GitHub Releases to check for a new version.",
  "更新已安装，应用正在重启。": "The update is installed. The app is restarting.",
  "更新检查失败。可以稍后重试，或从 GitHub Releases 手动下载。": "Update check failed. Try again later, or download manually from GitHub Releases.",
  "更新安装失败，请稍后重新打开应用再试。": "Update installation failed. Reopen the app later and try again.",
  "启动时会自动检查更新；只有发现新版本时才会提示。": "The app checks for updates at startup and only prompts when a new version is available.",
  "手动检查 GitHub Releases 上是否有新版本。": "Check GitHub Releases for a new version manually.",
  "更新下载进度": "Update download progress",
  "检查更新": "Check for updates",
  "下载并安装": "Download and install",
  "稍后提醒": "Remind me later",
  "可用性检测": "Availability check",
  "支持摘要": "Support snapshot",
  "复制这份信息可以快速说明版本、平台、引擎和依赖状态。": "Copy this information to summarize version, platform, engine, and dependency status.",
  "支持诊断摘要": "Support diagnostics snapshot",
  "复制摘要": "Copy snapshot",
  "basic/full 附件转换依赖已经齐备。": "basic/full attachment conversion dependencies are ready.",
  "clone 可直接导出；basic/full 需要 ffmpeg 和 ImageMagick。": "clone can export directly; basic/full require ffmpeg and ImageMagick.",
  "仅保存路径和导出选项，不保存备份密码。": "Only paths and export options are saved. Backup passwords are never saved.",
  "首次导出清单": "First Export Checklist",
  "按顺序完成这三项，就能进入导出选项。": "Complete these three items in order, then continue to export options.",
  "First Run": "First Run",
  "首次设置指引": "First-Run Setup Guide",
  "关闭首次设置指引": "Close first-run setup guide",
  "按这条路线完成第一次导出；以后可以从顶部重新打开这个向导。": "Follow this path for the first export. You can reopen this guide from the top bar later.",
  "按这个顺序准备备份、确认诊断，再进入导出选项。": "Prepare the backup, confirm diagnostics, then continue to export options.",
  "准备导出引擎": "Prepare Export Engine",
  "内置 imessage-exporter 已就绪，可以继续。": "The built-in imessage-exporter is ready.",
  "导出引擎状态尚未就绪，请刷新环境后重试。": "Export engine status is not ready yet. Refresh the environment and try again.",
  "内置导出引擎": "Built-in Export Engine",
  "内置引擎": "Built-in engine",
  "内置 imessage-exporter 已就绪": "Built-in imessage-exporter is ready",
  "正在读取引擎状态": "Reading engine status",
  "已内置": "Built in",
  "应用内置 imessage-exporter，无需选择外部 exe": "The app includes imessage-exporter; no external exe is needed",
  "模式": "Mode",
  "已验证内置 Rust 引擎": "Built-in Rust engine verified",
  "兼容性": "Compatibility",
  "兼容性检查": "Compatibility check",
  "等待环境检测完成": "Waiting for environment check",
  "GUI 已直接集成 imessage-exporter 源码，命令预览仅用于核对参数。": "The GUI directly integrates the imessage-exporter source. Command preview is only for parameter review.",
  "内置导出引擎暂未就绪，请重新检测环境": "The built-in export engine is not ready yet. Check the environment again.",
  "备份目录已就绪。": "Backup folder is ready.",
  "选择包含 Manifest.db 和 Info.plist 的本机 iOS 备份根目录。": "Choose the local iOS backup root folder that contains Manifest.db and Info.plist.",
  "选择 Apple Devices 或 iTunes 创建的本机 iOS 备份根目录。": "Choose the local iOS backup root folder created by Apple Devices or iTunes.",
  "选择备份": "Choose Backup",
  "诊断已通过，可以继续设置导出选项。": "Diagnostics passed. You can continue to export options.",
  "确认数据库、附件、联系人和可选转换器状态。": "Check the database, attachments, contacts, and optional converters.",
  "先确认数据库、附件、联系人和转换器状态。": "Check the database, attachments, contacts, and converter status first.",
  "确认数据库、附件、联系人和转换器状态": "Check the database, attachments, contacts, and converter status",
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
  "密码只在本次任务中传给内置导出引擎，命令预览和日志会脱敏。": "The password is passed to the built-in export engine only for this task. Command previews and logs are redacted.",
  "运行诊断": "Run Diagnostics",
  "运行": "Run",
  "诊断前需要处理的问题": "Issues to resolve before diagnostics",
  "正在检查": "Checking",
  "已就绪": "Ready",
  "内置可用": "Built in",
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
  "clone 不依赖本机转换器；basic/full 需要 ffmpeg 和 ImageMagick。": "clone does not depend on local converters; basic/full require ffmpeg and ImageMagick.",
  "保留更多富文本和附件引用，适合归档与打印。": "Preserves richer text and attachment references for archiving and printing.",
  "纯文本输出，更轻量，适合检索和长期保存。": "Plain text output, lighter and easier to search or store long term.",
  "不复制附件，导出最快，输出最轻。": "Does not copy attachments. Fastest export and smallest output.",
  "复制原始附件，不依赖本机转换器。": "Copies original attachments without depending on local converters.",
  "基础转换，需要 ffmpeg/ImageMagick。": "Basic conversion; requires ffmpeg/ImageMagick.",
  "完整转换，需要 ffmpeg/ImageMagick，耗时更久。": "Full conversion; requires ffmpeg/ImageMagick and takes longer.",
  "逐行结构化 JSON，适合检索、分析和二次处理。": "Line-delimited structured JSON for search, analysis, and downstream processing.",
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
  "我的显示名": "My Display Name",
  "只影响导出内容里自己的名字": "Only changes how your own name appears in exported content",
  "HTML 打印友好模式": "HTML print-friendly mode",
  "用 Caller ID 显示我自己": "Show me as Caller ID",
  "忽略磁盘空间警告": "Ignore disk space warnings",
  "开始导出": "Start Export",
  "来源": "Source",
  "日期": "Date",
  "会话": "Conversation",
  "结果文件": "Result File",
  "我的名字": "My Name",
  "全部会话": "All conversations",
  "导出前复核": "Pre-export Review",
  "确认这次任务会读取哪里、写到哪里，以及哪些选项会影响结果。": "Confirm what this task reads, where it writes, and which options affect the result.",
  "导出风险提示": "Export risk notes",
  "使用 Caller ID": "Use Caller ID",
  "默认解析": "Default parsing",
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
  "导出前预览": "Export Preview",
  "导出中": "Exporting",
  "导出结果": "Export Results",
  "正在追踪导出输出和结果。": "Tracking export output and results.",
  "先确认命令、结果文件和输出位置，再开始导出。": "Confirm the command, result files, and output location before starting export.",
  "查看导出摘要、日志和结果入口。": "Review the export summary, logs, and result actions.",
  "结果总览": "Result Overview",
  "导出总览": "Export Overview",
  "开始前": "Before Starting",
  "导出前总览": "Export Preview Summary",
  "开始导出前检查": "Pre-export Checks",
  "准备导出": "Ready to Export",
  "结果命名": "Result Naming",
  "已生成，可复制检查": "Generated and ready to copy",
  "等待备份和输出目录完整后生成": "Generated after backup and output folder are complete",
  "返回选项": "Back to Options",
  "正在导出": "Exporting",
  "打开首个 HTML": "Open First HTML",
  "打开首个 TXT": "Open First TXT",
  "打开首个 JSONL": "Open First JSONL",
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
  "任务已成功结束。": "The task finished successfully.",
  "任务已停止，已保留当前日志。": "The task stopped and current logs were kept.",
  "请查看日志中的错误信息。": "Check the error details in the logs.",
  "开始前先确认设置和输出位置。": "Confirm settings and output location before starting.",
  "开始前先看一眼将要导出的设置和结果位置。": "Review the export settings and result location before starting.",
  "打开首个 HTML 或输出目录检查结果。": "Open the first HTML file or the output folder to review results.",
  "打开首个 TXT 或输出目录检查结果。": "Open the first TXT file or the output folder to review results.",
  "打开首个 JSONL 或输出目录检查结果。": "Open the first JSONL file or the output folder to review results.",
  "按失败提示修正后重新导出。": "Fix the issue shown in the failure hint, then export again.",
  "调整选项后可重新导出。": "Adjust options, then export again.",
  "保持窗口打开，必要时可取消任务。": "Keep this window open; cancel the task if needed.",
  "确认无误后开始导出。": "Start export after everything looks right.",
  "命令预览": "Command Preview",
  "暂时还没有命令预览。": "No command preview yet.",
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

  const versionVerified = text.match(/^已验证 (.+) · 当前 (.+)$/);
  if (versionVerified) return `Verified ${versionVerified[1]} · Current ${versionVerified[2]}`;

  const versionOlder = text.match(/^低于已验证 (.+) · 当前 (.+)$/);
  if (versionOlder) return `Below verified ${versionOlder[1]} · Current ${versionOlder[2]}`;

  const versionUnknown = text.match(/^已验证 (.+) · 当前版本未识别$/);
  if (versionUnknown) return `Verified ${versionUnknown[1]} · Current version unknown`;

  const conversationScanFailure = text.match(/^无法读取会话列表：(.+)。仍可手动输入联系人、手机号或聊天标识继续导出。$/);
  if (conversationScanFailure) {
    return `Could not read the conversation list: ${translateText(language, conversationScanFailure[1])}. You can still enter a contact, phone number, or chat identifier manually.`;
  }

  const conversationFilterCount = text.match(/^已筛出 (.+) 个会话。$/);
  if (conversationFilterCount) return `${conversationFilterCount[1]} conversation(s) shown.`;

  const labeledArchiveFolder = text.match(/^生成带“(.+)”和时间戳的新文件夹。$/);
  if (labeledArchiveFolder) return `Generate a timestamped folder named with "${labeledArchiveFolder[1]}".`;

  const matchedConversationFile = text.match(/^匹配会话名(\.[a-z0-9]+)$/i);
  if (matchedConversationFile) return `Matched conversation name${matchedConversationFile[1]}`;

  const contactOrGroupFile = text.match(/^联系人或群聊名称(\.[a-z0-9]+)$/i);
  if (contactOrGroupFile) return `Contact or group chat name${contactOrGroupFile[1]}`;

  const matchedConversationDescription = text.match(/^会按匹配到的会话生成 (.+)$/);
  if (matchedConversationDescription) return `A file will be generated for the matched conversation: ${translateText(language, matchedConversationDescription[1])}`;

  const perConversationDescription = text.match(/^每个联系人或群聊各生成一个 (.+)$/);
  if (perConversationDescription) return `One file will be generated per contact or group chat: ${translateText(language, perConversationDescription[1])}`;

  const selectedResultName = text.match(/^以“(.+)”命名(\.[a-z0-9]+)$/i);
  if (selectedResultName) return `Named with "${selectedResultName[1]}"${selectedResultName[2]}`;

  const filteredResultName = text.match(/^按匹配会话命名(\.[a-z0-9]+)$/i);
  if (filteredResultName) return `Named from the matched conversation${filteredResultName[1]}`;

  const conversationResultName = text.match(/^按联系人或群聊命名(\.[a-z0-9]+)$/i);
  if (conversationResultName) return `Named by contact or group chat${conversationResultName[1]}`;

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
