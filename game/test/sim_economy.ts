import { Game } from "../src/sim/game";
import { FOREST, MOUNTAIN, PLAINS } from "../src/sim/world";

function centreStart(g: Game) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.owners.length; i++) {
    if (!g.isLand(i) || g.owners[i] >= 0) continue;
    const x = i % g.world.w, y = (i / g.world.w) | 0;
    const d = Math.hypot(x - g.world.w / 2, y - g.world.h / 2);
    if (d < bd) { bd = d; best = i; }
  }
  g.chooseStart(best);
  return g.players[g.human];
}

// 1. terrain gating
const g = new Game(7);
const me = centreStart(g);
const terrainTiles = new Map<number, number[]>();
for (const t of me.tiles) {
  const ter = g.world.terrain[t];
  if (!terrainTiles.has(ter)) terrainTiles.set(ter, []);
  terrainTiles.get(ter)!.push(t);
}
let gateOk = true;
for (const [kind, terr] of [["farm", PLAINS], ["lumber", FOREST], ["mine", MOUNTAIN]] as const) {
  const legal = terrainTiles.get(terr)?.[0] ?? -1;
  const illegal = [...me.tiles].find((t) => g.world.terrain[t] !== terr && !g.structs.has(t)) ?? -1;
  if (legal >= 0) {
    const res = g.build(me, kind, legal);
    if (!res) gateOk = false;
    console.log(`${kind} on correct ground: ${res}`);
  }
  if (illegal >= 0) {
    const res = g.build(me, kind === "farm" ? "lumber" : kind, illegal);
    console.log(`  wrong-ground build refused: ${!g.canBuild(me, kind, illegal)} (${kind} @ ${g.world.terrain[illegal]})`, res ? "BUT IT BUILT" : "");
    if (g.canBuild(me, kind, illegal)) gateOk = false;
  }
}
console.log("terrain gates ok:", gateOk);

// 2. production raises the ceiling
const before = g.capacity(me);
me.timber = 500; me.ore = 200; me.grain = 300; me.gold = 300;
let farms = 0;
const blobTerr = new Map<number, number>();
for (const t of me.tiles) blobTerr.set(g.world.terrain[t], (blobTerr.get(g.world.terrain[t]) ?? 0) + 1);
console.log("spawn blob terrain counts:", [...blobTerr.entries()]);
for (const t of me.tiles) {
  if (g.world.terrain[t] === PLAINS && g.build(me, "farm", t)) farms++;
}
g.tick(0.1);
console.log(`farms built: ${farms}, grain ${me.rates.grain.toFixed(2)}/s gross ${me.grainProd.toFixed(2)}/s`);
console.log(`capacity with farms: ${before} -> ${g.capacity(me)}  grain flow ${me.rates.grain.toFixed(2)}/s`);

// 3. famine: mobilise an army the harvest cannot feed
const g2 = new Game(7);
const me2 = centreStart(g2);
for (let i = 0; i < 300; i++) g2.tick(0.1);           // 30s of production
const fed = me2.rates.grain;
// force an army the harvest cannot possibly feed
me2.troops = g2.capacity(me2) * 4;
me2.grain = 5;
console.log(`grain flow before mobilising ${fed.toFixed(2)}/s, soldiers ${me2.soldiers}`);
let starvedAt = -1;
for (let i = 0; i < 600; i++) {
  g2.tick(0.1);
  if (me2.starving && starvedAt < 0) starvedAt = i;
}
console.log(`famine hit at t+${(starvedAt / 10).toFixed(1)}s, starving now ${me2.starving}, grain ${me2.grain.toFixed(0)}, soldiers ${me2.soldiers.toFixed(0)}`);

// 4. iron gates offensives
const g3 = new Game(7);
const me3 = centreStart(g3);
me3.ore = 0;
const target = [...me3.tiles].map((t) => t + 3).find((t) => g3.isLand(t) && g3.owners[t] < 0) ?? -1;
console.log(`order with no iron: ${g3.orderArmy(me3, target, 0.5)} (should be false)`);
me3.ore = 500;
console.log(`order with iron: ${g3.orderArmy(me3, target, 0.5)} (should be true), ore left ${me3.ore.toFixed(1)}`);

// 5. lords build economies
const g4 = new Game(7);
centreStart(g4);
for (let i = 0; i < 3600; i++) g4.tick(0.1);
const counts: Record<string, number> = {};
for (const s of g4.structs.values()) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
console.log("after 6min:", counts);
const top = g4.players.filter((p) => p.alive).sort((a, b) => b.tileCount - a.tileCount)[0];
console.log(`leader ${top.name}: ${top.tileCount} tiles, cap ${g4.capacity(top)}, grain ${top.rates.grain.toFixed(2)}/s, ore ${top.rates.ore.toFixed(2)}/s`);

// 6. the spiral: bank empty, army still eating
const g5 = new Game(7);
const me5 = centreStart(g5);
for (let i = 0; i < 200; i++) g5.tick(0.1);
me5.grain = 0;
const target5 = [...me5.tiles].map((t) => t + 2).find((t) => g5.isLand(t) && g5.owners[t] < 0) ?? -1;
console.log(`rations gate (empty granary): ${g5.orderArmy(me5, target5, 0.5)} (should be false)`);
me5.grain = 2; me5.ore = 300;
g5.orderArmy(me5, target5, 0.5);
let starved = -1;
const startSoldiers = me5.soldiers;
for (let i = 0; i < 400; i++) {
  g5.tick(0.1);
  if (me5.starving && starved < 0) starved = i;
}
console.log(`starvation at t+${(starved / 10).toFixed(1)}s, starving ${me5.starving}, grain ${me5.grain.toFixed(1)}, soldiers ${startSoldiers.toFixed(0)} -> ${me5.soldiers.toFixed(0)}`);
