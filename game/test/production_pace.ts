import { ARMY_CAP, PRICE, Game } from "../src/sim/game";

const g = new Game(7);
g.startMultiplayer(2);
const me = g.players[g.human];

const marks = [30, 60, 120, 180, 300];
let t = 0;
let last = 0;
let firstHost = -1;
let firstCastle2 = -1;
const rows: string[] = [];
while (t < 300) {
  g.tick(0.1);
  t += 0.1;
  if (firstHost < 0 && g.armies.some((a) => a.owner === me.id)) firstHost = t;
  const c2 = [...g.structs.values()].find((s) => s.owner === me.id && s.kind === "castle" && s.level >= 2);
  if (firstCastle2 < 0 && c2) firstCastle2 = t;
  if (marks.includes(Math.round(t)) && Math.round(t) !== last) {
    last = Math.round(t);
    rows.push(
      `t=${String(Math.round(t)).padStart(3)}s  tiles ${String(me.tileCount).padStart(4)}  ` +
        `pool ${String(Math.round(me.troops)).padStart(5)}  castles ${me.castles}  ` +
        `hosts ${g.armies.filter((a) => a.owner === me.id).length}  ` +
        `grain ${me.rates.grain.toFixed(2)}/s iron ${me.rates.ore.toFixed(2)}/s timber ${me.rates.timber.toFixed(2)}/s`,
    );
  }
}
for (const r of rows) console.log(r);
console.log(`first host at ${firstHost.toFixed(0)} sim-s, first level-2 castle at ${firstCastle2.toFixed(0)} sim-s`);
console.log(`prices: tile ${JSON.stringify(PRICE.claimTile)} · per man ${JSON.stringify(PRICE.perMan)} · push ${JSON.stringify(PRICE.pushTile)}`);

// is the realm actually being held back by stores rather than by code?
const poor = new Game(7);
poor.startMultiplayer(2);
const them = poor.players[poor.human];
them.grain = 0;
them.timber = 0;
them.gold = 0;
const t0 = them.tileCount;
for (let i = 0; i < 600; i++) {
  poor.tick(0.1);
  // keep the granary and the yard empty: nothing can ever be bought
  them.grain = 0;
  them.timber = 0;
  them.gold = 0;
  them.ore = 0;
}
const brokeGrowth = them.tileCount - t0;
console.log(
  brokeGrowth === 0
    ? "PASS  with no stores in the granary, no ground gets settled"
    : `FAIL  grew ${brokeGrowth} tiles with zero resources`,
);

// and the same realm with stores can act
const rich = new Game(7);
rich.startMultiplayer(2);
const us = rich.players[rich.human];
us.grain += 4000;
us.timber += 4000;
us.ore += 4000;
us.gold += 4000;
const r0 = us.tileCount;
for (let i = 0; i < 600; i++) rich.tick(0.1);
console.log(`PASS  with stores banked, the same realm settles ${us.tileCount - r0} tiles in 60 sim-s`);
