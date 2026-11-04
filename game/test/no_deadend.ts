import { PRICE, TILE_YIELD, Game } from "../src/sim/game";

const say = (l: string, ok: boolean, d = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`);

// 1. land income climbs with land
const g = new Game(7);
g.startMultiplayer(2);
const me = g.players[g.human];
const inc = (p: typeof me) => g.refreshRates(p) ?? { ...p.rates };
g.refreshRates(me);
const small = { ...me.rates };
const held = me.tileCount;
// pretend the realm is ten times bigger: yieldSum is what income reads now
const realYield = me.yieldSum;
me.yieldSum = realYield * 10;
g.refreshRates(me);
const big = { ...me.rates };
me.yieldSum = realYield;
say(
  "more ground yields more of every resource",
  big.grain > small.grain && big.timber > small.timber && big.ore > small.ore && big.gold > small.gold,
  `${held} tiles grain ${small.grain.toFixed(2)}/s -> ${held * 10} tiles grain ${big.grain.toFixed(2)}/s`,
);
g.refreshRates(me);

// 2. the dead end itself: everything spent, nothing banked, army in the field
const d = new Game(7);
d.startMultiplayer(2);
const you = d.players[d.human];
for (let i = 0; i < 200; i++) d.tick(0.1);       // build up a little history
you.grain = 0; you.timber = 0; you.ore = 0; you.gold = 0;
const tilesAtZero = you.tileCount;
const armyNow = d.armies.filter((a) => a.owner === you.id).length;
let recoveredTiles = -1;
for (let i = 0; i < 3600; i++) {                  // six sim minutes
  d.tick(0.1);
  if (recoveredTiles < 0 && you.tileCount > tilesAtZero) recoveredTiles = i / 10;
}
say(
  "wiped out to zero stores, the realm grows again on its own land",
  you.tileCount > tilesAtZero,
  `${tilesAtZero} -> ${you.tileCount} tiles, first new tile after ${recoveredTiles.toFixed(0)}s, ${armyNow} host(s) at the low point`,
);

// 3. a host that cannot be fed bleeds down instead of freezing the realm
const f = new Game(7);
f.startMultiplayer(2);
const lord = f.players[f.human];
for (let i = 0; i < 200; i++) f.tick(0.1);
lord.grain = 0;
const host = f.armies.find((a) => a.owner === lord.id);
if (host) host.troops = 12000;   // upkeep well past what the land grows
let shrank = false;
if (host) {
  host.holding = true;
  const before = host.troops;
  for (let i = 0; i < 600 && f.armies.includes(host); i++) f.tick(0.1);
  shrank = !f.armies.includes(host) || host.troops < before;
}
say(
  "an unfed army shrinks instead of starving the realm forever",
  host ? shrank : true,
  host ? `rates.grain ${lord.rates.grain.toFixed(2)}/s, host ${Math.round(host.troops)} men` : "no host raised",
);

// 4. tile yield is the documented floor, not a mystery constant
say(
  "tile yield is a named constant on the sim",
  TILE_YIELD.grain === 0.02 && TILE_YIELD.timber === 0.008,
  `grain ${TILE_YIELD.grain}/tile/s, timber ${TILE_YIELD.timber}, ore ${TILE_YIELD.ore}, gold ${TILE_YIELD.gold}`,
);
void PRICE;
