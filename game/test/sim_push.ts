import { Game } from "../src/sim/game";

function fresh(seed = 7) {
  const g = new Game(seed);
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.owners.length; i++) {
    if (!g.isLand(i) || g.owners[i] >= 0) continue;
    const x = i % g.world.w, y = (i / g.world.w) | 0;
    const d = Math.hypot(x - g.world.w / 2, y - g.world.h / 2);
    if (d < bd) { bd = d; best = i; }
  }
  g.chooseStart(best);
  return { g, me: g.players[g.human], start: best };
}

// --- 1. a click launches a push that drives inward tile by tile ---
{
  const { g, me } = fresh();
  me.troops = 4000;
  const before = me.tileCount;
  const castle = [...g.structs.values()].find(s => s.owner === me.id)!;
  const tx = castle.tile % g.world.w, ty = (castle.tile / g.world.w) | 0;
  const target = g.tileAt(tx + 18, ty + 4)!;
  const ok = g.orderArmy(me, target, 0.6);
  const army = g.armies[0];
  console.log("1) launched:", ok, "troops", Math.round(army.troops), "speed", army.speed.toFixed(2), "t/s");
  const track: number[] = [];
  for (let step = 0; step < 60; step++) {   // 6 seconds
    g.tick(0.1);
    if (step % 10 === 0 && g.armies[0]) {
      const a = g.armies[0];
      track.push(Math.round(Math.hypot((a.tile % g.world.w) - tx, ((a.tile / g.world.w) | 0) - ty)));
    }
  }
  console.log("   distance from castle over time:", track.join(" -> "), "| tiles taken by push:", g.armies[0]?.taken ?? "army spent");
  console.log("   tiles:", before, "->", me.tileCount, "| army advanced:", g.armies[0] ? g.armies[0].tile !== army.tile : false);
}

// --- 2. stronger column moves faster and takes more ground ---
{
  const results: string[] = [];
  for (const troops of [400, 4000]) {
    const { g, me } = fresh();
    me.troops = troops * 3;
    const castle = [...g.structs.values()].find(s => s.owner === me.id)!;
    const tx = castle.tile % g.world.w, ty = (castle.tile / g.world.w) | 0;
    const target = g.tileAt(tx + 30, ty)!;
    g.orderArmy(me, target, 0.95);
    const a = g.armies[0];
    const startTile = a.tile;
    for (let s = 0; s < 40; s++) g.tick(0.1);
    const moved = Math.hypot((a.tile % g.world.w) - (startTile % g.world.w), ((a.tile / g.world.w) | 0) - ((startTile / g.world.w) | 0));
    results.push(`${Math.round(a.troops)} troops: ${moved.toFixed(1)} tiles in 4s`);
  }
  console.log("2) speed scales with strength ->", results.join("  |  "));
}

// --- 3. cut off and surrounded, the column bleeds out and routs ---
{
  const { g, me } = fresh();
  me.troops = 6000;
  const castle = [...g.structs.values()].find(s => s.owner === me.id)!;
  const tx = castle.tile % g.world.w, ty = (castle.tile / g.world.w) | 0;
  const target = g.tileAt(tx + 26, ty)!;
  g.orderArmy(me, target, 0.5);
  const a = g.armies[0];
  for (let s = 0; s < 60; s++) g.tick(0.1);   // let it get out into the open
  console.log("3) army out at", a.tile, "troops", Math.round(a.troops), "cutOff:", a.cutOff);
  // sever the corridor home: hand every friendly tile between the column and
  // the castle to a rival lord
  const rival = g.players.find(p => p.isBot)!;
  const ax = a.tile % g.world.w, ay = (a.tile / g.world.w) | 0;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      const t = g.tileAt(ax + dx * 2, ay + dy * 2);
      if (t >= 0 && g.ownerAt(t) === me.id) {
        // sneak ownership across without altering the rival's own holdings
        g.owners[t] = rival.id;
        me.tiles.delete(t); rival.tiles.add(t);
        me.tileCount--; rival.tileCount++;
        g.dirty.add(t);
      }
    }
  }
  const t0 = a.troops;
  for (let s = 0; s < 40; s++) g.tick(0.1);
  const stillThere = g.armies.includes(a);
  console.log(`   after severing: cutOff ${a.cutOff}, troops ${Math.round(t0)} -> ${Math.round(a.troops)}, still in the field: ${stillThere}`);
}

// --- 4. a full match still runs, bots push, perf holds ---
{
  const { g, me } = fresh();
  const t0 = performance.now();
  for (let step = 0; step < 3600; step++) {
    g.tick(0.1);
    if (step % 3 === 0) {
      const targets: { t: number; cost: number }[] = [];
      for (const i of me.tiles) for (const n of g.neighbors8(i)) {
        if (!g.canAttack(me, n)) continue;
        const o = g.owners[n];
        targets.push({ t: n, cost: o >= 0 ? g.players[o].troops : g.neutralDefense(n) });
      }
      targets.sort((x, y) => x.cost - y.cost);
      if (targets[0]) g.orderArmy(me, targets[0].t, 0.35);
    }
    if (g.phase === "over") break;
  }
  const ms = performance.now() - t0;
  console.log(`4) 6 min: ${ms.toFixed(0)}ms (${(ms / 3600).toFixed(3)}ms/tick) tiles ${me.tileCount} share ${(g.landShare(me) * 100).toFixed(1)}% armies alive ${g.armies.length}`);
  const ranked = [...g.players].sort((a, b) => b.tileCount - a.tileCount).slice(0, 3).map(p => `${p.name}:${p.tileCount}`).join("  ");
  console.log("   standings:", ranked, "| phase", g.phase);
}
