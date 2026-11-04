/**
 * Realms boot + input + HUD.
 *
 * Double left click: launch an advance toward that point. Build buttons or Q/W/E/R:
 * place a structure on your own ground. Wheel zooms, right-drag or space-drag
 * pans. The whole world is a seed, so "New world" is just another number.
 */

import { Camera, Renderer } from "./render/renderer";
import { BUILD, Bundle, Game, PALETTE, STRUCTURE_LABEL, StructureKind } from "./sim/game";
import { OCEAN } from "./sim/world";
import * as net from "./net";
import { badgeDataUrl } from "./faction";
import { openLobby } from "./lobby";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 7) || 7;
/** A room in the URL means shared world; host creates, the other joins. */
const roomParam = (params.get("room") ?? "").toUpperCase();
let isHost = !roomParam;
let isGuest = Boolean(roomParam);
let roomCode = "";
let localPlayer = isHost ? 0 : 1;
let lastIntentAt = 0;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const game = new Game(seed);
const renderer = new Renderer(canvas, game);

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statGrain = el("stat-grain");
const statTimber = el("stat-timber");
const statOre = el("stat-ore");
const statGold = el("stat-gold");
const statTroops = el("stat-troops");
const statLand = el("stat-land");
const statCastles = el("stat-castles");
const statLords = el("stat-lords");
const logEl = el("log");
const spawnOverlay = el("spawn-overlay");
const endOverlay = el("end-overlay");
const endTitle = el("end-title");
const endBody = el("end-body");
const ratioInput = el<HTMLInputElement>("ratio");
const ratioVal = el("ratio-val");
const seedBadge = el("seed-badge");

seedBadge.textContent = `seed ${seed}`;

let dpr = Math.min(2, window.devicePixelRatio || 1);
const cam: Camera = { x: 0, y: 0, scale: 4 };
let hover = -1;
let buildKind: StructureKind | null = null;

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
window.addEventListener("resize", resize);
resize();

function fitWorld() {
  const fit = Math.min(window.innerWidth / game.world.w, window.innerHeight / game.world.h);
  cam.scale = Math.max(1.2, fit);
  cam.x = (window.innerWidth - game.world.w * cam.scale) / 2;
  cam.y = (window.innerHeight - game.world.h * cam.scale) / 2;
}
fitWorld();

function clampCamera() {
  const mw = game.world.w * cam.scale;
  const mh = game.world.h * cam.scale;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  cam.x = mw <= vw ? (vw - mw) / 2 : Math.min(0, Math.max(vw - mw, cam.x));
  cam.y = mh <= vh ? (vh - mh) / 2 : Math.min(0, Math.max(vh - mh, cam.y));
}

function screenToTile(px: number, py: number): number {
  const x = Math.floor((px - cam.x) / cam.scale);
  const y = Math.floor((py - cam.y) / cam.scale);
  return game.tileAt(x, y);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

let panning = false;
let cameFromPan = false;
let panStart = { x: 0, y: 0, cx: 0, cy: 0 };
let spaceDown = false;

const keys: Record<string, StructureKind> = {
  q: "castle",
  w: "farm",
  e: "lumber",
  r: "mine",
  t: "market",
  y: "tower",
  u: "siege",
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceDown = true;
  const k = e.key.toLowerCase();
  if (keys[k]) {
    buildKind = buildKind === keys[k] ? null : keys[k];
    syncBuildButtons();
    e.preventDefault();
  }
  if (e.key === "Escape") {
    buildKind = null;
    syncBuildButtons();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceDown = false;
});

const DOUBLE_MS = 340;   // two clicks within this window are one order
const DOUBLE_PX = 26;    // ...if they land on the same spot
const lastClick = { at: 0, x: 0, y: 0 };

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 1 || e.button === 2 || spaceDown) {
    panning = true;
    cameFromPan = false;
    panStart = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
    return;
  }
  cameFromPan = false;
  const tile = screenToTile(e.clientX, e.clientY);
  hover = tile;
  // Placing your capital and placing a building are still single clicks.
  if (game.phase === "spawn" || buildKind) {
    click(tile);
    return;
  }
  // Everything else is deliberate: two quick left clicks on the same spot
  // collect an advance toward it. A lone click only selects and reads.
  const now = performance.now();
  const near = Math.abs(e.clientX - lastClick.x) <= DOUBLE_PX && Math.abs(e.clientY - lastClick.y) <= DOUBLE_PX;
  if (now - lastClick.at <= DOUBLE_MS && near) {
    lastClick.at = 0;
    attack(tile);
  } else {
    lastClick.at = now;
    lastClick.x = e.clientX;
    lastClick.y = e.clientY;
  }
});

