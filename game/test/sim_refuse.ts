import { Game } from "../src/sim/game";
import { ORE_PER_TROOP, RATIONS_PER_TROOP } from "../src/sim/game";
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

const tally: Record<string, number> = {};
for (let i = 0; i < 3000; i++) {
  g.tick(0.1);
  if (i % 20) continue;
  let tgt = -1;
  for (const own of me.tiles) for (const n of g.neighbors4(own)) {
    if (g.owners[n] === me.id || !g.isLand(n)) continue;
    const who = g.owners[n];
    if (who >= 0 && g.players[who].immune > 0) continue;
    tgt = n; break;
  }
  if (tgt < 0) { tally.noTarget = (tally.noTarget ?? 0) + 1; continue; }
  const troops = Math.floor(me.troops * 0.35);
  const ok = g.orderArmy(me, tgt, 0.35);
  if (ok) { tally.ok = (tally.ok ?? 0) + 1; continue; }
  if (!g.canAttack(me, tgt)) tally.canAttack = (tally.canAttack ?? 0) + 1;
  else if (troops < 12) tally.small = (tally.small ?? 0) + 1;
  else if (me.ore < Math.ceil(troops * ORE_PER_TROOP)) tally.noIron = (tally.noIron ?? 0) + 1;
  else if (me.grain < Math.ceil(troops * RATIONS_PER_TROOP)) tally.noRations = (tally.noRations ?? 0) + 1;
  else tally.limit = (tally.limit ?? 0) + 1;
}
console.log(tally);
console.log(`armies in field ${g.armies.length}, mine ${g.armies.filter((a) => a.owner === me.id).length}, cap ${g.capacity(me)}`);
