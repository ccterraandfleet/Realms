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
for (let i = 0; i < 1200; i++) g.tick(0.1);    // two minutes: bots spread and borders form
console.log("bordersRival:", (g as any).bordersRival(me), "armies:", g.armies.length);

// double-click far off in unclaimed land
const w = g.world.w;
let far = -1;
for (let i = 0; i < g.owners.length; i++) {
  if (g.owners[i] === -1 && g.isLand(i) && g.tileDistance(i, seat) > 14 && g.tileDistance(i, seat) < 18) { far = i; break; }
}
const before = me.tileCount;
const ok = g.orderArmy(me, far, 0.4);
for (let i = 0; i < 30; i++) g.tick(0.1);
console.log({ ok, clickedUnclaimed: g.owners[far] === -1, tilesGained: me.tileCount - before, armiesAfter: g.armies.filter((a) => a.owner === me.id).length });
