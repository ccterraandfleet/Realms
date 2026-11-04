import { Game } from "../src/sim/game";
import { PLAINS } from "../src/sim/world";

// Seat a realm on ground that can actually support an economy.
function seat(g: Game) {
  let best = -1, bs = -1;
  for (let i = 0; i < g.owners.length; i += 7) {
    if (!g.isLand(i) || g.owners[i] >= 0) continue;
    const q = g.siteQuality(i, 5);
    if (q > bs) { bs = q; best = i; }
  }
  g.chooseStart(best);
  return g.players[g.human];
}

const g = new Game(7);
const me = seat(g);
console.log(`seat quality ${g.siteQuality([...me.tiles][0], 5)}`);

// 1. building farms raises the ceiling: production IS the army size
const cap0 = g.capacity(me);
me.timber = 900; me.gold = 400; me.grain = 400;
let farms = 0;
for (const t of me.tiles) if (g.world.terrain[t] === PLAINS && g.build(me, "farm", t)) farms++;
g.tick(0.1);
console.log(`farms ${farms}: grain ${me.grainProd.toFixed(2)}/s, cap ${cap0} -> ${g.capacity(me)}`);

// 2. the same realm with an iron mine can arm offensives, without one it cannot
const g2 = new Game(7);
const me2 = seat(g2);
me2.grain = 400;
const tgt = [...me2.tiles].map((t) => t + 2).find((t) => g2.isLand(t) && g2.owners[t] < 0) ?? -1;
me2.ore = 0;
const noIron = g2.orderArmy(me2, tgt, 0.5);
me2.ore = 400;
const withIron = g2.orderArmy(me2, tgt, 0.5);
console.log(`offensive needs iron: blocked ${!noIron}, allowed ${withIron}`);

// 3. the spiral: lose your farms while the army is in the field
const g3 = new Game(7);
const me3 = seat(g3);
me3.timber = 2000; me3.gold = 900; me3.grain = 600; me3.ore = 900;
for (const t of me3.tiles) g3.build(me3, "farm", t);
for (let i = 0; i < 200; i++) g3.tick(0.1);
const fedCap = g3.capacity(me3);
const capBefore = me3.grainProd;
// burn the farms as if raided
for (const [tile, s] of g3.structs) if (s.owner === me3.id && s.kind === "farm") g3.structs.delete(tile);
me3.grain = 1;
let starvedAt = -1;
const soldiers0 = me3.soldiers;
for (let i = 0; i < 300; i++) {
  g3.tick(0.1);
  if (me3.starving && starvedAt < 0) starvedAt = i;
}
console.log(`raided: grain ${capBefore.toFixed(2)}/s -> ${me3.grainProd.toFixed(2)}/s, cap ${fedCap} -> ${g3.capacity(me3)}`);
console.log(`starvation at t+${(starvedAt / 10).toFixed(1)}s, soldiers ${soldiers0.toFixed(0)} -> ${me3.soldiers.toFixed(0)}`);
