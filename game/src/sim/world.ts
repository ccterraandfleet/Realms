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
}

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
  const e3 = makeNoise(rand, 29);
  const ridge = makeNoise(rand, 9);
  const moist = makeNoise(rand, 11);
  const grain = makeNoise(rand, 61);

  // Raw elevation per tile, then an island mask so the realm has coastlines
  // instead of running to the map edge.
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const ny = y / h;
      let e =
        0.55 * e1(nx * 1.7, ny * 1.7) +
        0.3 * e2(nx * 3.3, ny * 3.3) +
        0.15 * e3(nx * 6.1, ny * 6.1);
      // Ridged noise lifts mountain belts out of the plains.
      e += Math.max(0, 1 - Math.abs(ridge(nx * 2.2, ny * 2.2) * 2 - 1)) * 0.22;
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const d = Math.sqrt(dx * dx * 0.92 + dy * dy * 1.05);
      e -= smooth(Math.min(1, Math.max(0, (d - 0.52) / 0.62))) * 0.72;
      raw[idx(w, x, y)] = e;
    }
  }

  // Thresholds come from percentiles of the map's own elevation and moisture
  // distribution. Fixed offsets gave a quarter of the world as bare mountain;
  // ranked cuts keep the mix sane on every seed.
  const all: number[] = Array.from(raw);
  const sorted = all.slice().sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  const oceanLevel = q(sorted, 0.42);
  const landElev = sorted.filter((e) => e >= oceanLevel);
  const sandCut = q(landElev, 0.055);
  const mountainCut = q(landElev, 0.84);

  const moisture = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      moisture[idx(w, x, y)] = moist((x / w) * 2.4, (y / h) * 2.4);
    }
  }
  const wetLand: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] >= oceanLevel && raw[i] <= mountainCut) wetLand.push(moisture[i]);
  }
  wetLand.sort((a, b) => a - b);
  const forestCut = q(wetLand, 0.66);

  const terrain = new Uint8Array(w * h);
  let landTiles = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      const e = raw[i];
      let t: number;
      if (e < oceanLevel) t = OCEAN;
      else if (e <= sandCut) t = SAND;
      else if (e > mountainCut) t = MOUNTAIN;
      else t = moisture[i] > forestCut ? FOREST : PLAINS;
      terrain[i] = t;
      if (t !== OCEAN) landTiles++;
    }
  }

  // Speckle: single-tile lakes and lone rocks read as noise, not geography.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(w, x, y);
      if (terrain[i] === OCEAN) continue;
      let water = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (terrain[idx(w, x + dx, y + dy)] === OCEAN) water++;
      if (water >= 7) {
        terrain[i] = OCEAN;
        landTiles--;
      }
      // Fine grain keeps large plains from looking like flat paint.
      if (terrain[i] === PLAINS && grain(x / w * 3, y / h * 3) > 0.72) terrain[i] = FOREST;
    }
  }

  return { w, h, terrain, landTiles, seed };
}
