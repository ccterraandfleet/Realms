import { Game } from "../src/sim/game";

const g = new Game(7);
console.log("world", g.world.w, "x", g.world.h, "land", g.world.landTiles);

// find a decent starting tile near the middle of the land
let start = -1;
for (let i = 0; i < g.owners.length; i++) {
  if (g.isLand(i) && g.owners[i] < 0) { start = i; break; }
}
const ok = g.chooseStart(start);
const me = g.players[g.human];
console.log("chose start", ok, "tiles", me.tileCount, "cap", g.capacity(me), "troops", me.troops.toFixed(0));
console.log("castle at spawn:", [...g.structs.values()].filter(s => s.owner === 0).map(s => `${s.kind}@${s.tile} lvl${s.level}`));
console.log("lords:", g.players.length - 1);

// play 3 minutes of simulated time with a simple expansion policy
let attacks = 0;
for (let step = 0; step < 1800; step++) {   // 1800 * 0.1s = 180s
  g.tick(0.1);
  if (step % 2 === 0) {
    // human: attack up to 6 cheapest frontier tiles
    const targets: {t:number;cost:number}[] = [];
    for (const i of me.tiles) for (const n of g.neighbors8(i)) {
      if (g.owners[n] === me.id || !g.isLand(n) || !g.canAttack(me, n)) continue;
      const o = g.owners[n];
      targets.push({ t: n, cost: o >= 0 ? g.players[o].troops : g.neutralDefense(n) });
    }
    targets.sort((a,b)=>a.cost-b.cost);
    for (const c of targets.slice(0,6)) if (g.attack(me, c.t, 0.12)) attacks++;
  }
}

console.log("after 180s: mine tiles", me.tileCount, "cap", g.capacity(me), "troops", me.troops.toFixed(0), "gold", me.gold.toFixed(0), "attacks issued", attacks);
console.log("land share", (g.landShare(me)*100).toFixed(1) + "%", "phase", g.phase, "winner", g.winner);
const ranked = [...g.players].sort((a,b)=>b.tileCount-a.tileCount).slice(0,5)
  .map(p=>`${p.name}:${p.tileCount}`).join("  ");
console.log("standings:", ranked);
console.log("attacks in flight:", g.attacks.length, "dirty backlog:", g.dirty.size);

// build every structure on our own land and confirm the effects land
const own = [...me.tiles];
const before = g.capacity(me);
me.gold = 5000;
console.log("build castle:", g.build(me, "castle", own.find(t=>!g.structs.has(t))!));
console.log("capacity", before.toFixed(0), "->", g.capacity(me).toFixed(0));
const coast = own.find(t=>g.isCoastal(t) && !g.structs.has(t));
console.log("coastal tile found:", coast !== undefined, "harbor:", coast !== undefined ? g.build(me,"harbor",coast) : "n/a", "income", g.income(me).toFixed(2));
