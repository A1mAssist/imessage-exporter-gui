import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const root = fileURLToPath(new URL("..", import.meta.url));
const iconDir = join(root, "src-tauri", "icons");

mkdirSync(iconDir, { recursive: true });

const sizes = [32, 128, 256];
const pngs = sizes.map((size) => ({
  size,
  bytes: drawIcon(size),
}));

for (const { size, bytes } of pngs) {
  const name = size === 256 ? "128x128@2x.png" : `${size}x${size}.png`;
  writeFileSync(join(iconDir, name), bytes);
}

writeFileSync(join(iconDir, "icon.ico"), makeIco(pngs));
console.log(`Generated icons in ${iconDir}`);

function drawIcon(size) {
  const png = new PNG({ width: size, height: size });
  const radius = size * 0.22;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = y / Math.max(1, size - 1);
      const base = mix([9, 117, 125], [13, 144, 137], t);
      const glow = Math.max(0, 1 - distance(x, y, size * 0.28, size * 0.22) / (size * 0.82));
      const color = mix(base, [90, 198, 180], glow * 0.22);
      setPixel(png, x, y, [...color, roundedAlpha(x, y, size, radius)]);
    }
  }

  drawBubble(png, size);
  drawArrow(png, size);

  return PNG.sync.write(png);
}

function drawBubble(png, size) {
  const x0 = size * 0.22;
  const y0 = size * 0.27;
  const w = size * 0.48;
  const h = size * 0.34;
  const r = size * 0.08;

  fillRoundRect(png, x0, y0, w, h, r, [255, 255, 255, 238]);
  fillTriangle(
    png,
    [size * 0.36, size * 0.58],
    [size * 0.29, size * 0.73],
    [size * 0.48, size * 0.60],
    [255, 255, 255, 238],
  );
}

function drawArrow(png, size) {
  const color = [255, 255, 255, 245];
  const x = size * 0.69;
  const y = size * 0.45;
  const stemW = Math.max(2, size * 0.08);
  const stemH = size * 0.25;
  fillRoundRect(png, x - stemW / 2, y, stemW, stemH, stemW / 2, color);
  fillTriangle(
    png,
    [x, size * 0.78],
    [x - size * 0.14, size * 0.63],
    [x + size * 0.14, size * 0.63],
    color,
  );
}

function fillRoundRect(png, x0, y0, w, h, r, color) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y += 1) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x += 1) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
      const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
      if (dx * dx + dy * dy <= r * r) alphaBlend(png, x, y, color);
    }
  }
}

function fillTriangle(png, a, b, c, color) {
  const minX = Math.floor(Math.min(a[0], b[0], c[0]));
  const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
  const minY = Math.floor(Math.min(a[1], b[1], c[1]));
  const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInTriangle([x, y], a, b, c)) alphaBlend(png, x, y, color);
    }
  }
}

function pointInTriangle(p, a, b, c) {
  const area = sign(p, a, b);
  const b1 = area < 0;
  const b2 = sign(p, b, c) < 0;
  const b3 = sign(p, c, a) < 0;
  return b1 === b2 && b2 === b3;
}

function sign(p1, p2, p3) {
  return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
}

function roundedAlpha(x, y, size, radius) {
  const dx = Math.max(radius - x, 0, x - (size - radius));
  const dy = Math.max(radius - y, 0, y - (size - radius));
  if (dx * dx + dy * dy <= radius * radius) return 255;
  return 0;
}

function alphaBlend(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  const alpha = color[3] / 255;
  png.data[idx] = Math.round(color[0] * alpha + png.data[idx] * (1 - alpha));
  png.data[idx + 1] = Math.round(color[1] * alpha + png.data[idx + 1] * (1 - alpha));
  png.data[idx + 2] = Math.round(color[2] * alpha + png.data[idx + 2] * (1 - alpha));
  png.data[idx + 3] = Math.max(png.data[idx + 3], color[3]);
}

function setPixel(png, x, y, color) {
  const idx = (png.width * y + x) << 2;
  png.data[idx] = color[0];
  png.data[idx + 1] = color[1];
  png.data[idx + 2] = color[2];
  png.data[idx + 3] = color[3];
}

function mix(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function makeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const directories = [];
  for (const entry of entries) {
    const directory = Buffer.alloc(16);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1);
    directory.writeUInt8(0, 2);
    directory.writeUInt8(0, 3);
    directory.writeUInt16LE(1, 4);
    directory.writeUInt16LE(32, 6);
    directory.writeUInt32LE(entry.bytes.length, 8);
    directory.writeUInt32LE(offset, 12);
    directories.push(directory);
    offset += entry.bytes.length;
  }

  return Buffer.concat([header, ...directories, ...entries.map((entry) => entry.bytes)]);
}
