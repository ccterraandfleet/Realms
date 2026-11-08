/**
 * Realms world host.
 *
 * Runs the simulation as a process instead of in a browser tab: it ticks the
 * world at real time whether or not anyone is watching, saves to disk, and
 * serves the game to a browser that joins as a client. That is what makes the
 * world "always live" and what makes a closed tab a pause rather than a stop.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "./sim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");
const SEED = Number(process.env.REALMS_SEED ?? 7);
const PORT = Number(process.env.REALMS_PORT ?? 8081);
const STEP = 0.1;             // sim seconds per tick
const TICK_MS = 100;          // real ms per tick: 1 sim second per real second
const SAVE_MS = 5000;
const WORLD_FILE = path.join(HERE, `world-${SEED}.json`);

let game = new Game(SEED);
game.startMultiplayer(2);
let code = "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/* ---------------- world lifecycle ---------------- */

function newCode(seed) {
  // A stable four-character code per seed, so the same world always answers to
  // the same name and the client's /room= links keep working.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = Math.abs(Math.floor(seed * 2654435761)) % (34 ** 4);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return out;
}

function save() {
  try {
    const tmp = WORLD_FILE + ".tmp";
    fs.writeFileSync(tmp, game.snapshot());
    fs.renameSync(tmp, WORLD_FILE);
  } catch (err) {
    console.error("save failed:", err.message);
  }
}

function load() {
  if (!fs.existsSync(WORLD_FILE)) return false;
  try {
    game.applySnapshot(fs.readFileSync(WORLD_FILE, "utf8"));
    return true;
  } catch (err) {
    console.error("world file unusable, starting fresh:", err.message);
    return false;
  }
}

function startWorld(seed) {
  // A world is built from its seed, so starting over means building a new one.
  game = new Game(seed);
  game.startMultiplayer(2);
  code = newCode(seed);
  startedAt = Date.now();
  save();
}

let startedAt = Date.now();

if (load()) {
  code = newCode(SEED);
  startedAt = Date.now() - Math.round((game.time / 1) * 1000);
  console.log(`resumed world ${code} at ${game.time.toFixed(0)}s, seed ${SEED}`);
} else {
  // A world needs a starting castle before it can tick meaningfully; the player
  // picks one in the browser, exactly as before.
  code = newCode(SEED);
  console.log(`world ${code} waiting for a castle, seed ${SEED}`);
}

game.phase = game.phase ?? "spawn";

/* ---------------- intents ---------------- */

let intents = [];
let intentSeq = 0;
let servedIntents = 0;

function applyIntent(it) {
  const p = game.players[it.player];
  if (!p || !p.alive) return;
  const d = it.data ?? {};
  if (d.kind === "identity") {
    if (typeof d.name === "string") p.name = String(d.name).slice(0, 18);
    if (typeof d.color === "string") p.color = String(d.color);
    return;
  }
  if (d.kind === "order") game.orderArmy(p, d.tile, d.ratio ?? 0.3);
  else if (d.kind === "armyMove") game.moveArmy(p, d.home, d.tile);
  else if (d.kind === "camp") game.establishCamp(p, d.home);
  else if (d.kind === "pull") game.withdrawArmy(p, d.home);
  else if (d.kind === "tier") game.upgradeHost(p, d.home);
  else if (d.kind === "regroup") game.orderToCity(p, d.home, d.city);
  else if (d.kind === "build") game.build(p, d.k, d.tile);
  else if (d.kind === "start") {
    if (game.phase === "spawn") game.chooseStart(d.tile);
  }
}

/* ---------------- ticking ---------------- */

let lastTickAt = Date.now();
function tick() {
  const now = Date.now();
  const elapsed = Math.min(1, (now - lastTickAt) / 1000);
  lastTickAt = now;
  const steps = Math.max(1, Math.round((elapsed * 1000) / TICK_MS));
  for (let i = 0; i < steps; i++) {
    const batch = intents.splice(0, intents.length);
    for (const it of batch) applyIntent(it);
    if (game.phase === "playing") game.tick(STEP);
  }
}
setInterval(tick, TICK_MS);
setInterval(save, SAVE_MS);

process.on("SIGINT", () => { save(); process.exit(0); });
process.on("SIGTERM", () => { save(); process.exit(0); });

/* ---------------- http ---------------- */

function json(res, body, status = 200) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 40_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function serveStatic(req, res, url) {
  // Land straight in this world: the page is served with the room in its address
  // so the client joins the running world instead of creating a new one, and a
  // reload stays where it was.
  if (url.pathname === "/" && !url.searchParams.get("room")) {
    res.writeHead(302, { location: `/?seed=${SEED}&room=${code}` });
    res.end();
    return;
  }
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const type = MIME[path.extname(file)] ?? "application/octet-stream";
  if (type.startsWith("text/html")) {
    // Point the client at this host instead of the internet relay, and never let
    // the browser cache the page: a stale page is the bug that cost a playthrough.
    let html = fs.readFileSync(file, "utf8");
    html = html.replace(
      "<head>",
      `<head>\n    <script>window.__REALMS_RELAY = ${JSON.stringify(`http://127.0.0.1:${PORT}`)};</script>`,
    );
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(html);
    return;
  }
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  // The client posts to /functions/<name>; strip the prefix so both the relay
  // and the lobby answer here.
  const fn = url.pathname.replace(/^\/functions\//, "");

  if (req.method === "POST" && fn === "realmsRelay") {
    const body = await readBody(req);
    switch (body.action) {
      case "view":
        save();
        json(res, { state: game.snapshot(), tick: Math.round(game.time * 10) });
        return;
      case "snap":
        // The server is the authority; a client snapshot is ignored on purpose.
        json(res, { ok: true });
        return;
      case "post": {
        intents.push({ id: `i${++intentSeq}`, player: body.player ?? 0, tick: body.tick ?? 0, at: Date.now(), data: body.data ?? {} });
        json(res, { ok: true });
        return;
      }
      case "poll": {
        const out = intents.slice(servedIntents);
        servedIntents = intents.length;
        json(res, { intents: [] }); // nobody else needs the queue
        return;
      }
      case "create":
        startWorld(Number(body.seed ?? SEED));
        json(res, { code, seed: SEED });
        return;
      case "room":
        json(res, { code, seed: SEED, createdAt: startedAt });
        return;
      default:
        json(res, { ok: false, error: "unknown action" }, 400);
        return;
    }
  }

  if (req.method === "POST" && fn === "realmsLobby") {
    const body = await readBody(req);
    const room = { code, seed: SEED, host: false, startedAt, ageMs: Date.now() - startedAt };
    if (body.action === "create") {
      startWorld(Number(body.seed ?? SEED));
      json(res, { ...room, code, startedAt });
      return;
    }
    if (body.action === "current" || body.action === "byCode" || body.action === "open") {
      json(res, body.action === "current" ? { room } : room);
      return;
    }
    json(res, { ok: false }, 400);
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, {
      ok: true,
      code,
      seed: SEED,
      phase: game.phase,
      time: Math.round(game.time),
      realms: game.players.filter((p) => p.alive).length,
      armies: game.armies.length,
      convoys: game.convoys.length,
      saved: fs.existsSync(WORLD_FILE),
    });
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Realms world host on http://127.0.0.1:${PORT}/ · world ${code} · seed ${SEED}`);
});
