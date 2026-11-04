import { Game } from "../src/sim/game";
const h = new Game(7);
let s = -1;
for (let i = 0; i < h.owners.length; i++) if (h.isLand(i) && h.owners[i] < 0) { s = i; break; }
h.chooseStart(s);
const small = h.players[h.human];
const big = h.players.find((p) => p.isBot)!;
big.isBot = false;
const s2 = h.neighbors4(s).find((n) => h.isLand(n))!;
h.armies.length = 0;
h.armies.push({ id: 900, owner: small.id, home: s, troops: 100, tile: s, target: s2, progress: 0, taken: 0, cutOff: false, speed: 2, supplyTimer: 9, holding: false, holdTimer: 0 });
h.armies.push({ id: 901, owner: big.id, home: s2, troops: 1000, tile: s2, target: s1(), progress: 0, taken: 0, cutOff: false, speed: 0, supplyTimer: 9, holding: true, holdTimer: 0 });
function s1() { return s; }
console.log("owner of s2:", h.owners[s2], "small id", small.id, "big id", big.id, "dist", h.tileDistance(s, s2));
for (let i = 0; i < 14; i++) {
  h.tick(0.1);
  const at = h.armies.find((a) => a.id === 900);
  const df = h.armies.find((a) => a.id === 901);
  console.log(i, "attacker", at ? `tile ${at.tile} troops ${Math.round(at.troops)} prog ${at.progress.toFixed(2)} hold ${at.holding}` : "gone", "| defender", df ? `tile ${df.tile} ${Math.round(df.troops)}` : "gone");
}
