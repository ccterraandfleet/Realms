import { Game } from "../src/sim/game";

const g = new Game(11);
let seat = -1, bs = -1;
for (let i = 0; i < g.owners.length; i += 5) {
  if (!g.isLand(i) || g.owners[i] >= 0) continue;
  const q = g.siteQuality(i, 5);
  if (q > bs) { bs = q; seat = i; }
}
g.chooseStart(seat);
const me = g.players[g.human];
const before = me.tileCount;
// click far to the east: a blob should form, not a one-tile line
const w = g.world.w;
const row = (seat / w) | 0;
const target = (row * w) + ((seat % w) + 9);
for (let i = 0; i < 12; i++) { g.tick(0.1); if (i % 3 === 0) g.orderArmy(me, target, 0.4); }
const shapes = me.tileCount - before;
let maxRow = 0, maxCol = 0;
const rows = new Map<number, number>(); const cols = new Map<number, number>();
for (const t of me.tiles) { const r = (t / w) | 0, c = t % w; rows.set(r, (rows.get(r) ?? 0) + 1); cols.set(c, (cols.get(c) ?? 0) + 1); }
for (const v of rows.values()) maxRow = Math.max(maxRow, v);
for (const v of cols.values()) maxCol = Math.max(maxCol, v);
console.log({ tilesGained: shapes, widestRow: maxRow, widestCol: maxCol, armies: g.armies.length });
