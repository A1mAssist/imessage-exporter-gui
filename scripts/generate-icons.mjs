import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceIcon = join(root, "app-icon.png");
const outputDir = join(root, "src-tauri", "icons");
const tauriBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "tauri.cmd" : "tauri");

if (!existsSync(sourceIcon)) {
  console.error(`Missing source icon: ${sourceIcon}`);
  process.exit(1);
}

if (!existsSync(tauriBin)) {
  console.error("Missing Tauri CLI. Run `npm install` before generating icons.");
  process.exit(1);
}

const result = spawnSync(tauriBin, ["icon", sourceIcon, "--output", outputDir], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
