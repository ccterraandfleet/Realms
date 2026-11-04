/**
 * Seeded world generation for Realms.
 *
 * Pure function of the seed: the same number always produces the same
 * continent, coastline, forests and mountain belts. Nothing here stores a map
 * file, so a world wipe is literally "pick another number".
 */

export const OCEAN = 0;
export const SAND = 1;
export const PLAINS = 2;
export const FOREST = 3;
export const MOUNTAIN = 4;

/** Troop capacity a tile contributes to the realm that holds it. */
export const DENSITY = [0, 5, 10, 8, 6];
/** Cost in troops to take one unowned tile. Cheap early on purpose: an
 *  opening army should swallow a dozen tiles, not stall on the first one. */
export const DEFENSE = [0, 8, 18, 15, 26];

export interface World {
  w: number;
  h: number;
  terrain: Uint8Array;
  landTiles: number;
  seed: number;
  /** Per-tile yield multiplier: the middle ground is worth far more than a pocket. */
  richness: Float32Array;
  /** Tile at the heart of each starting pocket, one pocket per lord. */
  pockets: number[];
  /** Tiles inside the middle ground. */
  middleTiles: number;
}

/** The middle ground pays this many times what a starting pocket pays. */
export const MIDDLE_RICHNESS = 3;
export const POCKET_RICHNESS = 1;
export const POCKET_COUNT = 12;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Tiling value-noise sampler over a random grid. */
function makeNoise(rand: () => number, size: number): (x: number, y: number) => number {
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (i: number, j: number) =>
    g[(((j % size) + size) % size) * size + (((i % size) + size) % size)];
  return (x: number, y: number) => {
    const fx = x * size;
    const fy = y * size;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

export function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

export function generateWorld(seed: number, w = 400, h = 260): World {
  const rand = mulberry32(seed);
  const e1 = makeNoise(rand, 6);
  const e2 = makeNoise(rand, 13);
  const ridge = makeNoise(rand, 9);
  const moist = makeNoise(rand, 11);
  const grain = makeNoise(rand, 61);

  // Where things are: one rich continent in the middle, and a ring of separate
  // starting pockets around it with water in between.
  const cx = w / 2;
  const cy = h / 2;
  const midRx = w * 0.235;
  const midRy = h * 0.235;

  const pockets: number[] = [];
  const pocketCentre: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < POCKET_COUNT; i++) {
    const ang = (i / POCKET_COUNT) * Math.PI * 2 + 0.16;
    const px = cx + Math.cos(ang) * midRx * 1.34;
    const py = cy + Math.sin(ang) * midRy * 1.34;
    if (px < 8 || py < 8 || px > w - 9 || py > h - 9) continue;
    pocketCentre.push({ x: px, y: py, r: 15 + rand() * 5 });
    pockets.push(idx(w, Math.round(px), Math.round(py)));
  }

  const forced = new Uint8Array(w * h);   // 1 = middle, 2 = pocket
  const richness = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      const dx = (x - cx) / midRx;
      const dy = (y - cy) / midRy;
      if (dx * dx + dy * dy <= 1) {
        forced[i] = 1;
        // Richer toward the heart of the middle ground, but always worth far
        // more than any pocket.
        const core = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
        richness[i] = POCKET_RICHNESS + (MIDDLE_RICHNESS - POCKET_RICHNESS) * (0.8 + 0.2 * core);
        continue;
      }
      for (const c of pocketCentre) {
        const px = (x - c.x) / c.r;
        const py = (y - c.y) / c.r;
        if (px * px + py * py <= 1) {
          forced[i] = 2;
          richness[i] = POCKET_RICHNESS;
          break;
        }
      }
    }
  }

  // Terrain within the ground we forced: noise decides plains, forest, sand,
  // mountains; the mask decides where land exists at all.
  const landElev: number[] = [];
  const wetLand: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      if (!forced[i]) continue;
      const nx = x / w;
      const ny = y / h;
      let e =
        0.55 * e1(nx * 1.7, ny * 1.7) +
        0.4 * e2(nx * 3.3, ny * 3.3) +
        0.3 * Math.max(0, 1 - Math.abs(ridge(nx * 2.2, ny * 2.2) * 2 - 1));
      landElev.push(e);
      wetLand.push(moist((x / w) * 2.4, (y / h) * 2.4));
    }
  }
  const sorted = landElev.slice().sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  const sandCut = q(sorted, 0.07);
  const mountainCut = q(sorted, 0.86);
  const wetSorted = wetLand.slice().sort((a, b) => a - b);
  const forestCut = q(wetSorted, 0.62);

  const terrain = new Uint8Array(w * h);
  let landTiles = 0;
  let middleTiles = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      if (!forced[i]) {
        terrain[i] = OCEAN;
        continue;
      }
      const nx = x / w;
      const ny = y / h;
      const e =
        0.55 * e1(nx * 1.7, ny * 1.7) +
        0.4 * e2(nx * 3.3, ny * 3.3) +
        0.3 * Math.max(0, 1 - Math.abs(ridge(nx * 2.2, ny * 2.2) * 2 - 1));
      const m = moist((x / w) * 2.4, (y / h) * 2.4);
      let t: number;
      if (e <= sandCut) t = SAND;
      else if (e > mountainCut) t = MOUNTAIN;
      else t = m > forestCut ? FOREST : PLAINS;
      terrain[i] = t;
      landTiles++;
      if (forced[i] === 1) middleTiles++;
    }
  }

  // Fine grain on plains, but never punch a hole in a starting pocket or the
  // middle: those shapes are the map.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(w, x, y);
      if (forced[i]) continue;
      if (terrain[i] === OCEAN) continue;
      let water = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (terrain[idx(w, x + dx, y + dy)] === OCEAN) water++;
      if (water >= 7) {
        terrain[i] = OCEAN;
        landTiles--;
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(w, x, y);
      if (terrain[i] === PLAINS && grain((x / w) * 3, (y / h) * 3) > 0.74) terrain[i] = FOREST;
    }
  }

  return { w, h, terrain, landTiles, seed, richness, pockets, middleTiles };
}
