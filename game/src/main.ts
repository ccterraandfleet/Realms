/**
 * Realms boot + input + HUD.
 *
 * Left click / drag: send armies at bordering land. Build buttons or Q/W/E/R:
 * place a structure on your own ground. Wheel zooms, right-drag or space-drag
 * pans. The whole world is a seed, so "New world" is just another number.
 */

import { Camera, Renderer } from "./render/renderer";
import { COSTS, Game, PALETTE, STRUCTURE_LABEL, StructureKind } from "./sim/game";
import { OCEAN } from "./sim/world";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 7) || 7;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const game = new Game(seed);
const renderer = new Renderer(canvas, game);

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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
let lastAttackAt = 0;

const keys: Record<string, StructureKind> = {
  q: "castle",
  w: "tower",
  e: "harbor",
  r: "siege",
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
  click(tile);
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
  // Holding the left button floods armies at everything the cursor crosses.
  if (e.buttons & 1) {
    const now = performance.now();
    if (now - lastAttackAt > 55) {
      lastAttackAt = now;
      if (!buildKind) attack(hover);
    }
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
    if (!game.build(me, buildKind, tile)) {
      const cost = game.buildCost(buildKind, 1);
      if (me.gold < cost) log(`Not enough gold for a ${STRUCTURE_LABEL[buildKind].toLowerCase()} (${cost}).`);
      else if (game.structs.has(tile)) log("Something already stands there.");
      else if (game.ownerAt(tile) !== me.id) log("You can only build on your own ground.");
    }
    return;
  }
  attack(tile);
}

function attack(tile: number) {
  const me = game.players[game.human];
  if (!me || game.phase !== "playing") return;
  game.orderArmy(me, tile, Number(ratioInput.value) / 100);
}

ratioInput.addEventListener("input", () => {
  ratioVal.textContent = `${ratioInput.value}%`;
});

/* ------------------------------------------------------------------ */
/* Build bar                                                           */
/* ------------------------------------------------------------------ */

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
  statGold.textContent = fmt(me.gold);
  statTroops.textContent = `${fmt(me.troops)} / ${fmt(game.capacity(me))}`;
  statLand.textContent = `${(game.landShare(me) * 100).toFixed(1)}%`;
  statCastles.textContent = `${me.castles}`;
  const alive = game.players.filter((p) => p.alive).length - 1;
  statLords.textContent = `${alive}`;

  for (const b of buildButtons) {
    const kind = b.dataset.kind as StructureKind;
    const cost = game.buildCost(kind, 1);
    b.classList.toggle("poor", me.gold < cost);
    const costEl = b.querySelector(".cost");
    if (costEl) costEl.textContent = `${cost}g`;
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
  game.tick(dt);
  renderer.draw(cam, hover, buildKind, dpr);
  if (now - lastHud > 120) {
    lastHud = now;
    refreshHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

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