canvas.addEventListener("pointermove", (e) => {
  hover = screenToTile(e.clientX, e.clientY);
  if (panning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) cameFromPan = true;
    cam.x = panStart.cx + dx;
    cam.y = panStart.cy + dy;
    clampCamera();
    return;
  }
});

canvas.addEventListener("pointerup", (e) => {
  panning = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* pointer already released */
  }
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0016);
    const next = Math.max(1.1, Math.min(26, cam.scale * factor));
    // Zoom toward the cursor.
    const wx = (e.clientX - cam.x) / cam.scale;
    const wy = (e.clientY - cam.y) / cam.scale;
    cam.scale = next;
    cam.x = e.clientX - wx * cam.scale;
    cam.y = e.clientY - wy * cam.scale;
    clampCamera();
  },
  { passive: false },
);

function click(tile: number) {
  if (tile < 0) return;
  const me = game.players[game.human];
  if (game.phase === "spawn") {
    if (game.chooseStart(tile)) {
      spawnOverlay.classList.add("hidden");
      const [x, y] = [tile % game.world.w, (tile / game.world.w) | 0];
      cam.scale = 7;
      cam.x = window.innerWidth / 2 - x * cam.scale;
      cam.y = window.innerHeight / 2 - y * cam.scale;
      clampCamera();
      log(`Your castle stands. ${game.players.length - 1} rival lords have risen.`);
    }
    return;
  }
  if (!me) return;
  if (buildKind) {
    if (isGuest) {
      void net.postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "build", k: buildKind, tile });
      return;
    }
    if (!game.build(me, buildKind, tile)) {
      const why = game.blockReason(me, buildKind, tile);
      if (why) log(`Cannot build there: ${why}.`);
      else log(`Not enough resources for a ${STRUCTURE_LABEL[buildKind].toLowerCase()}.`);
    }
    return;
  }
  // A single click in play does not commit anything; it is a read of the
  // ground under the cursor. The double click above sends the advance.
}

function attack(tile: number) {
  const me = game.players[game.human];
  if (!me || game.phase !== "playing") return;
  const ratio = Number(ratioInput.value) / 100;
  if (isGuest) {
    void net.postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "order", tile, ratio });
    return;
  }
  const ok = game.orderArmy(me, tile, ratio);
  if (!ok && game.ownerAt(tile) === me.id) log("That is already your ground.");
  else if (!ok && game.ownerAt(tile) === -1 && game.isLand(tile)) {
    log("Too far from your lands to plant a claim node.");
  }
}

ratioInput.addEventListener("input", () => {
  ratioVal.textContent = `${ratioInput.value}%`;
});

/* ------------------------------------------------------------------ */
/* Build bar                                                           */
/* ------------------------------------------------------------------ */

const BUILD_ORDER: StructureKind[] = ["castle", "farm", "lumber", "mine", "market", "tower", "siege"];
const BUILD_HINT: Partial<Record<StructureKind, string>> = {
  farm: "plains",
  lumber: "forest",
  mine: "mountains",
  market: "coast",
};

function hotkeyFor(kind: StructureKind) {
  for (const [k, v] of Object.entries(keys)) if (v === kind) return k.toUpperCase();
  return "";
}

function fmtCost(cost: Bundle) {
  const parts: string[] = [];
  if (cost.grain) parts.push(`<i class="r-grain">${cost.grain}gr</i>`);
  if (cost.timber) parts.push(`<i class="r-timber">${cost.timber}tm</i>`);
  if (cost.ore) parts.push(`<i class="r-ore">${cost.ore}or</i>`);
  if (cost.gold) parts.push(`<i class="r-gold">${cost.gold}au</i>`);
  return parts.join(" ");
}

