import { ARMY_CAP, Game } from "../src/sim/game";

const g = new Game(7);
g.startMultiplayer(2);
const me = g.players[g.human];

let t = 0;
while (t < 240 && !g.bordersRival(me)) { g.tick(0.1); t += 0.1; }
console.log(`borders met at ${t.toFixed(0)}s — tiles ${me.tileCount}, castles ${me.castles}, pool ${Math.round(me.troops)}`);
const atContact = me.tileCount;

const weakestEnemyTile = () => {
  let best = -1, bestDef = Infinity;
  for (const mine of me.tiles) for (const n of g.neighbors4(mine)) {
    const o = g.owners[n];
    if (o < 0 || o === me.id || !g.isLand(n)) continue;
    const d = g.defenseAt(n, o);
    if (d < bestDef) { bestDef = d; best = n; }
  }
  return best;
};

let camps = 0, upgrades = 0, orders = 0;
for (let step = 0; step < 1800; step++) {
  g.tick(0.1);
  if (step % 20) continue;   // act twice a second, like a player would

  // upgrade the main castle when there is money for it
  const castle = [...g.structs.values()].find((s) => s.owner === me.id && s.kind === "castle");
  if (castle && castle.level < 8) {
    const cost = g.buildCost("castle", castle.level);
    if (g.canAfford(me, cost) && g.build(me, "castle", castle.tile)) upgrades++;
  }
  // camp any host holding ground away from home
  for (const a of g.armies.filter((x) => x.owner === me.id && x.holding)) {
    if (a.tile !== a.home && g.tileDistance(a.tile, a.home) >= 3 && !g.structs.has(a.tile)) {
      if (g.establishCamp(me, a.home)) camps++;
    }
  }
  // push the weakest stretch with everything formed up
  const target = weakestEnemyTile();
  if (target >= 0) {
    for (const a of g.armies.filter((x) => x.owner === me.id)) {
      if (g.moveArmy(me, a.home, target)) orders++;
    }
  }
}

const grown = me.tileCount - atContact;
const campsNow = [...g.structs.values()].filter((s) => s.kind === "camp" && s.owner === me.id).length;
const castles = [...g.structs.values()].filter((s) => s.owner === me.id && s.kind === "castle");
console.log(
  `after 180s of contact: tiles ${me.tileCount} (${grown >= 0 ? "+" : ""}${grown}), pool ${Math.round(me.troops)}, ` +
    `hosts ${g.armies.filter((a) => a.owner === me.id).length}, castles ${castles.length} (best L${Math.max(...castles.map((c) => c.level))}), camps ${campsNow}`,
);
console.log(`actions: ${orders} orders, ${camps} camps raised, ${upgrades} castle upgrades   host cap now ${ARMY_CAP(Math.max(...castles.map((c) => c.level)))}`);
console.log(grown > 0 ? `PASS  a realm still takes ground once the borders meet (+${grown} tiles)` : "FAIL  stuck at contact");
console.log(campsNow > 0 ? `PASS  camps hold the ground taken (${campsNow} live)` : "FAIL  no camps established");
