import type { CopyMethod, ExportConfig, ExportFormat } from "../types";

export type ExportPresetId = "quickArchive" | "textLite" | "printReady";

export type ExportPreset = {
  id: ExportPresetId;
  label: string;
  description: string;
  settings: {
    format: ExportFormat;
    copyMethod: CopyMethod;
    noLazy: boolean;
  };
};

export const exportPresets: ExportPreset[] = [
  {
    id: "quickArchive",
    label: "快速归档",
    description: "HTML + clone，保留附件引用，适合第一轮完整导出。",
    settings: { format: "html", copyMethod: "clone", noLazy: false },
  },
  {
    id: "textLite",
    label: "轻量文本",
    description: "TXT + disabled，只导出文本，便于长期保存和搜索。",
    settings: { format: "txt", copyMethod: "disabled", noLazy: false },
  },
  {
    id: "printReady",
    label: "打印准备",
    description: "HTML + clone + no-lazy，方便后续用浏览器打印为 PDF。",
    settings: { format: "html", copyMethod: "clone", noLazy: true },
  },
];

export function applyExportPreset(config: ExportConfig, presetId: ExportPresetId): ExportConfig {
  const preset = exportPresets.find((candidate) => candidate.id === presetId);
  if (!preset) return config;

  return {
    ...config,
    ...preset.settings,
  };
}
