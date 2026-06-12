import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const indexHtml = join(dist, "index.html");
const host = process.env.MOCK_PREVIEW_HOST || "127.0.0.1";
const port = Number(process.env.MOCK_PREVIEW_PORT || process.env.PORT || 4173);

if (!existsSync(indexHtml)) {
  console.error("dist/index.html was not found. Run npm run build first.");
  process.exit(1);
}

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

const server = createServer((request, response) => {
  const file = resolveRequestPath(request.url ?? "/");
  if (!file) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const contentType = mimeTypes.get(extname(file).toLowerCase()) ?? "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Serving dist at http://${host}:${port}/?mock=1`);
});

function resolveRequestPath(rawUrl) {
  const distRoot = resolve(dist);
  const url = new URL(rawUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? indexHtml : resolve(join(dist, pathname));
  const normalizedRoot = `${distRoot}${sep}`.toLowerCase();
  const normalizedRequested = requested.toLowerCase();

  if (requested !== distRoot && !normalizedRequested.startsWith(normalizedRoot)) {
    return undefined;
  }

  if (existsSync(requested)) {
    return statSync(requested).isDirectory() ? indexHtml : requested;
  }

  return indexHtml;
}
