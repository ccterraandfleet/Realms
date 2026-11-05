import { Game, SURRENDER_KEEP } from "../src/sim/game";

const say = (l: string, ok: boolean, d = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`);
type G = Game & { claim(t: number, id: number): void; checkSurrender(dt: number): void; checkStanding(): void };
const raw = (g: Game) => g as unknown as G;

// two realms on a shared world
const g = new Game(7);
g.startMultiplayer(2);
const a = g.players[0];
const b = g.players[1];
raw(g).claim(5000, a.id); // make sure peak tracking is live
const peakB = b.tileCount;
say("a spawned realm records its peak", b.peak === peakB && peakB > 0, `peak ${b.peak}, tiles ${b.tileCount}`);

// take 79% of B: B must still be standing
const tilesB = [...b.tiles];
const seventyNine = Math.floor(tilesB.length * 0.79);
for (let i = 0; i < seventyNine; i++) raw(g).claim(tilesB[i], a.id);
raw(g).checkSurrender(1);
say("79% captured is not a capitulation", b.alive, `B holds ${b.tileCount} of ${peakB}`);

// push past 80%: B breaks and the remainder goes to A
const leftB = [...b.tiles];
for (const t of leftB.slice(0, Math.max(1, Math.floor(leftB.length * 0.2)))) raw(g).claim(t, a.id);
const heldByB = b.tileCount;
const aBefore = a.tileCount;
raw(g).checkSurrender(1);
const aGained = a.tileCount - aBefore;
say("past 80% the realm breaks", !b.alive, `B held ${heldByB} of peak ${peakB}`);
say("its remaining ground passes to the taker", aGained === heldByB && b.tileCount === 0, `A gained ${aGained}, B left ${b.tileCount}`);
say("the breaking point really is 80%", Math.abs(SURRENDER_KEEP - 0.2) < 1e-9, `keep ${SURRENDER_KEEP}`);

// last man standing ends the world
const g2 = new Game(7);
g2.startMultiplayer(2);
const winner = g2.players[0];
for (const p of g2.players) {
  if (p.id === winner.id || !p.alive) continue;
  for (const t of [...p.tiles]) raw(g2).claim(t, winner.id);
  p.peak = Math.max(p.peak, 1);
  p.alive = false;
}
raw(g2).checkStanding();
say("one realm left ends the world", g2.phase === "over" && g2.winner === winner.id, `phase ${g2.phase}, winner ${g2.winner}`);