const buildBarEl = el("build-bar");
buildBarEl.innerHTML = "";
for (const kind of BUILD_ORDER) {
  const b = document.createElement("button");
  b.dataset.kind = kind;
  const hint = BUILD_HINT[kind];
  b.innerHTML =
    `<span class="label">${STRUCTURE_LABEL[kind]}</span>` +
    `<span class="cost"></span>` +
    (hint ? `<span class="hint">${hint}</span>` : "") +
    `<span class="key">${hotkeyFor(kind)}</span>`;
  buildBarEl.appendChild(b);
}

const buildButtons = [...document.querySelectorAll<HTMLButtonElement>("#build-bar button")];
for (const b of buildButtons) {
  b.addEventListener("click", () => {
    const kind = b.dataset.kind as StructureKind;
    buildKind = buildKind === kind ? null : kind;
    syncBuildButtons();
  });
}

function syncBuildButtons() {
  for (const b of buildButtons) {
    b.classList.toggle("active", b.dataset.kind === buildKind);
  }
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

/** "1.2k  +0.55/s" — stock first, then the flow that decides the game. */
function flow(stock: number, rate: number): string {
  const sign = rate >= 0 ? "+" : "";
  return `${fmt(Math.max(0, stock))} ${sign}${rate.toFixed(2)}/s`;
}

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return Math.floor(n).toString();
}

function log(text: string) {
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = text;
  logEl.prepend(line);
  while (logEl.children.length > 6) logEl.lastElementChild!.remove();
}

function refreshHud() {
  const me = game.players[game.human];
  if (!me) return;
  statGrain.textContent = flow(me.grain, me.rates.grain);
  statTimber.textContent = flow(me.timber, me.rates.timber);
  statOre.textContent = flow(me.ore, me.rates.ore);
  statGold.textContent = flow(me.gold, me.rates.gold);
  statTroops.textContent = `${fmt(me.troops)} / ${fmt(game.capacity(me))}`;
  statLand.textContent = `${(game.landShare(me) * 100).toFixed(1)}%`;
  statCastles.textContent = `${me.castles}`;
  statTroops.classList.toggle("starving", me.starving);
  const alive = game.players.filter((p) => p.alive).length - 1;
  statLords.textContent = `${alive}`;

  for (const b of buildButtons) {
    const kind = b.dataset.kind as StructureKind;
    const cost = game.buildCost(kind, 1);
    b.classList.toggle("poor", !game.canAfford(me, cost));
    const costEl = b.querySelector(".cost");
    if (costEl) costEl.innerHTML = fmtCost(cost);
    b.classList.toggle("active", buildKind === kind);
  }

  if (game.phase === "over" && endOverlay.classList.contains("hidden")) {
    const won = game.winner === game.human;
    endTitle.textContent = won ? "The realm is yours" : "Your line has fallen";
    endBody.textContent = won
      ? `You hold ${(game.landShare(me) * 100).toFixed(1)}% of the land with ${me.castles} castles flying your banner.`
      : "Rival lords hold the field. Raise a new world and try again.";
    endOverlay.classList.remove("hidden");
  }
}

el("new-world").addEventListener("click", () => {
  location.href = `?seed=${seed + 1}`;
});

