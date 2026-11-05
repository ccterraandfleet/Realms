import { Game, fieldPower, SUPPLY_CUT } from "../src/sim/game";
import type { Army } from "../src/sim/game";

const say = (l: string, ok: boolean, d = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`);
type G = Game & {
  armyBattle(a: Army, p: unknown, foe: Army): void;
  armyTick(dt: number): void;
  claim(t: number, id: number): void;
};
const raw = (g: Game) => g as unknown as G;
const mk = (owner: number, troops: number, tile: number, supply = 1, morale = 1): Army => ({
  id: owner, owner, home: tile, troops, tile, target: tile, progress: 0, taken: 0,
  cutOff: false, speed: 1, supplyTimer: 0, supply, morale, routed: false, rallyTimer: 0,
  holding: true, holdTimer: 0,
});

// an army that outran its roads fights at a fraction of its paper strength
const fed = mk(0, 400, 0, 1, 1);
const hungry = mk(0, 400, 0, 0, 0.2);
say("supply and morale decide what a host actually fields", fieldPower(hungry) < fieldPower(fed) * 0.4,
  `${Math.round(fieldPower(hungry))} vs ${Math.round(fieldPower(fed))} per 400 men`);

// grinding contact: both bleed, neither evaporates in one beat
const g = new Game(7);
g.startMultiplayer(2);
g.era = "war";
const a = mk(0, 900, 0);
const b = mk(1, 500, 0);
raw(g).armyBattle(a, g.players[0], b);
say("contact costs both sides", a.troops < 900 && b.troops < 500, `${Math.round(a.troops)} vs ${Math.round(b.troops)}`);
say("contact costs morale", a.morale < 1 && b.morale < 1, `${a.morale.toFixed(2)} / ${b.morale.toFixed(2)}`);

// keep grinding until one line breaks: the weaker side routes, it is not deleted
let beats = 1;
while (beats < 40 && a.troops >= 20 && b.troops >= 20 && (a.morale > 0.02 || b.morale > 0.02)) {
  raw(g).armyBattle(a, g.players[0], b);
  beats++;
}
say("a beaten host routs rather than vanishing", b.routed || a.routed || b.troops < 20,
  `after ${beats} beats: A ${Math.round(a.troops)} men m${a.morale.toFixed(2)} routed ${a.routed}, B ${Math.round(b.troops)} men m${b.morale.toFixed(2)} routed ${b.routed}`);
say("routing is not death", b.routed ? b.troops > 0 : true, `B still has ${Math.round(b.troops)} men`);

// supply decays when the road home is gone
const cut = mk(0, 300, 100);
cut.cutOff = true;
cut.supplyTimer = 0;
const before = cut.supply;
(g as unknown as { armies: Army[] }).armies.push(cut);
// an unfed realm cannot keep a column in supply either
g.players[0].grain = 0;
g.players[0].rates.grain = -1;
for (let i = 0; i < 20; i++) { cut.supplyTimer = 0; raw(g).armyTick(0.1); }
say("a cut corridor drains supply", cut.supply < before - 0.3, `supply ${cut.supply.toFixed(2)} after 2s cut off (rate ${SUPPLY_CUT}/s)`);
