import { Game, PEACE_YEARS, YEAR_SECONDS, fieldPower } from "../src/sim/game";
import type { Army } from "../src/sim/game";

const say = (l: string, ok: boolean, d = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`);
type G = Game & {
  armyBattle(a: Army, p: unknown, foe: Army): void;
  surveyPressure(a: Army): void;
  moraleTarget(a: Army): number;
  claim(t: number, id: number): void;
};
const raw = (g: Game) => g as unknown as G;
const mk = (id: number, owner: number, troops: number, tile: number, tier = 1): Army => ({
  id, owner, home: tile, troops, tile, target: tile, progress: 0, taken: 0,
  cutOff: false, speed: 1, supplyTimer: 0, supply: 1, morale: 1, routed: false, rallyTimer: 0,
  contactTimer: 0, tier, support: 0, threat: 0, flankSides: 0, pulling: false, holding: true, holdTimer: 0,
});

/* ---- the era: peace is a real phase, not a label ---- */
const g = new Game(7);
g.startMultiplayer(2);
say("a new world starts at peace", g.era === "peace" && g.year === 0, `era ${g.era}`);

// Two hostile hosts standing on each other's ground cannot fight yet.
const A = mk(1, 0, 800, 0), B = mk(2, 1, 800, 0);
(g as unknown as { armies: Army[] }).armies.push(A, B);
raw(g).armyBattle(A, g.players[0], B);
say("no blood is spilled in peacetime", A.troops === 800 && B.troops === 800, `${A.troops} vs ${B.troops}`);

// The years run out and the roads become military.
g.time = YEAR_SECONDS * PEACE_YEARS + 5;
g.tick(0.1);
say("war comes when the years run out", g.era === "war", `year ${g.year} of ${PEACE_YEARS}`);

/* ---- morale reads the field ---- */
const foeNear = mk(3, 1, 600, 0);
(g as unknown as { armies: Army[] }).armies.push(foeNear);
A.tile = 0; B.tile = 4; foeNear.tile = 2;
raw(g).surveyPressure(A);
const alone = raw(g).moraleTarget(A);
A.support = 0; A.threat = 0; A.flankSides = 0;
const bare = raw(g).moraleTarget(A);
say("being outweighed shakes morale", alone < bare, `${alone.toFixed(2)} pressed vs ${bare.toFixed(2)} alone`);

const friend = mk(4, 0, 900, 2);
(g as unknown as { armies: Army[] }).armies.push(friend);
raw(g).surveyPressure(A);
const reinforced = raw(g).moraleTarget(A);
say("friends near a host steady it", reinforced > alone, `${reinforced.toFixed(2)} reinforced vs ${alone.toFixed(2)} pressed`);
say("the survey counts the sides the pressure comes from", A.flankSides >= 1, `${A.flankSides} side(s)`);

/* ---- flanking breaks levies, not testudo ---- */
const flankedLoss = (tier: number, sides: number) => {
  const atk = mk(10, 1, 1000, 0, 1);
  const host = mk(11, 0, 1000, 0, tier);
  host.flankSides = sides;
  host.threat = 5000;
  host.support = 0;
  const before = host.troops;
  raw(g).armyBattle(atk, g.players[1], host);
  return before - host.troops;
};
const levyFlanked = flankedLoss(1, 3);
const testudoFlanked = flankedLoss(3, 3);
say("a levy surrounded is swamped", levyFlanked > 0, `levy lost ${Math.round(levyFlanked)} men`);
say("testudo endures what a levy cannot", testudoFlanked < levyFlanked * 0.6,
  `testudo lost ${Math.round(testudoFlanked)} vs levy ${Math.round(levyFlanked)}`);
say("tier is real strength too", fieldPower({ ...mk(12, 0, 100, 0, 3), support: 0, threat: 0 }) > fieldPower(mk(13, 0, 100, 0, 1)) * 1.5,
  `${Math.round(fieldPower({ ...mk(14, 0, 100, 0, 3), support: 0, threat: 0 }))} vs ${Math.round(fieldPower(mk(15, 0, 100, 0, 1)))} per 100 men`);

/* ---- pull back: the other half of front control ---- */
const h2 = new Game(7);
h2.startMultiplayer(1);
const me = h2.players[0];
(h2 as unknown as { armies: Army[] }).armies.push({ ...mk(20, 0, 300, 0), home: 0, tile: 40, holding: true, target: 40 });
const marched = (h2 as unknown as { armies: Army[] }).armies[0];
const pulled = h2.withdrawArmy(me, 0);
say("a host can be pulled back on command", pulled && marched.pulling, `pulling=${marched.pulling}`);

/* ---- tiers cost, and the castle has to be big enough ---- */
const h3 = new Game(7);
h3.startMultiplayer(1);
const p3 = h3.players[0];
(h3 as unknown as { armies: Army[] }).armies.push({ ...mk(30, 0, 250, 0), home: 0 });
say("a tier needs a castle that can field it", h3.upgradeHost(p3, 0) === false, "level 1 castle refused a tier 2 host");
