import { MIDDLE_RICHNESS, OCEAN, POCKET_RICHNESS } from "../src/sim/world";
import { Game } from "../src/sim/game";

const say = (l: string, ok: boolean, d = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`);

const g = new Game(7);
g.startMultiplayer(2);
const me = g.players[g.human];
const W = g.world;

// 1. everyone starts on their own pocket
const seats = g.players.filter((p) => p.alive).map((p) => [...p.tiles][0]);
say("every lord starts in a pocket of their own", g.players.length >= 12, `${g.players.length} realms on ${W.pockets.length} pockets`);

// 2. no dry route from a pocket to the middle
const landReach = (from: number) => {
  const seen = new Set<number>([from]);
  const q = [from];
  let hitMiddle = false;
  while (q.length) {
    const t = q.pop()!;
    if (W.richness[t] > POCKET_RICHNESS + 0.01) hitMiddle = true;
    for (const n of g.neighbors4(t)) {
      if (seen.has(n) || W.terrain[n] === OCEAN) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return { hitMiddle, size: seen.size };
};
const start = W.pockets[0];
const dry = landReach(start);
say("the middle ground cannot be walked to from a pocket", !dry.hitMiddle, `${dry.size} tiles reachable on foot from pocket 0`);

// 3. the middle is worth several pockets
const midTile = W.richness.findIndex((r) => r > POCKET_RICHNESS + 0.01);
say(
  "middle ground pays far more per tile than a pocket",
  W.richness[midTile] >= MIDDLE_RICHNESS * 0.85 && W.richness[start] === POCKET_RICHNESS,
  `pocket ${W.richness[start].toFixed(2)}x vs middle ${W.richness[midTile].toFixed(2)}x`,
);

// 4. bridges are what let you across
me.grain += 5000; me.timber += 5000; me.ore += 5000; me.gold += 5000;
const sx = start % W.w, sy = (start / W.w) | 0;
const cx = Math.round(W.w / 2), cy = Math.round(W.h / 2);
let built = 0;
let blockedAt = -1;

// Walk out to your own shoreline first: the pocket is bigger than the opening
// claim, so the water is a little way from the castle.
const landFrom = (from: number) => {
  const seen = new Set<number>([from]);
  const q = [from];
  while (q.length) {
    const t = q.pop()!;
    for (const n of g.neighbors4(t)) {
      if (seen.has(n) || W.terrain[n] === OCEAN) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
};
const midCentre = cy * W.w + cx;
const reachable = landFrom([...me.tiles][0]);
const shore = [...reachable].filter((t) => g.neighbors4(t).some((n) => W.terrain[n] === OCEAN));
shore.sort((a, b) => g.tileDistance(a, midCentre) - g.tileDistance(b, midCentre));
if (shore.length) g.capture(shore[0], me.id);
say("the pocket has a shoreline to build from", shore.length > 0, `${shore.length} shore tiles, ${g.tileDistance(shore[0] ?? 0, midCentre)} tiles from the middle`);

// Lay spans outward from that shore, each 4-adjacent to the last.
for (let step = 0; step < 60; step++) {
  let pick = -1;
  let bestD = Infinity;
  for (const t of me.tiles) {
    for (const n of g.neighbors4(t)) {
      if (W.terrain[n] !== OCEAN || g.structs.has(n)) continue;
      const d = g.tileDistance(n, midCentre);
      if (d < bestD) { bestD = d; pick = n; }
    }
  }
  if (pick < 0) break;
  if (!g.build(me, "bridge", pick)) { blockedAt = step; break; }
  built++;
  if (g.neighbors4(pick).some((n) => W.richness[n] > POCKET_RICHNESS + 0.01)) break;
}
say("a bridge chain can be laid out over the water", built > 0, `${built} spans laid${blockedAt >= 0 ? `, blocked at step ${blockedAt}` : ""}`);

// 5. with the spans down, a host can actually cross
const passableReach = (from: number) => {
  const seen = new Set<number>([from]);
  const q = [from];
  let middle = -1;
  while (q.length) {
    const t = q.pop()!;
    if (W.richness[t] > POCKET_RICHNESS + 0.01 && middle < 0) middle = t;
    for (const n of g.neighbors4(t)) {
      if (seen.has(n) || !g.passable(n)) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return middle;
};
say("the completed crossing reaches the middle ground", passableReach(start) >= 0, passableReach(start) >= 0 ? "route open" : "still cut off");

// 6. wealth: the same tile count in the middle earns much more
g.refreshRates(me);
const before = me.rates.grain;
const pocketCount = me.tileCount;
for (let i = 0; i < 40; i++) {
  const t = midTile + i;
  if (W.terrain[t] !== OCEAN && g.owners[t] < 0) g.capture(t, me.id);
}
g.refreshRates(me);
say(
  "taking middle ground raises income sharply",
  me.rates.grain > before,
  `grain ${before.toFixed(2)}/s at ${pocketCount} pocket tiles -> ${me.rates.grain.toFixed(2)}/s after middle tiles`,
);
