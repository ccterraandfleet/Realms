import { Game } from "../src/sim/game";

const g = new Game(7);
let seat = -1, bs = -1;
for (let i = 0; i < g.owners.length; i += 7) {
  if (!g.isLand(i) || g.owners[i] >= 0) continue;
  const q = g.siteQuality(i, 5);
  if (q > bs) { bs = q; seat = i; }
}
g.chooseStart(seat);
const me = g.players[g.human];
const w = g.world.w;

// click 16 tiles east, in open ground
let click = -1;
for (let i = 0; i < g.owners.length; i++) {
  if (g.owners[i] !== -1 || !g.isLand(i)) continue;
  const d = g.tileDistance(i, seat);
  if (d > 9 && d < 20) { click = i; break; }
}
if (click < 0) throw new Error("no open ground found");
const before = me.tileCount;
const ok = g.orderArmy(me, click, 0.4);
const armiesEver = () => g.armies.filter((a) => a.owner === me.id).length;
console.log("node planted:", ok, "| armies spawned:", armiesEver());

let firstGrowth = 0, lastGrowth = 0, done = false;
for (let i = 0; i < 1400; i++) {
  g.tick(0.1);
  const n = me.tileCount - before;
  if (n > 0 && !firstGrowth) firstGrowth = i;
  if (n > 0) lastGrowth = i;
  const node = g.claimNodes.find((x) => x.owner === me.id);
  if (node?.done && !done) { done = true; console.log("node finished at t+" + (i / 10).toFixed(1) + "s, tiles gained", n); break; }
}
const node = g.claimNodes.find((x) => x.owner === me.id);
// how wide did it get, and did it touch a rival?
let touchedRival = false;
for (const t of me.tiles) for (const n of g.neighbors4(t)) {
  const o = g.owners[n];
  if (o >= 0 && o !== me.id) touchedRival = true;
}
// second scenario: a rival wall in the node's path must stop it
const g2 = new Game(7);
let s2 = -1, b2 = -1;
for (let i = 0; i < g2.owners.length; i += 7) {
  if (!g2.isLand(i) || g2.owners[i] >= 0) continue;
  const q = g2.siteQuality(i, 5);
  if (q > b2) { b2 = q; s2 = i; }
}
g2.chooseStart(s2);
const me2 = g2.players[g2.human];
const rival = g2.players[2] ?? null;
let c2 = -1;
for (let i = 0; i < g2.owners.length; i++) {
  if (g2.owners[i] !== -1 || !g2.isLand(i)) continue;
  const d = g2.tileDistance(i, s2);
  if (d > 9 && d < 14) { c2 = i; break; }
}
// paint a rival wall 6 tiles past the click
let walled = 0;
if (rival) {
  for (let i = 0; i < g2.owners.length; i++) {
    if (g2.owners[i] !== -1 || !g2.isLand(i)) continue;
    const d = g2.tileDistance(i, c2);
    if (d >= 5 && d <= 7) { (g2 as any).capture(i, rival.id); walled++; }
  }
}
g2.orderArmy(me2, c2, 0.4);
for (let i = 0; i < 600; i++) g2.tick(0.1);
let leaked = 0;
for (const t of me2.tiles) for (const n of g2.neighbors4(t)) {
  if (g2.owners[n] === rival?.id && g2.tileDistance(n, c2) > 8) leaked++;
}
console.log({ wallTiles: walled, rivalTilesLeft: rival?.tileCount ?? 0, leakedThroughWall: leaked });

console.log({
  tilesGained: me.tileCount - before,
  nodeDone: node?.done ?? null,
  armies: armiesEver(),
  touchedRival,
  stillOwnsClick: g.owners[click] === me.id,
});
