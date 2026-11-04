import { Game } from "../src/sim/game";
const g = new Game(7);
let start = -1;
for (let i = 0; i < g.owners.length; i++) if (g.isLand(i) && g.owners[i] < 0) { start = i; break; }
g.chooseStart(start);
const me = g.players[g.human];
const front = () => {
  const out: number[] = [];
  for (const i of me.tiles) for (const n of g.neighbors8(i)) if (g.canAttack(me, n)) out.push(n);
  return [...new Set(out)];
};
console.log("tiles", me.tileCount, "troops", me.troops.toFixed(0), "frontier", front().length);
let ok = 0, failNoFront = 0, failAttack = 0;
for (let step = 0; step < 200; step++) {
  g.tick(0.1);
  if (step % 3) continue;
  const f = front();
  if (!f.length) { failNoFront++; continue; }
  const t = f[0];
  const before = me.troops;
  const res = g.attack(me, t, 0.35);
  if (res) ok++; else { failAttack++; if (failAttack < 4) console.log("attack rejected: target", t, "own", g.owners[t], "troops", before.toFixed(0), "inFlight", g.attacks.filter(a=>a.target===t).length); }
}
console.log({ ok, failNoFront, failAttack }, "tiles now", me.tileCount, "troops", me.troops.toFixed(0), "inFlight", g.attacks.length);
