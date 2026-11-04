import { Game } from "../src/sim/game";

const g = new Game(7);
// pick the land tile closest to the middle of the map, like a player would
let start = -1;
let best = Infinity;
for (let i = 0; i < g.owners.length; i++) {
  if (!g.isLand(i) || g.owners[i] >= 0) continue;
  const x = i % g.world.w, y = (i / g.world.w) | 0;
  const d = Math.hypot(x - g.world.w / 2, y - g.world.h / 2);
  if (d < best) { best = d; start = i; }
}
g.chooseStart(start);
const me = g.players[g.human];

const t0 = performance.now();
let clicks = 0;
const frontier = () => {
  const out: { t: number; cost: number }[] = [];
  for (const i of me.tiles) for (const n of g.neighbors8(i)) {
    if (!g.canAttack(me, n)) continue;
    const o = g.owners[n];
    out.push({ t: n, cost: o >= 0 ? g.players[o].troops * 0.4 : g.neutralDefense(n) });
  }
  out.sort((a, b) => a.cost - b.cost);
  return out;
};

for (let step = 0; step < 3600; step++) {  // 6 simulated minutes at 10 Hz
  g.tick(0.1);
  if (step % 3 === 0) {                    // a player clicking about 3x a second
    for (const c of frontier().slice(0, 3)) if (g.attack(me, c.t, 0.35)) clicks++;
    if (me.gold > g.buildCost("castle", 1) && me.tileCount % 40 === 0) {
      const free = [...me.tiles].find((t) => !g.structs.has(t));
      if (free !== undefined) g.build(me, "castle", free);
    }
  }
  if (g.phase === "over") break;
}
const ms = performance.now() - t0;

console.log(`sim 6min in ${ms.toFixed(0)}ms (${(ms / 3600).toFixed(3)}ms/tick)`);
console.log("phase", g.phase, "winner", g.winner, "tiles", me.tileCount, "share", (g.landShare(me) * 100).toFixed(1) + "%");
console.log("clicks", clicks, "troops", me.troops.toFixed(0), "/", g.capacity(me), "gold", me.gold.toFixed(0));
console.log("castles", me.castles, "structures", [...g.structs.values()].filter((s) => s.owner === 0).length);
const ranked = [...g.players].sort((a, b) => b.tileCount - a.tileCount).slice(0, 4)
  .map((p) => `${p.name}:${p.tileCount}`).join("  ");
console.log("standings:", ranked);
console.log("eliminated", g.players.filter((p) => !p.alive).length, "of", g.players.length);
