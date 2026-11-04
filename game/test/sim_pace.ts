import { Game } from "../src/sim/game";
import { PLAINS } from "../src/sim/world";

const g = new Game(7);
let seat = -1, bs = -1;
for (let i = 0; i < g.owners.length; i += 7) {
  if (!g.isLand(i) || g.owners[i] >= 0) continue;
  const q = g.siteQuality(i, 5);
  if (q > bs) { bs = q; seat = i; }
}
g.chooseStart(seat);
const me = g.players[g.human];

const t0 = Date.now();
let ordered = 0, failed = 0;
let last = 0;
for (let i = 0; i < 9000; i++) {           // 15 minutes
  g.tick(0.1);
  // a competent player: build the cheapest useful thing, then push
  if (i % 10 === 0) {
    me.timber += 0; // no cheating, just reading
  }
  if (i % 20 === 0) {
    const wants: [string, number][] = [["farm", PLAINS]];
    for (const [kind, terr] of wants) {
      const t = [...me.tiles].find((x) => g.world.terrain[x] === terr && !g.structs.has(x));
      if (t !== undefined) g.build(me, kind as never, t);
    }
    const lumb = [...me.tiles].find((x) => g.world.terrain[x] === 3 && !g.structs.has(x));
    if (lumb !== undefined) g.build(me, "lumber", lumb);
    const mine = [...me.tiles].find((x) => g.world.terrain[x] === 4 && !g.structs.has(x));
    if (mine !== undefined) g.build(me, "mine", mine);
    const keep = [...me.tiles].find((x) => !g.structs.has(x));
    if (keep !== undefined && me.castles < 10) g.build(me, "castle", keep);
    // push outward at a real frontier tile, the way a player can
    let tgt = -1;
    for (const own of me.tiles) {
      for (const n of g.neighbors4(own)) {
        if (g.owners[n] === me.id || !g.isLand(n)) continue;
        const who = g.owners[n];
        if (who >= 0 && g.players[who].immune > 0) continue;
        tgt = n;
        break;
      }
      if (tgt >= 0) break;
    }
    if (tgt >= 0) { if (g.orderArmy(me, tgt, 0.35)) ordered++; else failed++; }
  }
  if (i % 1500 === 0 && i > 0) {
    const mins = i / 600;
    console.log(`t+${mins.toFixed(0)}m | tiles ${me.tileCount} | cap ${g.capacity(me)} | grain ${me.grainProd.toFixed(1)}/s | ore ${me.rates.ore.toFixed(1)}/s | troops ${Math.round(me.troops)} | lords left ${g.players.filter((p) => p.alive).length - 1}`);
  }
  last = i;
}
const ms = Date.now() - t0;
console.log(`sim ${(last / 10 / 60).toFixed(0)} min in ${ms}ms (${(ms / last).toFixed(3)}ms/tick)`);
console.log(`orders ok ${ordered}, refused ${failed}`);
console.log(`final: ${g.phase}, land share ${(g.landShare(me) * 100).toFixed(2)}%, structures ${g.structs.size}`);
