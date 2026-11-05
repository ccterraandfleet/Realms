import { ARMY_CAP, Game } from "../src/sim/game";

const say = (label: string, ok: boolean, detail = "") =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);

say(
  "army cap by castle level (100 / 250 / 500 / 850)",
  ARMY_CAP(1) === 100 && ARMY_CAP(2) === 250 && ARMY_CAP(3) === 500 && ARMY_CAP(4) === 850,
  [1, 2, 3, 4].map((l) => `L${l}=${ARMY_CAP(l)}`).join(" "),
);

const g = new Game(7);
let start = -1;
for (let i = 0; i < g.owners.length; i++) if (g.isLand(i) && g.owners[i] < 0) { start = i; break; }
g.chooseStart(start);
const me = g.players[g.human];
const home = [...g.structs.values()].find((s) => s.owner === me.id && s.kind === "castle")!.tile;

// a neutral target a short march away
const sx = start % g.world.w;
const sy = (start / g.world.w) | 0;
let target = -1;
for (let r = 5; r < 26 && target < 0; r++) {
  for (let dy = -r; dy <= r && target < 0; dy++) {
    for (let dx = -r; dx <= r && target < 0; dx++) {
      const t = (sy + dy) * g.world.w + (sx + dx);
      if (t < 0 || t >= g.owners.length) continue;
      if (g.isLand(t) && g.owners[t] === -1) target = t;
    }
  }
}

let host = g.armies.find((a) => a.owner === me.id);
for (let i = 0; i < 900 && !host; i++) {
  g.tick(0.1);
  host = g.armies.find((a) => a.owner === me.id);
}
say("a host forms at the castle from the pool", Boolean(host), host ? `${Math.round(host.troops)} men` : "none");
say("one host per castle", g.armies.filter((a) => a.owner === me.id && a.home === home).length === 1);

// march it at the chosen point
if (host) host.troops = 400;   // enough to walk there
g.moveArmy(me, home, target);
let arrived = -1;
for (let i = 0; i < 1200; i++) {
  g.tick(0.1);
  const a = g.armyOf(me, home);
  if (a && a.holding) { arrived = a.tile; break; }
}
say("host holds exactly where the order pointed", arrived === target, `arrived ${arrived}, click ${target}`);

// camp on that captured ground
const before = me.tileCount;
const a1 = g.armyOf(me, home);
if (a1) a1.troops = Math.max(a1.troops, 500);
// the camp is a purchase: make sure the wallet is not the thing under test
me.grain += 500; me.timber += 500; me.ore += 500; me.gold += 500;
const raised = g.establishCamp(me, home);
const camp = [...g.structs.values()].find((s) => s.kind === "camp" && s.owner === me.id);
say("war camp raised on ground you did not hold", raised && Boolean(camp), camp ? `camp at ${camp.tile}` : "not raised");
if (camp) {
  const frontier = g.neighbors4(camp.tile).filter((n) => g.isLand(n) && g.owners[n] !== me.id);
  const t0 = me.tileCount;
  for (let i = 0; i < 1500; i++) g.tick(0.1);
  say(
    "camp passively eats the ground around it",
    frontier.length === 0 || me.tileCount > t0,
    `${t0} -> ${me.tileCount} tiles (was ${before} before the camp), ${frontier.length} open sides`,
  );
}

// 100 vs 1000
const h = new Game(7);
let hstart = -1;
for (let i = 0; i < h.owners.length; i++) if (h.isLand(i) && h.owners[i] < 0) { hstart = i; break; }
h.chooseStart(hstart);
const small = h.players[h.human];
const big = h.players.find((p) => p.isBot)!;
big.isBot = false;  // keep the bot from marching the defender away mid-duel
const s1 = hstart;
const s2 = h.neighbors4(s1).find((n) => h.isLand(n))!;
h.armies.length = 0;
h.armies.push({ id: 900, owner: small.id, home: s1, troops: 100, tile: s1, target: s2, progress: 0, taken: 0, cutOff: false, speed: 2, supplyTimer: 9, holding: false, holdTimer: 0 });
h.armies.push({ id: 901, owner: big.id, home: s2, troops: 1000, tile: s2, target: s1, progress: 0, taken: 0, cutOff: false, speed: 0, supplyTimer: 9, holding: true, holdTimer: 0 });
h.era = "war";
for (let i = 0; i < 60; i++) h.tick(0.1);
const smallArmy = h.armies.find((a) => a.id === 900);
// A beaten host now breaks and routs rather than being deleted by arithmetic,
// so "lost" means it no longer holds the field.
const smallBeaten = !smallArmy || smallArmy.routed;
const bigLeft = h.armies.find((a) => a.id === 901);
say("100 men lose to 1000 in the field", smallBeaten && Boolean(bigLeft), `small routed/gone=${smallBeaten} big men=${bigLeft ? Math.round(bigLeft.troops) : 0}`);

// a camp attacked by a bigger host is destroyed
const k = new Game(7);
let kstart = -1;
for (let i = 0; i < k.owners.length; i++) if (k.isLand(i) && k.owners[i] < 0) { kstart = i; break; }
k.chooseStart(kstart);
const holder = k.players[0];
const attacker = k.players[1];
const kt = kstart;
const kt2 = k.neighbors4(kt).find((n) => k.isLand(n))!;
k.armies.length = 0;
k.structs.set(kt, { kind: "camp", owner: holder.id, tile: kt, level: 1, acc: 0 });
k.armies.push({ id: 950, owner: holder.id, home: kt, troops: 120, tile: kt, target: kt, progress: 0, taken: 0, cutOff: false, speed: 0, supplyTimer: 9, holding: true, holdTimer: 0 });
k.armies.push({ id: 951, owner: attacker.id, home: kt2, troops: 900, tile: kt2, target: kt, progress: 0, taken: 0, cutOff: false, speed: 2, supplyTimer: 9, holding: false, holdTimer: 0 });
k.era = "war";
for (let i = 0; i < 60; i++) k.tick(0.1);
say(
  "a bigger host breaks an enemy camp on your land",
  !k.structs.has(kt) && !k.armies.some((a) => a.id === 950),
  `camp present=${k.structs.has(kt)} garrison alive=${k.armies.some((a) => a.id === 950)}`,
);
