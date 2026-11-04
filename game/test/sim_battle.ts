import { Game } from "../src/sim/game";

function fresh() {
  const g = new Game(7);
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

// carve a rival holding right on the player's border
function borderRival(g: Game, me: { id: number; tiles: Set<number> }) {
  const rival = g.players.find(p => p.isBot)!;
  const edge = [...me.tiles].reduce((a, b) => (b % g.world.w > a % g.world.w ? b : a));
  const x = edge % g.world.w, y = (edge / g.world.w) | 0;
  const tiles: number[] = [];
  for (let dx = 1; dx <= 6; dx++) {
    for (let dy = -6; dy <= 6; dy++) {
      const t = g.tileAt(x + dx, y + dy);
      if (t >= 0 && g.isLand(t) && g.ownerAt(t) < 0) tiles.push(t);
    }
  }
  for (const t of tiles) {
    g.owners[t] = rival.id;
    rival.tiles.add(t);
    rival.tileCount++;
    g.dirty.add(t);
  }
  const castleTile = tiles[Math.floor(tiles.length / 2)];
  g.structs.set(castleTile, { kind: "castle", owner: rival.id, tile: castleTile, level: 2 });
  rival.castles += 2;
  rival.immune = 0;
  return { rival, castleTile, size: tiles.length };
}

// --- a strong push should break the line ---
{
  const { g, me } = fresh();
  const { rival, castleTile } = borderRival(g, me);
  me.troops = 20000;
  rival.troops = 1500;
  const target = castleTile;
  const defBefore = g.defenseAt(target, rival.id);
  console.log(`defended border tile: ${Math.round(defBefore)} troops to break (rival host ${Math.round(rival.troops)})`);
  const before = me.tileCount, rivalBefore = rival.tileCount;
  g.orderArmy(me, target, 0.9);
  const a = g.armies[0];
  console.log(`launched a push of ${Math.round(a.troops)} at a ${Math.round(defBefore)} defence`);
  for (let s = 0; s < 200; s++) g.tick(0.1);
  console.log(`strong push: mine ${before} -> ${me.tileCount}, rival ${rivalBefore} -> ${rival.tileCount}, castle owner now ${g.structs.get(target)?.owner === me.id ? "MINE" : "rival"}`);
}

// --- a weak push should break against the line ---
{
  const { g, me } = fresh();
  const { rival, castleTile } = borderRival(g, me);
  me.troops = 400;
  rival.troops = 9000;
  const target = castleTile;
  const def = g.defenseAt(target, rival.id);
  g.orderArmy(me, target, 0.9);
  const a = g.armies[0];
  const before = me.tileCount;
  for (let s = 0; s < 120; s++) g.tick(0.1);
  const gone = !g.armies.includes(a);
  console.log(`weak push of ${Math.round(a.troops)} vs ${Math.round(def)} defence: mine ${before} -> ${me.tileCount}, rival kept ${rival.tileCount}, push broken: ${gone || a.holding}`);
}

// --- a cut-off column with hostile ground on all sides gets routed ---
{
  const { g, me } = fresh();
  const { rival, castleTile } = borderRival(g, me);
  me.troops = 9000;
  rival.troops = 300;
  g.orderArmy(me, castleTile, 0.7);
  const a = g.armies[0];
  for (let s = 0; s < 40; s++) g.tick(0.1);
  // surround the column: every friendly tile within 5 tiles becomes rival land
  const ax = a.tile % g.world.w, ay = (a.tile / g.world.w) | 0;
  let severed = 0;
  for (let dx = -5; dx <= 5; dx++) {
    for (let dy = -5; dy <= 5; dy++) {
      const t = g.tileAt(ax + dx, ay + dy);
      if (t < 0 || g.ownerAt(t) !== me.id) continue;
      g.owners[t] = rival.id;
      me.tiles.delete(t); rival.tiles.add(t);
      me.tileCount--; rival.tileCount++; severed++;
      g.dirty.add(t);
    }
  }
  const t0 = a.troops;
  let routed = false;
  for (let s = 0; s < 80; s++) {
    g.tick(0.1);
    if (!g.armies.includes(a)) { routed = true; break; }
  }
  console.log(`surrounded by ${severed} hostile tiles: cutOff ${a.cutOff}, ${Math.round(t0)} -> ${Math.round(a.troops)} troops, routed: ${routed}`);
}
