import type { LogLine } from "../types";

export type RecoveryCategory = "password" | "backup" | "permission" | "sidecar" | "converter" | "generic";

export type RecoveryHint = {
  category: RecoveryCategory;
  title: string;
  detail: string;
  action: string;
};

export function recoveryHintForFailure(logs: LogLine[], outcomeMessage?: string): RecoveryHint {
  const text = [outcomeMessage, ...logs.map((line) => line.text)].filter(Boolean).join("\n");
  const lower = text.toLowerCase();

  if (matches(lower, ["password", "passphrase", "passcode", "decrypt", "decryption", "incorrect password", "wrong password", "密码"])) {
    return {
      category: "password",
      title: "备份密码可能不正确",
      detail: "imessage-exporter 没能解密备份数据库。请确认这是创建 iOS 备份时使用的加密备份密码。",
      action: "回到数据源，重新输入备份密码后再运行诊断或导出。",
    };
  }

  if (matches(lower, ["manifest.db", "info.plist", "backup is incomplete", "incomplete backup", "chat.db", "sms.db", "not a valid backup", "备份不完整"])) {
    return {
      category: "backup",
      title: "备份目录不完整",
      detail: "当前目录不像完整的 iOS 备份根目录，或关键数据库文件不可读。",
      action: "重新选择包含 Manifest.db 和 Info.plist 的备份根目录，必要时用 Apple Devices 或 iTunes 重新备份。",
    };
  }

  if (matches(lower, ["permission denied", "access is denied", "eacces", "eperm", "read-only", "failed to create", "cannot create", "拒绝访问", "权限"])) {
    return {
      category: "permission",
      title: "输出目录权限不足",
      detail: "导出进程无法写入当前输出目录，或该目录被系统/同步软件锁定。",
      action: "换到 Documents 下的新归档目录，或确认当前用户对输出目录有写入权限。",
    };
  }

  if (matches(lower, ["sidecar", "imessage-exporter not found", "program not found", "spawn", "enoent", "找不到 imessage-exporter"])) {
    return {
      category: "sidecar",
      title: "缺少导出引擎",
      detail: "GUI 没能启动内置的 imessage-exporter sidecar。",
      action: "在 GitHub Actions 里重新打包，或在本机完成 sidecar 构建后再运行桌面版。",
    };
  }

  if (matches(lower, ["ffmpeg", "imagemagick", "magick", "converter", "convert attachment", "转换器"])) {
    return {
      category: "converter",
      title: "附件转换器缺失",
      detail: "basic/full 附件策略需要 ffmpeg 和 ImageMagick，当前环境无法完成转换。",
      action: "改用 clone 附件策略，或安装 ffmpeg 与 ImageMagick 后重试。",
    };
  }

  return {
    category: "generic",
    title: "任务失败",
    detail: "日志没有匹配到已知错误类型。",
    action: "查看 stderr/stdout 的最后几行，修正路径、密码或环境后重试。",
  };
}

function matches(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}
