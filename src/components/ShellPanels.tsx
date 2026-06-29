import type { ReactNode, RefObject } from "react";
import {
  Archive,
  CheckCircle2,
  Clipboard,
  Database,
  Info,
  Loader2,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";

import type { AppLanguage } from "../i18n";
import type { BackupCandidate, EnvironmentStatus } from "../types";

export type SettingsSaveState = "saved" | "saving" | "failed" | "cleared";
export type AppTheme = "system" | "light" | "dark";

export function TopBar({
  activeSectionLabel,
  backup,
  exportPath,
  running,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
  onOpenOnboarding,
  onboardingButtonRef,
  onOpenAbout,
  aboutButtonRef,
  onOpenEnvironmentDetails,
  environmentDetailsButtonRef,
}: {
  activeSectionLabel: string;
  backup?: BackupCandidate;
  exportPath: string;
  running: boolean;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  onOpenOnboarding: () => void;
  onboardingButtonRef?: RefObject<HTMLButtonElement>;
  onOpenAbout: () => void;
  aboutButtonRef?: RefObject<HTMLButtonElement>;
  onOpenEnvironmentDetails: () => void;
  environmentDetailsButtonRef?: RefObject<HTMLButtonElement>;
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <div>
          <span className="workspace-kicker">Export Workspace</span>
          <h2>{activeSectionLabel}</h2>
        </div>
        <div className="topbar-utilities" aria-label="界面设置">
          <button className="guide-chip" type="button" onClick={onOpenOnboarding} ref={onboardingButtonRef}>
            <Info size={15} />
            设置向导
          </button>
          <button className="guide-chip" type="button" onClick={onOpenAbout} ref={aboutButtonRef}>
            <Info size={15} />
            关于
          </button>
          <button className="guide-chip" type="button" onClick={onOpenEnvironmentDetails} ref={environmentDetailsButtonRef}>
            <Monitor size={15} />
            运行环境
          </button>
          <LanguageToggle language={language} onChange={onLanguageChange} />
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
      </div>
      <div className="quick-stats" aria-label="当前导出状态">
        <QuickStat icon={<Database size={16} />} label="备份" value={backup?.displayName ?? "未选择"} tone={backup?.valid ? "ok" : "neutral"} />
        <QuickStat icon={<Archive size={16} />} label="输出" value={exportPath ? compactPath(exportPath) : "未设置"} tone={exportPath ? "ok" : "neutral"} />
        <QuickStat icon={running ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} label="任务" value={running ? "运行中" : "空闲"} tone={running ? "accent" : "neutral"} />
      </div>
    </header>
  );
}

export function ResourceLinks({
  onOpenResource,
}: {
  onOpenResource: (file: "license" | "thirdPartyNotices") => void;
}) {
  return (
    <div className="resource-links" aria-label="开源与版本资料">
      <button type="button" onClick={() => onOpenResource("license")}>
        GPL 许可证
      </button>
      <button type="button" onClick={() => onOpenResource("thirdPartyNotices")}>
        第三方声明
      </button>
    </div>
  );
}

export function compactPath(path: string) {
  if (path.length <= 32) return path;
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return path.slice(0, 29) + "...";
  return `${parts[0]}/.../${parts[parts.length - 1]}`;
}

function QuickStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "accent" | "neutral";
}) {
  return (
    <div className={`quick-stat ${tone}`}>
      <span className="quick-stat-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function LanguageToggle({ language, onChange }: { language: AppLanguage; onChange: (language: AppLanguage) => void }) {
  return (
    <div className="language-toggle" aria-label="Language">
      <button className={language === "en" ? "selected" : ""} type="button" onClick={() => onChange("en")} aria-label="English" aria-pressed={language === "en"}>
        EN
      </button>
      <button className={language === "zh-CN" ? "selected" : ""} type="button" onClick={() => onChange("zh-CN")} aria-label="中文" aria-pressed={language === "zh-CN"}>
        中文
      </button>
    </div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: AppTheme; onChange: (theme: AppTheme) => void }) {
  const options: Array<{ value: AppTheme; label: string; icon: ReactNode }> = [
    { value: "system", label: "系统", icon: <Monitor size={15} /> },
    { value: "light", label: "浅色", icon: <Sun size={15} /> },
    { value: "dark", label: "深色", icon: <Moon size={15} /> },
  ];

  return (
    <div className="theme-toggle" aria-label="主题">
      {options.map((option) => (
        <button
          aria-label={option.label}
          className={theme === option.value ? "selected" : ""}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={theme === option.value}
          title={option.label}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

export function EnvironmentFixList({ environment, onCopy }: { environment?: EnvironmentStatus; onCopy: (value: string) => void }) {
  const fixes = environmentFixes(environment);
  if (!fixes.length) return null;

  return (
    <div className="env-fix-list" aria-label="环境修复建议">
      <strong>缺失项处理</strong>
      {fixes.map((fix) => (
        <div className="env-fix-item" key={fix.command}>
          <span>
            <small>{fix.label}</small>
            <code>{fix.command}</code>
          </span>
          <button className="ghost-button" type="button" onClick={() => onCopy(fix.command)}>
            <Clipboard size={14} />
            复制
          </button>
        </div>
      ))}
    </div>
  );
}

function environmentFixes(environment?: EnvironmentStatus): Array<{ label: string; command: string }> {
  if (!environment) return [];
  const fixes: Array<{ label: string; command: string }> = [];
  if (!environment.ffmpegAvailable || !environment.imagemagickAvailable) {
    fixes.push({
      label: "安装 basic/full 附件转换器",
      command: ".\\scripts\\setup-windows.ps1 -Install -InstallOptionalTools",
    });
  }

  return fixes;
}

export function settingsStateLabel(state: SettingsSaveState): string {
  if (state === "saving") return "正在保存设置";
  if (state === "failed") return "设置保存失败";
  if (state === "cleared") return "已清除保存设置";
  return "设置已保存";
}
