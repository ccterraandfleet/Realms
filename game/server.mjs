/**
 * Static host for the Realms client. Serves the built game plus its source,
 * so the same process can later run the authoritative sim for the one
 * persistent world.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 10000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ts": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const send = (res, code, body, type) => {
  res.writeHead(code, { "content-type": type, "cache-control": "public, max-age=300" });
  res.end(body);
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
    let path = decodeURIComponent(url.pathname);
    if (path === "/" || path.endsWith("/")) path += "index.html";
    // Keep requests inside the served directory.
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) return send(res, 403, "forbidden", "text/plain");
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) return send(res, 404, "not found", "text/plain");
    const body = await readFile(file);
    send(res, 200, body, TYPES[extname(file)] ?? "application/octet-stream");
  } catch {
    send(res, 500, "error", "text/plain");
  }
}).listen(PORT, () => console.log(`Realms listening on ${PORT}`));
