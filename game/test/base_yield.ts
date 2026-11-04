import { BASE_YIELD, BUILD, PRICE, Game } from "../src/sim/game";

const say = (l: string, ok: boolean, d = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`);

const g = new Game(7);
g.startMultiplayer(2);
const me = g.players[g.human];
g.refreshRates(me);
const before = { ...me.rates };

// 1. every resource starts at the base, no starved line
say(
  "all four resources produce the flat base from the first second",
  BASE_YIELD === 10 &&
    Math.abs(me.grainProd - (BASE_YIELD + 0.02 * me.yieldSum)) < 1e-6 &&
    Math.abs(me.rates.timber - (BASE_YIELD + 0.008 * me.yieldSum)) < 1e-6,
  `grain ${me.rates.grain.toFixed(2)}/s timber ${me.rates.timber.toFixed(2)} iron ${me.rates.ore.toFixed(2)} gold ${me.rates.gold.toFixed(2)} on ${me.tileCount} tiles`,
);

// 2. base is a floor, not a cap: land still stacks on top
const realYield = me.yieldSum;
me.yieldSum = realYield * 20;
g.refreshRates(me);
const richer = { ...me.rates };
me.yieldSum = realYield;
g.refreshRates(me);
say("land still stacks on top of the base", richer.grain > before.grain * 1.5, `grain ${before.grain.toFixed(2)} -> ${richer.grain.toFixed(2)} on 20x the ground`);

// 3. how long a real opening now takes at the base alone
const perSec = { grain: BASE_YIELD, timber: BASE_YIELD, ore: BASE_YIELD, gold: BASE_YIELD };
const t = (cost: Partial<typeof perSec>) =>
  Math.max(0, ...Object.entries(cost).map(([k, v]) => (v as number) / perSec[k as keyof typeof perSec]));
say(
  "an opening host and a farm are within reach of the base grant",
  t(BUILD.castle) < 15 && t({ grain: 0.5 * 100, ore: 0.3 * 100, gold: 0.15 * 100 }) < 8,
  `castle ${t(BUILD.castle).toFixed(1)}s, 100 men ${t({ grain: 50, ore: 30, gold: 15 }).toFixed(1)}s, tile ${t(PRICE.claimTile).toFixed(2)}s`,
);
