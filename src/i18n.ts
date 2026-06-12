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
  "导出步骤": "Export steps",
  "无法检查输出目录，请重新选择或确认权限。": "Could not inspect the output folder. Choose it again or check permissions.",
  "输出目录已有内容或疑似旧导出文件。继续导出会把新结果写入同一个目录，是否继续？": "The output folder already has files or looks like an old export. Continue writing the new export into this folder?",
  "输出路径已存在，但它不是文件夹。": "The output path already exists, but it is not a folder.",
  "输出目录的上级目录不存在，请重新选择。": "The parent folder for the output folder does not exist. Choose another location.",
  "归档目录的上级目录不存在，请先重新选择输出位置。": "The parent folder for the archive folder does not exist. Choose another output location first.",
  "无法生成未占用的归档目录，请手动选择新的输出目录。": "Could not generate an unused archive folder. Choose a new output folder manually.",
  "缺少 imessage-exporter sidecar，暂时不能开始导出。": "The imessage-exporter sidecar is missing, so export cannot start yet.",
  "缺少 imessage-exporter sidecar，暂时不能运行诊断。": "The imessage-exporter sidecar is missing, so diagnostics cannot run yet.",
  "请选择 iOS 备份根目录。": "Choose the iOS backup root folder.",
  "备份目录需要同时包含 Manifest.db 和 Info.plist。": "The backup folder must contain both Manifest.db and Info.plist.",
  "开始导出后可查看结果。": "Results are available after export starts.",
  "尚未开始": "Not started",
  "任务已停止。可以调整选项后重新运行，已有日志会保留在本页。": "The task was stopped. You can adjust options and run it again; existing logs stay on this page.",
  "请查看 stderr/stdout 日志。": "Check the stderr/stdout logs.",
  "修正备份路径、密码、输出目录或转换器环境后重试。": "Fix the backup path, password, output folder, or converter environment, then retry.",
  "Export Workspace": "Export Workspace",
  "当前导出状态": "Current export status",
  "备份": "Backup",
  "未选择": "Not selected",
  "输出": "Output",
  "未设置": "Not set",
  "Sidecar": "Sidecar",
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
  "Mock 模式：未调用真实 sidecar。basic/full 附件转换仍会显示依赖提示。": "Mock mode: no real sidecar is called. basic/full attachment conversion still shows dependency hints.",
  "Mock 模式：模拟 sidecar 缺失，诊断和导出会被禁用。": "Mock mode: simulating a missing sidecar, so diagnostics and export are disabled.",
  "仅保存路径和导出选项，不保存备份密码": "Only paths and export options are saved. Backup passwords are never saved.",
  "清除": "Clear",
  "开源与版本资料": "Open-source and version resources",
  "GPL 许可证": "GPL License",
  "第三方声明": "Third-party notices",
  "Sidecar 版本": "Sidecar version",
  "环境修复建议": "Environment fixes",
  "缺失项处理": "Missing items",
  "构建内置导出引擎": "Build bundled export engine",
  "安装 basic/full 附件转换器": "Install basic/full attachment converters",
  "复制": "Copy",
  "正在保存设置": "Saving settings",
  "设置保存失败": "Could not save settings",
  "已清除保存设置": "Saved settings cleared",
  "设置已保存": "Settings saved",
  "选择 iOS 备份": "Choose iOS Backup",
  "从 Apple Devices 或 iTunes 的本地备份导出 Messages 数据，不修改原始备份。": "Export Messages data from a local Apple Devices or iTunes backup without modifying the original backup.",
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
  "导出引擎": "Export Engine",
  "正在检查": "Checking",
  "已就绪": "Ready",
  "缺少 sidecar，开发环境运行 scripts/build-sidecar.ps1": "Sidecar missing. In a development environment, run scripts/build-sidecar.ps1.",
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
  "就绪检查": "Readiness Checks",
  "重新检查": "Check Again",
  "诊断备份": "Diagnose Backup",
  "先让 imessage-exporter 检查数据库、附件、联系人和转换器状态。": "Let imessage-exporter check the database, attachments, contacts, and converter status first.",
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
  "输出目录": "Output Folder",
  "新建归档目录": "New Archive Folder",
  "生成带时间戳的新文件夹，避免导出结果混入旧目录。": "Generate a timestamped folder so new exports do not mix with old files.",
  "格式": "Format",
  "Windows 第一版建议使用 clone；basic/full 依赖本机转换器。": "For the first Windows version, clone is recommended; basic/full depend on local converters.",
  "开始日期": "Start Date",
  "结束日期": "End Date",
  "会话筛选": "Conversation Filter",
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

  const withCode = text.match(/^(诊断|导出)(运行中|完成|已取消|失败)(?:，代码 (.+))?$/);
  if (withCode) {
    const action = withCode[1] === "诊断" ? "Diagnostics" : "Export";
    const state = withCode[2];
    const stateText = state === "运行中" ? "running" : state === "完成" ? "complete" : state === "已取消" ? "cancelled" : "failed";
    return withCode[3] ? `${action} ${stateText}, code ${withCode[3]}` : `${action} ${stateText}`;
  }

  const exit = text.match(/^进程退出，代码 (.+)$/);
  if (exit) return `Process exited, code ${exit[1]}`;

  const copiedPath = text.match(/^复制结果路径: (.+)$/);
  if (copiedPath) return `Copy result path: ${copiedPath[1]}`;

  const copiedFullPath = text.match(/^复制完整(.+): (.+)$/);
  if (copiedFullPath) return `Copy full ${translateText(language, copiedFullPath[1]).toLowerCase()}: ${copiedFullPath[2]}`;

  const chooseLabel = text.match(/^选择(.+)$/);
  if (chooseLabel) return `Choose ${translateText(language, chooseLabel[1])}`;

  const items = text.match(/^已有 (.+) 个项目。继续导出前建议确认这些文件可以保留。$/);
  if (items) return `${items[1]} item(s) already exist. Confirm these files can stay before continuing.`;

  const messages = text.match(/^(.+) 条消息$/);
  if (messages) return `${messages[1]} messages`;

  const attachments = text.match(/^(.+) 个附件$/);
  if (attachments) return `${attachments[1]} attachments`;

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