let lastHud = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // The guest renders the host's world; only the host advances the simulation.
  if (!isGuest) game.tick(dt);
  renderer.draw(cam, hover, buildKind, dpr);
  if (now - lastHud > 120) {
    lastHud = now;
    refreshHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ------------------------------------------------------------------ */
/* Shared world                                                        */
/* ------------------------------------------------------------------ */

function showNetbar(html: string) {
  let bar = document.getElementById("netbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "netbar";
    document.body.appendChild(bar);
  }
  bar.innerHTML = html;
}

async function boot() {
  // Matches snap to the minute. Both of you landing in the same minute compute
  // the same code, and the invite link carries it, so the link pins the match.
  const nextMinute = Math.ceil(Date.now() / 60000) * 60000;
  const joining = Boolean(roomParam);
  const matchCode = joining ? roomParam : net.minuteCode(nextMinute);
  const link = joining
    ? `${location.origin}${location.pathname}?seed=${seed}&room=${matchCode}`
    : `${location.origin}${location.pathname}?seed=${seed}&room=${matchCode}`;

  const faction = await openLobby({
    roomCode: matchCode,
    startAt: joining ? Date.now() : nextMinute,
    role: joining ? "guest" : "host",
    link,
  });

  isHost = !joining;
  isGuest = joining;
  roomCode = matchCode;
  localPlayer = isHost ? 0 : 1;

  game.startMultiplayer(2);
  game.human = localPlayer;
  spawnOverlay.classList.add("hidden");

  const mine = game.players[localPlayer];
  if (mine) {
    mine.name = faction.name;
    mine.color = faction.color;
  }
  if (isGuest) {
    void net.postIntent(roomCode, localPlayer, 0, {
      kind: "identity",
      name: faction.name,
      color: faction.color,
    });
  }
  showIdentity(faction);

  for (const st of game.structs.values()) {
    if (st.owner !== localPlayer || st.kind !== "castle") continue;
    cam.scale = 7;
    cam.x = window.innerWidth / 2 - (st.tile % game.world.w) * cam.scale;
    cam.y = window.innerHeight / 2 - ((st.tile / game.world.w) | 0) * cam.scale;
    clampCamera();
    break;
  }

  showNetbar(
    isHost
      ? `Match <b>${roomCode}</b> — send this to your friend: <code>${link}</code>`
      : `Match <b>${roomCode}</b> — joined as ${faction.name}`,
  );
  window.setInterval(isHost ? hostTick : guestTick, isHost ? 250 : 400);
  log(isHost ? `Match ${roomCode}. ${game.players.length - 2} rival lords are loose.` : `Joined match ${roomCode}.`);
}

/** Your badge, name and colour, pinned in the header so it is never ambiguous. */
function showIdentity(f: { name: string; color: string; shield: number; emblem: number; field: string; charge: string }) {
  const host = document.getElementById("you");
  if (!host) return;
  host.innerHTML = "";
  const img = document.createElement("img");
  img.src = badgeDataUrl(f as never, 40);
  img.alt = "";
  const name = document.createElement("span");
  name.className = "you-name";
  name.textContent = f.name;
  const tag = document.createElement("span");
  tag.className = "you-tag";
  tag.textContent = "YOU";
  tag.style.background = f.color;
  host.append(img, name, tag);
  host.title = `${f.name} — your realm`;
}

function hostTick() {
  void net
    .pollIntents(roomCode, lastIntentAt)
    .then((res) => {
      for (const it of res.intents ?? []) {
        if (it.at > lastIntentAt) lastIntentAt = it.at;
        const p = game.players[it.player];
        if (!p || !p.alive) continue;
        if (it.data.kind === "identity") {
          if (typeof it.data.name === "string") p.name = String(it.data.name).slice(0, 18);
          if (typeof it.data.color === "string") p.color = String(it.data.color);
          continue;
        }
        if (it.data.kind === "order") game.orderArmy(p, it.data.tile as number, (it.data.ratio as number) ?? 0.3);
        else if (it.data.kind === "build") game.build(p, it.data.k as StructureKind, it.data.tile as number);
      }
    })
    .catch(() => {});
  void net.postSnapshot(roomCode, Math.round(game.time * 10), game.snapshot()).catch(() => {});
}

function guestTick() {
  void net
    .getSnapshot(roomCode)
    .then((res) => {
      if (!res.state) return;
      game.applySnapshot(res.state);
      game.human = localPlayer;
    })
    .catch(() => {});
}

void boot();

// Test hook: lets a headless browser drive the same click path a player uses.
(window as unknown as Record<string, unknown>).__realms = {
  game,
  cam,
  renderer,
  clickTile: (t: number) => click(t),
  attackTile: (t: number) => attack(t),
  setBuild: (k: StructureKind | null) => {
    buildKind = k;
    syncBuildButtons();
  },
};

// Show the spawn prompt with a nudge toward good ground.
const hint = el("spawn-hint");
if (hint) hint.textContent = "Click open land to plant your castle. Deep inland gives you room to grow.";
log(`A new world. Seed ${seed}.`);
void OCEAN;
void PALETTE;
