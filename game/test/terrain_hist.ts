import { generateWorld, OCEAN, SAND, PLAINS, FOREST, MOUNTAIN } from "../src/sim/world";
for (const seed of [7, 8, 19]) {
  const w = generateWorld(seed);
  const names = ["ocean", "sand", "plains", "forest", "mountain"];
  const counts = [0, 0, 0, 0, 0];
  for (const t of w.terrain) counts[t]++;
  const total = w.w * w.h;
  console.log(`seed ${seed}:`, names.map((n, i) => `${n} ${((counts[i] / total) * 100).toFixed(1)}%`).join("  "), `land ${((w.landTiles / total) * 100).toFixed(1)}%`);
  void [OCEAN, SAND, PLAINS, FOREST, MOUNTAIN];
}
