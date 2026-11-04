// src/sim/world.ts
var OCEAN = 0;
var SAND = 1;
var PLAINS = 2;
var FOREST = 3;
var MOUNTAIN = 4;
var DENSITY = [0, 5, 10, 8, 6];
var DEFENSE = [0, 8, 18, 15, 26];
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = a + 1831565813 >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var smooth = (t) => t * t * (3 - 2 * t);
function makeNoise(rand, size) {
  const g2 = new Float32Array(size * size);
  for (let i = 0; i < g2.length; i++) g2[i] = rand();
  const at = (i, j) => g2[(j % size + size) % size * size + (i % size + size) % size];
  return (x, y) => {
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
function idx(w2, x, y) {
  return y * w2 + x;
}
function generateWorld(seed, w2 = 400, h = 260) {
  const rand = mulberry32(seed);
  const e1 = makeNoise(rand, 6);
  const e2 = makeNoise(rand, 13);
  const e3 = makeNoise(rand, 29);
  const ridge = makeNoise(rand, 9);
  const moist = makeNoise(rand, 11);
  const grain = makeNoise(rand, 61);
  const raw = new Float32Array(w2 * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w2; x++) {
      const nx = x / w2;
      const ny = y / h;
      let e = 0.55 * e1(nx * 1.7, ny * 1.7) + 0.3 * e2(nx * 3.3, ny * 3.3) + 0.15 * e3(nx * 6.1, ny * 6.1);
      e += Math.max(0, 1 - Math.abs(ridge(nx * 2.2, ny * 2.2) * 2 - 1)) * 0.22;
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const d = Math.sqrt(dx * dx * 0.92 + dy * dy * 1.05);
      e -= smooth(Math.min(1, Math.max(0, (d - 0.52) / 0.62))) * 0.72;
      raw[idx(w2, x, y)] = e;
    }
  }
  const all = Array.from(raw);
  const sorted = all.slice().sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  const oceanLevel = q(sorted, 0.42);
  const landElev = sorted.filter((e) => e >= oceanLevel);
  const sandCut = q(landElev, 0.055);
  const mountainCut = q(landElev, 0.84);
  const moisture = new Float32Array(w2 * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w2; x++) {
      moisture[idx(w2, x, y)] = moist(x / w2 * 2.4, y / h * 2.4);
    }
  }
  const wetLand = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] >= oceanLevel && raw[i] <= mountainCut) wetLand.push(moisture[i]);
  }
  wetLand.sort((a, b) => a - b);
  const forestCut = q(wetLand, 0.66);
  const terrain = new Uint8Array(w2 * h);
  let landTiles = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w2; x++) {
      const i = idx(w2, x, y);
      const e = raw[i];
      let t;
      if (e < oceanLevel) t = OCEAN;
      else if (e <= sandCut) t = SAND;
      else if (e > mountainCut) t = MOUNTAIN;
      else t = moisture[i] > forestCut ? FOREST : PLAINS;
      terrain[i] = t;
      if (t !== OCEAN) landTiles++;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w2 - 1; x++) {
      const i = idx(w2, x, y);
      if (terrain[i] === OCEAN) continue;
      let water = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (terrain[idx(w2, x + dx, y + dy)] === OCEAN) water++;
      if (water >= 7) {
        terrain[i] = OCEAN;
        landTiles--;
      }
      if (terrain[i] === PLAINS && grain(x / w2 * 3, y / h * 3) > 0.72) terrain[i] = FOREST;
    }
  }
  return { w: w2, h, terrain, landTiles, seed };
}

// src/sim/game.ts
var STRUCT_ORDER = [
  "castle",
  "farm",
  "lumber",
  "mine",
  "market",
  "tower",
  "siege"
];
var BUILD = {
  castle: { grain: 0, timber: 70, ore: 45, gold: 60 },
  farm: { grain: 0, timber: 45, ore: 0, gold: 10 },
  lumber: { grain: 35, timber: 0, ore: 0, gold: 10 },
  mine: { grain: 45, timber: 70, ore: 0, gold: 15 },
  market: { grain: 25, timber: 55, ore: 0, gold: 20 },
  tower: { grain: 0, timber: 55, ore: 25, gold: 30 },
  siege: { grain: 35, timber: 65, ore: 70, gold: 40 }
};
var STRUCTURE_LABEL = {
  castle: "Castle",
  farm: "Farm",
  lumber: "Lumber Camp",
  mine: "Iron Mine",
  market: "Market",
  tower: "Watchtower",
  siege: "Siege Camp"
};
var YIELD = {
  farm: { grain: 0.55 },
  lumber: { timber: 0.45 },
  mine: { ore: 0.32 },
  market: { gold: 0.5 }
};
var TERRAIN_FOR = {
  farm: PLAINS,
  lumber: FOREST,
  mine: MOUNTAIN
};
var UPKEEP_PER_TROOP = 1e-3;
var FEED_SHARE = 0.8;
var ORE_PER_TROOP = 4e-3;
var RATIONS_PER_TROOP = 4e-3;
var PALETTE = [
  "#c0392b",
  // crimson
  "#2b6ca3",
  // royal blue
  "#3d7a3a",
  // forest green
  "#b8860b",
  // gold
  "#6c3d8f",
  // purple
  "#1f8f8f",
  // teal
  "#c26a1e",
  // burnt orange
  "#8f2d4a",
  // wine
  "#55606b",
  // slate
  "#7a6a3a",
  // olive
  "#4a5fa8",
  // indigo
  "#a0453a"
  // brick
];
var LORD_NAMES = [
  "Lord Aldric",
  "Baroness Vey",
  "Duke Marrow",
  "Lady Sable",
  "Lord Hesk",
  "Earl Bronn",
  "Baron Krell",
  "Lady Ostrand",
  "Lord Vane",
  "Duke Ferrow",
  "Countess Wren",
  "Lord Mallister",
  "Baron Thane",
  "Lady Corvane",
  "Lord Ashen",
  "Earl Dunmore"
];
var MIN_ARMIES_PER_PLAYER = 3;
var MAX_ARMIES_PER_PLAYER = 10;
var MAX_ARMIES = 220;
var HOLD_BEFORE_ABSORB = 8;
var IMMUNITY = 20;
var SPAWN_RADIUS = 5;
var BOT_SPAWN_RADIUS = 4;
var Game = class {
  constructor(seed, w2 = 400, h = 260) {
    this.seed = seed;
    this.players = [];
    this.structs = /* @__PURE__ */ new Map();
    this.armies = [];
    this.time = 0;
    this.phase = "spawn";
    this.winner = -1;
    /** Tiles whose ownership changed since the renderer last repainted. */
    this.dirty = /* @__PURE__ */ new Set();
    this.structDirty = true;
    this.messages = [];
    this.human = 0;
    /** Every seat taken so far, so spawns stay apart. */
    this.seats = [];
    this.nextArmyId = 1;
    this.world = generateWorld(seed, w2, h);
    this.owners = new Int16Array(w2 * h).fill(-1);
    this.rng = mulberry32(seed ^ 2654435769);
  }
  note(text) {
    this.messages.push({ t: this.time, text });
    if (this.messages.length > 60) this.messages.shift();
  }
  addPlayer(name, color, isBot) {
    const p = {
      id: this.players.length,
      name,
      color,
      isBot,
      alive: true,
      gold: 60,
      grain: 90,
      timber: 110,
      ore: 55,
      soldiers: 0,
      starving: false,
      grainProd: 0,
      rates: { grain: 0, timber: 0, ore: 0, gold: 0 },
      troops: 0,
      tileCount: 0,
      castles: 0,
      immune: 0,
      aiTimer: 0,
      density: 0,
      tiles: /* @__PURE__ */ new Set(),
      spreadAcc: 0
    };
    this.players.push(p);
    return p;
  }
  /* ------------------------------------------------------------------ */
  /* World state helpers                                                 */
  /* ------------------------------------------------------------------ */
  terrainAt(t) {
    return this.world.terrain[t];
  }
  ownerAt(t) {
    return this.owners[t];
  }
  isLand(t) {
    return this.world.terrain[t] !== OCEAN;
  }
  /** Tile index from world coordinates, or -1 when outside the map. */
  tileAt(x, y) {
    const { w: w2, h } = this.world;
    if (x < 0 || y < 0 || x >= w2 || y >= h) return -1;
    return idx(w2, x | 0, y | 0);
  }
  neighbors4(t) {
    const { w: w2, h } = this.world;
    const x = t % w2;
    const y = t / w2 | 0;
    const out = [];
    if (x > 0) out.push(t - 1);
    if (x < w2 - 1) out.push(t + 1);
    if (y > 0) out.push(t - w2);
    if (y < h - 1) out.push(t + w2);
    return out;
  }
  neighbors8(t) {
    const { w: w2, h } = this.world;
    const x = t % w2;
    const y = t / w2 | 0;
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w2 || ny >= h) continue;
        out.push(idx(w2, nx, ny));
      }
    }
    return out;
  }
  isCoastal(t) {
    for (const n of this.neighbors4(t)) {
      if (this.world.terrain[n] === OCEAN) return true;
    }
    return false;
  }
  /**
   * Army ceiling. Keeps raise it directly, but the real ceiling is how many
   * mouths the realm can feed, so farms are what let you field a big host.
   */
  capacity(p) {
    const military = p.density * 2 + p.castles * 4e3;
    const foodCap = Math.max(0, p.grainProd) / UPKEEP_PER_TROOP * FEED_SHARE;
    return Math.round(Math.max(60, Math.min(military, foodCap)));
  }
  /** Recompute production and upkeep. Once per realm per tick. */
  refreshRates(p) {
    let grain = 0.8 + p.tileCount * 4e-3;
    let timber = 0.14 + p.tileCount * 2e-3;
    let ore = 0.11 + p.tileCount * 15e-4;
    let gold = 0.35 + p.tileCount * 3e-3;
    for (const st of this.structs.values()) {
      if (st.owner !== p.id) continue;
      const y = YIELD[st.kind];
      if (!y) continue;
      grain += (y.grain ?? 0) * st.level;
      timber += (y.timber ?? 0) * st.level;
      ore += (y.ore ?? 0) * st.level;
      gold += (y.gold ?? 0) * st.level;
    }
    let soldiers = p.troops;
    for (const a of this.armies) if (a.owner === p.id) soldiers += a.troops;
    p.soldiers = soldiers;
    p.grainProd = grain;
    p.rates = { grain: grain - soldiers * UPKEEP_PER_TROOP, timber, ore, gold };
  }
  income(p) {
    return p.rates.gold;
  }
  /* ------------------------------------------------------------------ */
  /* Claiming land                                                       */
  /* ------------------------------------------------------------------ */
  claim(t, playerId) {
    const prev = this.owners[t];
    if (prev === playerId) return;
    const dens = DENSITY[this.world.terrain[t]];
    if (prev >= 0) {
      const old = this.players[prev];
      old.tileCount--;
      old.density -= dens;
      old.tiles.delete(t);
    }
    const p = this.players[playerId];
    this.owners[t] = playerId;
    p.tileCount++;
    p.density += dens;
    p.tiles.add(t);
    this.dirty.add(t);
    for (const n of this.neighbors4(t)) this.dirty.add(n);
  }
  relinquish(t) {
    const prev = this.owners[t];
    if (prev < 0) return;
    const old = this.players[prev];
    this.owners[t] = -1;
    old.tileCount--;
    old.density -= DENSITY[this.world.terrain[t]];
    old.tiles.delete(t);
    this.dirty.add(t);
    for (const n of this.neighbors4(t)) this.dirty.add(n);
  }
  /** Block of land around a centre tile, used for every starting holding. */
  blob(center, radius) {
    const out = [];
    const { w: w2, h } = this.world;
    const cx = center % w2;
    const cy = center / w2 | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w2 || y >= h) continue;
        if (dx * dx + dy * dy > radius * radius + 1) continue;
        const t = idx(w2, x, y);
        if (this.world.terrain[t] !== OCEAN && this.owners[t] < 0) out.push(t);
      }
    }
    return out;
  }
  /**
   * How good a patch of ground is as a seat. Farms, camps and mines can only
   * go on their own terrain, so a realm that spawns inside one biome can never
   * build a real economy. Score a seat by the mix it gives you.
   */
  siteQuality(t, radius) {
    let plains = 0;
    let forest = 0;
    let mountain = 0;
    for (const x of this.blob(t, radius)) {
      const ter = this.world.terrain[x];
      if (ter === PLAINS) plains++;
      else if (ter === FOREST) forest++;
      else if (ter === MOUNTAIN) mountain++;
    }
    const viable = [plains, forest, mountain].filter((n) => n >= 3).length;
    return viable * 1e3 + plains * 3 + forest * 2 + mountain;
  }
  /** The human picks a seat: a small castle plus the ground around it. */
  chooseStart(tile) {
    if (this.phase !== "spawn") return false;
    if (tile < 0 || !this.isLand(tile) || this.owners[tile] >= 0) return false;
    const p = this.addPlayer("You", PALETTE[0], false);
    this.human = p.id;
    this.settle(p, tile, SPAWN_RADIUS, IMMUNITY);
    this.note("Your banner is planted. The castle stands.");
    this.phase = "playing";
    this.spawnLords();
    return true;
  }
  /** Pick a seat with good ground, far from everyone already placed. */
  pickSeat(minSpacing) {
    const { w: w2, h } = this.world;
    let best = -1;
    let bestScore = -Infinity;
    for (let tries = 0; tries < 1200; tries++) {
      const t = this.rng() * (w2 * h) | 0;
      if (!this.isLand(t) || this.owners[t] >= 0) continue;
      let nearest = Infinity;
      for (const seat2 of this.seats) nearest = Math.min(nearest, this.tileDistance(t, seat2));
      if (nearest < minSpacing) continue;
      const score = this.siteQuality(t, SPAWN_RADIUS) + nearest * 2;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }
  /**
   * Multiplayer start: everyone drops onto the map at once (no click-to-spawn
   * to keep in sync), then the lords fill in around them.
   */
  startMultiplayer(humans) {
    if (this.phase !== "spawn") return false;
    for (let i = 0; i < humans; i++) {
      const seat2 = this.pickSeat(42);
      if (seat2 < 0) return false;
      const p = this.addPlayer(i === 0 ? "You" : `Player ${i + 1}`, PALETTE[i % PALETTE.length], false);
      this.settle(p, seat2, SPAWN_RADIUS, IMMUNITY);
    }
    this.human = 0;
    this.phase = "playing";
    this.spawnLords();
    this.note("You have landed. Raise your city and take the ground.");
    return true;
  }
  settle(p, tile, radius, immunity) {
    for (const t of this.blob(tile, radius)) this.claim(t, p.id);
    this.claim(tile, p.id);
    this.structs.set(tile, { kind: "castle", owner: p.id, tile, level: 1 });
    this.seats.push(tile);
    p.castles += 1;
    p.immune = immunity;
    this.refreshRates(p);
    p.troops = Math.round(this.capacity(p) * 0.5);
    this.structDirty = true;
  }
  spawnLords() {
    const { w: w2, h } = this.world;
    const count = 11;
    const taken = [...this.seats];
    for (let i = 0; i < count; i++) {
      let best = -1;
      let bestScore = -1;
      for (let tries = 0; tries < 400; tries++) {
        const t = this.rng() * (w2 * h) | 0;
        if (this.world.terrain[t] === OCEAN || this.owners[t] >= 0) continue;
        const x = t % w2;
        const y = t / w2 | 0;
        let nearest = Infinity;
        for (const s of taken) {
          const sx = s % w2;
          const sy = s / w2 | 0;
          nearest = Math.min(nearest, Math.hypot(sx - x, sy - y));
        }
        if (nearest < 40) continue;
        const score = nearest + this.siteQuality(t, BOT_SPAWN_RADIUS) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
        if (nearest > 55 && this.siteQuality(t, BOT_SPAWN_RADIUS) >= 2e3) break;
      }
      if (best < 0) continue;
      const p = this.addPlayer(
        LORD_NAMES[i % LORD_NAMES.length],
        PALETTE[(i + 1) % PALETTE.length],
        true
      );
      taken.push(best);
      this.settle(p, best, BOT_SPAWN_RADIUS, IMMUNITY);
    }
    this.note(`${this.players.length - 1} rival lords have taken the field.`);
  }
  /* ------------------------------------------------------------------ */
  /* War: standing fronts, pushes, and supply                            */
  /* ------------------------------------------------------------------ */
  /** A tile can be targeted if it is land you do not already hold. */
  canAttack(p, t) {
    if (t < 0 || !this.isLand(t)) return false;
    if (this.owners[t] === p.id) return false;
    const owner = this.owners[t];
    if (owner >= 0 && this.players[owner].immune > 0) return false;
    return true;
  }
  /** Troops needed to walk over unclaimed ground (scouts, not soldiers). */
  neutralDefense(t) {
    return DEFENSE[this.world.terrain[t]];
  }
  towerBonus(t, defender) {
    let bonus = 0;
    const { w: w2 } = this.world;
    const x = t % w2;
    const y = t / w2 | 0;
    for (const s of this.structs.values()) {
      if (s.owner !== defender || s.kind !== "tower") continue;
      const sx = s.tile % w2;
      const sy = s.tile / w2 | 0;
      if (Math.hypot(sx - x, sy - y) <= 18) bonus += 0.3;
    }
    const here = this.structs.get(t);
    if (here && here.owner === defender && here.kind === "castle") bonus += 0.35 * here.level;
    return bonus;
  }
  /**
   * The standing line. Every border tile is held by soldiers, drawn from the
   * realm's host, so a front exists on both sides even in peacetime. A garrison
   * parked next to it reinforces that stretch.
   */
  lineStrength(p) {
    return Math.max(4, p.troops * 0.28);
  }
  /** Defence of a held tile: its share of the line, terrain, works, garrisons. */
  defenseAt(t, defender) {
    if (defender < 0) return this.neutralDefense(t);
    const p = this.players[defender];
    const terrainMul = this.world.terrain[t] === 4 ? 1.5 : this.world.terrain[t] === 3 ? 1.15 : 1;
    let def = this.lineStrength(p) * terrainMul * (1 + this.towerBonus(t, defender));
    for (const a of this.armies) {
      if (a.owner !== defender || !a.holding) continue;
      if (this.tileDistance(a.tile, t) <= 1) def += a.troops * 0.6;
    }
    return def;
  }
  tileDistance(a, b) {
    const { w: w2 } = this.world;
    const ax = a % w2;
    const ay = a / w2 | 0;
    const bx = b % w2;
    const by = b / w2 | 0;
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }
  /**
   * Click a point, and an army launches toward it and pushes inward from
   * there. Bigger detachments move faster and hit harder.
   */
  /** True once another living realm touches our ground. */
  bordersRival(p) {
    for (const t of p.tiles) {
      for (const n of this.neighbors4(t)) {
        const o = this.owners[n];
        if (o >= 0 && o !== p.id && this.players[o] && this.players[o].alive) return true;
      }
    }
    return false;
  }
  /**
   * OpenFront-style claim. Instead of one column marching in a line, the whole
   * border sweeps toward the point you clicked. Every tile costs soldiers, so
   * the size of the sweep is set by how much of the host you commit.
   */
  claimToward(p, target2, ratio) {
    if (target2 < 0 || !this.isLand(target2)) return false;
    const share = Math.max(0.05, Math.min(1, ratio));
    const budget = Math.max(24, p.troops * share);
    const queue = [];
    const seen = /* @__PURE__ */ new Set();
    for (const t of p.tiles) {
      for (const n of this.neighbors4(t)) {
        if (!this.isLand(n) || this.owners[n] !== -1 || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    if (!queue.length) return false;
    queue.sort((a, b) => this.tileDistance(a, target2) - this.tileDistance(b, target2));
    const COST = 18;
    let spent = 0;
    let claimed = 0;
    while (queue.length) {
      const t = queue.shift();
      if (this.owners[t] !== -1 || !this.isLand(t)) continue;
      if (spent + COST > budget) break;
      this.capture(t, p.id);
      spent += COST;
      claimed++;
      for (const n of this.neighbors4(t)) {
        if (!this.isLand(n) || this.owners[n] !== -1 || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    if (!claimed) return false;
    p.troops = Math.max(0, p.troops - spent);
    this.refreshRates(p);
    return true;
  }
  orderArmy(p, target2, ratio) {
    if (this.phase !== "playing" || !p.alive) return false;
    if (!this.bordersRival(p)) return this.claimToward(p, target2, ratio);
    if (!this.canAttack(p, target2)) return false;
    const share = Math.max(0.05, Math.min(1, ratio));
    const send = Math.floor(p.troops * share);
    if (send < 12) return false;
    const equip = Math.ceil(send * ORE_PER_TROOP);
    if (p.ore < equip) return false;
    const rations = Math.ceil(send * RATIONS_PER_TROOP);
    if (p.grain < rations) return false;
    let launch = -1;
    let bestD = Infinity;
    for (const t of p.tiles) {
      const d = this.tileDistance(t, target2);
      if (d < bestD) {
        bestD = d;
        launch = t;
      }
    }
    if (launch < 0 || bestD > 40) return false;
    const limit = Math.min(
      MAX_ARMIES_PER_PLAYER,
      MIN_ARMIES_PER_PLAYER + Math.floor(this.capacity(p) / 4e3)
    );
    const mine = this.armies.reduce((n, a) => n + (a.owner === p.id ? 1 : 0), 0);
    if (mine >= limit || this.armies.length >= MAX_ARMIES) return false;
    p.troops -= send;
    p.ore -= equip;
    p.grain -= rations;
    this.armies.push({
      id: this.nextArmyId++,
      owner: p.id,
      troops: send,
      tile: launch,
      target: target2,
      progress: 0,
      taken: 0,
      cutOff: false,
      speed: this.armySpeed(send),
      supplyTimer: 0,
      holding: false,
      holdTimer: 0
    });
    return true;
  }
  /** The closest free tile beside a column, or -1 when it is walled in. */
  nearestOpenTile(a) {
    let best = -1;
    let bestScore = Infinity;
    for (const t of [a.tile, ...this.neighbors8(a.tile)]) {
      for (const n of this.neighbors4(t)) {
        if (!this.isLand(n) || this.owners[n] === a.owner) continue;
        const who = this.owners[n];
        if (who >= 0 && this.players[who].immune > 0) continue;
        const d = this.tileDistance(n, a.target);
        if (d < bestScore) {
          bestScore = d;
          best = n;
        }
      }
    }
    return best;
  }
  /** Stronger columns advance faster; rough ground slows them. */
  armySpeed(troops) {
    return Math.max(0.45, Math.min(3.4, 0.5 + Math.sqrt(Math.max(1, troops)) * 0.035));
  }
  armyTick(dt) {
    for (let i = this.armies.length - 1; i >= 0; i--) {
      const a = this.armies[i];
      const p = this.players[a.owner];
      if (!p.alive) {
        this.armies.splice(i, 1);
        continue;
      }
      a.supplyTimer -= dt;
      if (a.supplyTimer <= 0) {
        a.supplyTimer = 0.35;
        const connected = this.traceHome(a);
        if (a.cutOff !== !connected) {
          a.cutOff = !connected;
          if (a.cutOff && !p.isBot) this.note("A push has been cut off from home.");
        }
      }
      if (a.cutOff) {
        a.troops *= 1 - 0.16 * dt;
        if (a.troops < 45) {
          this.armies.splice(i, 1);
          if (!p.isBot) this.note("An isolated push has been routed.");
          continue;
        }
      }
      if (a.holding) {
        a.holdTimer += dt;
        const nextPush = this.nearestOpenTile(a);
        if (a.troops >= 40 && nextPush >= 0) {
          a.target = nextPush;
          a.holding = false;
          a.holdTimer = 0;
        } else if (a.holdTimer >= HOLD_BEFORE_ABSORB) {
          p.troops = Math.min(this.capacity(p), p.troops + a.troops);
          this.armies.splice(i, 1);
        }
        continue;
      }
      const terrain = this.world.terrain[a.tile];
      const ground = terrain === 4 ? 0.62 : terrain === 3 ? 0.85 : 1;
      a.speed = this.armySpeed(a.troops) * ground * (a.cutOff ? 0.55 : 1);
      a.progress += a.speed * dt;
      while (a.progress >= 1 && !a.holding) {
        a.progress -= 1;
        this.armyStep(a, p);
      }
    }
  }
  /** One tile of the push: survey open ground, or fight for held ground. */
  armyStep(a, p) {
    const next = this.nextTile(a);
    if (next < 0) {
      a.holding = true;
      return;
    }
    const owner = this.owners[next];
    if (owner === a.owner) {
      a.tile = next;
      if (next === a.target) a.holding = true;
      return;
    }
    if (owner < 0) {
      const toll = Math.max(1, this.neutralDefense(next) * 0.06);
      if (a.troops > toll) {
        a.troops -= toll;
        this.capture(next, a.owner);
        a.tile = next;
        a.taken++;
        if (next === a.target) a.holding = true;
        return;
      }
      a.holding = true;
      return;
    }
    const def = this.defenseAt(next, owner);
    if (a.troops > def) {
      a.troops -= def * 0.7;
      const defender = this.players[owner];
      defender.troops = Math.max(0, defender.troops - def * 0.45);
      this.capture(next, a.owner);
      a.tile = next;
      a.taken++;
      if (next === a.target) a.holding = true;
      if (!p.isBot && a.taken === 1) this.note("The line has been broken.");
    } else {
      const defender = this.players[owner];
      defender.troops = Math.max(0, defender.troops - a.troops * 0.35);
      a.troops -= Math.min(a.troops, def * 0.8);
      a.holding = true;
      if (a.troops < 45) {
        const idx2 = this.armies.indexOf(a);
        if (idx2 >= 0) this.armies.splice(idx2, 1);
        if (!p.isBot) this.note("A push has broken against the line.");
      }
    }
  }
  /** Next tile for a push: toward the objective, never onto own ground. */
  nextTile(a) {
    let best = -1;
    let bestScore = Infinity;
    const curDist = this.tileDistance(a.tile, a.target);
    for (const n of this.neighbors8(a.tile)) {
      if (!this.isLand(n)) continue;
      if (this.owners[n] === a.owner) continue;
      const d = this.tileDistance(n, a.target);
      const score = d + (d >= curDist ? 0.6 : 0) + (this.owners[n] >= 0 ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }
  /**
   * True when the column can still walk home over friendly ground. Reaching a
   * friendly castle is what counts as being in supply; a column whose corridor
   * has been severed and surrounded is on its own.
   */
  traceHome(a) {
    const owner = a.owner;
    const p = this.players[owner];
    let hasCastle = false;
    for (const s of this.structs.values()) {
      if (s.owner === owner && s.kind === "castle") {
        hasCastle = true;
        break;
      }
    }
    const seen = /* @__PURE__ */ new Set([a.tile]);
    const queue = [a.tile];
    while (queue.length && seen.size < 1500) {
      const t = queue.pop();
      const s = this.structs.get(t);
      if (s && s.owner === owner && s.kind === "castle") return true;
      for (const n of this.neighbors8(t)) {
        if (seen.has(n)) continue;
        if (!this.isLand(n)) continue;
        if (this.owners[n] !== owner) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    if (!hasCastle) return seen.size >= Math.min(25, Math.max(6, p.tileCount * 0.5));
    return false;
  }
  capture(t, playerId) {
    const prev = this.owners[t];
    this.claim(t, playerId);
    const s = this.structs.get(t);
    if (s && s.owner !== playerId) {
      const old = this.players[s.owner];
      if (old && s.kind === "castle") old.castles = Math.max(0, old.castles - s.level);
      const np = this.players[playerId];
      if (s.kind === "castle") np.castles += s.level;
      s.owner = playerId;
      s.level = Math.max(1, Math.ceil(s.level / 2));
      this.structDirty = true;
      void np;
      void old;
    }
    if (prev >= 0 && this.players[prev].tileCount === 0 && this.players[prev].alive) {
      this.players[prev].alive = false;
      this.note(`${this.players[prev].name} has been driven from the map.`);
      if (prev === this.human) this.finish(-2);
    }
  }
  /* ------------------------------------------------------------------ */
  /* Building                                                            */
  /* ------------------------------------------------------------------ */
  buildCost(kind, level) {
    const b = BUILD[kind];
    const m = kind === "castle" ? Math.max(1, level) : 1;
    return { grain: b.grain * m, timber: b.timber * m, ore: b.ore * m, gold: b.gold * m };
  }
  canAfford(p, cost) {
    return p.grain >= cost.grain && p.timber >= cost.timber && p.ore >= cost.ore && p.gold >= cost.gold;
  }
  pay(p, cost) {
    p.grain -= cost.grain;
    p.timber -= cost.timber;
    p.ore -= cost.ore;
    p.gold -= cost.gold;
  }
  /** Why this building cannot go here, or null when it can. */
  blockReason(p, kind, t) {
    if (this.phase !== "playing" || !p.alive) return "not now";
    if (t < 0 || this.owners[t] !== p.id) return "own ground";
    const existing = this.structs.get(t);
    if (kind === "castle") {
      if (existing?.kind === "castle") return existing.level < 8 ? null : "max level";
      return existing ? "occupied" : null;
    }
    if (existing) return "occupied";
    const need = TERRAIN_FOR[kind];
    if (need !== void 0 && this.world.terrain[t] !== need) {
      return kind === "farm" ? "plains only" : kind === "lumber" ? "forest only" : "mountains only";
    }
    if (kind === "market" && !this.isCoastal(t)) return "coast only";
    return null;
  }
  canBuild(p, kind, t) {
    return this.blockReason(p, kind, t) === null;
  }
  build(p, kind, t) {
    if (!this.canBuild(p, kind, t)) return false;
    const existing = this.structs.get(t);
    const level = existing?.kind === "castle" ? existing.level + 1 : 1;
    const cost = this.buildCost(kind, existing?.kind === "castle" ? level - 1 : 1);
    if (!this.canAfford(p, cost)) return false;
    this.pay(p, cost);
    if (existing?.kind === "castle") {
      existing.level = level;
      p.castles += 1;
    } else {
      this.structs.set(t, { kind, owner: p.id, tile: t, level: 1 });
      if (kind === "castle") p.castles += 1;
    }
    this.structDirty = true;
    this.refreshRates(p);
    if (!p.isBot) this.note(`${STRUCTURE_LABEL[kind]} raised.`);
    return true;
  }
  /* ------------------------------------------------------------------ */
  /* Tick                                                                */
  /* ------------------------------------------------------------------ */
  finish(winner) {
    if (this.phase === "over") return;
    this.phase = "over";
    this.winner = winner;
  }
  tick(dt) {
    if (this.phase === "spawn") return;
    this.time += dt;
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.immune > 0) p.immune = Math.max(0, p.immune - dt);
      this.refreshRates(p);
      p.grain += p.rates.grain * dt;
      p.timber += p.rates.timber * dt;
      p.ore += p.rates.ore * dt;
      p.gold += p.rates.gold * dt;
      this.spread(p, dt);
      let starving = false;
      if (p.grain <= 0) {
        p.grain = 0;
        starving = p.rates.grain < -0.01 && p.soldiers > 0;
      }
      p.starving = starving;
      if (starving) {
        const bleed = 0.02 * dt;
        p.troops = Math.max(0, p.troops * (1 - bleed));
        for (const a of this.armies) {
          if (a.owner === p.id) a.troops = Math.max(0, a.troops * (1 - bleed * 1.5));
        }
      }
      const cap = Math.max(1, Math.round(this.capacity(p) * (starving ? 0.6 : 1)));
      if (!starving && p.troops < cap) {
        p.troops = Math.min(cap, p.troops + Math.max(1.2, (cap - p.troops) * 0.05) * dt);
      } else if (p.troops > cap) {
        p.troops = cap;
      }
    }
    this.armyTick(dt);
    for (const p of this.players) {
      if (p.isBot && p.alive) this.botThink(p, dt);
    }
    if (this.phase === "playing") {
      const human = this.players[this.human];
      if (human && human.tileCount > this.world.landTiles * 0.5) this.finish(this.human);
    }
  }
  botThink(p, dt) {
    p.aiTimer -= dt;
    if (p.aiTimer > 0) return;
    p.aiTimer = 0.5 + this.rng() * 0.9;
    const own = [...p.tiles];
    const empty = (t) => !this.structs.has(t);
    const wants = [];
    if (p.rates.grain < 1.4) wants.push("farm");
    if (p.rates.timber < 0.6) wants.push("lumber");
    if (p.rates.ore < 0.4) wants.push("mine");
    if (p.rates.gold < 0.9) wants.push("market");
    if (p.rates.grain > 1.8 && p.castles < 8) wants.push("castle");
    for (const kind of wants) {
      const cost = this.buildCost(kind, 1);
      if (!this.canAfford(p, cost)) continue;
      let t = -1;
      if (kind === "castle") {
        t = own.find((x) => empty(x)) ?? -1;
      } else if (kind === "market") {
        t = own.find((x) => empty(x) && this.isCoastal(x)) ?? -1;
      } else {
        const terr = TERRAIN_FOR[kind];
        t = own.find((x) => empty(x) && this.world.terrain[x] === terr) ?? -1;
      }
      if (t >= 0 && this.build(p, kind, t)) return;
    }
    if (p.rates.grain <= 0.05) return;
    const targets = [];
    for (const i of p.tiles) {
      for (const n of this.neighbors4(i)) {
        if (this.owners[n] === p.id || !this.isLand(n)) continue;
        const owner = this.owners[n];
        if (owner >= 0 && this.players[owner].immune > 0) continue;
        const cost = owner >= 0 ? this.players[owner].troops : this.neutralDefense(n);
        targets.push({ t: n, cost });
      }
    }
    if (!targets.length) return;
    targets.sort((a, b) => a.cost - b.cost);
    const pick = targets[Math.floor(this.rng() * Math.min(4, targets.length))];
    const ratio = 0.25 + this.rng() * 0.3;
    this.orderArmy(p, pick.t, ratio);
  }
  /** Fraction of the world's land a player holds. */
  landShare(p) {
    return p.tileCount / Math.max(1, this.world.landTiles);
  }
  /**
   * Production fuels a slow automatic land grab: a realm's border creeps
   * outward on its own until it runs into someone else's ground. Attacking is
   * for taking ground that is already claimed.
   */
  spread(p, dt) {
    const rate = Math.min(1.2, 0.08 + Math.max(0, p.grainProd) * 0.06);
    p.spreadAcc += rate * dt;
    if (p.spreadAcc < 1) return;
    const frontier = [];
    for (const t of p.tiles) {
      for (const n of this.neighbors4(t)) {
        if (this.owners[n] < 0 && this.isLand(n)) frontier.push(n);
      }
      if (frontier.length > 24) break;
    }
    if (!frontier.length) {
      p.spreadAcc = 0;
      return;
    }
    p.spreadAcc -= 1;
    this.claim(frontier[this.rng() * frontier.length | 0], p.id);
  }
  /* ------------------------------------------------------------------ */
  /* Netcode                                                             */
  /* ------------------------------------------------------------------ */
  /**
   * Compact snapshot for a guest. Territory is run-length encoded, so a whole
   * realm costs a few hundred numbers instead of one per tile.
   */
  snapshot() {
    const runs = (tiles) => {
      const sorted = tiles.slice().sort((a, b) => a - b);
      const out = [];
      let i = 0;
      while (i < sorted.length) {
        const start = sorted[i];
        let len = 1;
        while (i + len < sorted.length && sorted[i + len] === start + len) len++;
        out.push(start, len);
        i += len;
      }
      return out;
    };
    const players = this.players.map((p) => ({
      i: p.id,
      n: p.name,
      c: p.color,
      a: p.alive ? 1 : 0,
      b: p.isBot ? 1 : 0,
      g: Math.round(p.gold),
      gr: Math.round(p.grain),
      tb: Math.round(p.timber),
      or: Math.round(p.ore),
      t: Math.round(p.troops),
      s: Math.round(p.soldiers),
      gp: +p.grainProd.toFixed(3),
      ca: Math.round(this.capacity(p)),
      st: p.starving ? 1 : 0,
      r: [
        +p.rates.grain.toFixed(3),
        +p.rates.timber.toFixed(3),
        +p.rates.ore.toFixed(3),
        +p.rates.gold.toFixed(3)
      ],
      k: runs([...p.tiles])
    }));
    const armies = this.armies.map((a) => ({
      o: a.owner,
      t: a.tile,
      n: Math.round(a.troops),
      g: a.target,
      c: a.cutOff ? 1 : 0
    }));
    const structs = [...this.structs.values()].map((st) => [
      st.tile,
      STRUCT_ORDER.indexOf(st.kind),
      st.owner,
      st.level
    ]);
    return JSON.stringify({
      v: 1,
      tm: +this.time.toFixed(1),
      ph: this.phase,
      hm: this.human,
      ms: this.messages.slice(-10),
      p: players,
      a: armies,
      s: structs
    });
  }
  /** Guest side: become a display of the host's world. */
  applySnapshot(text) {
    const snap = JSON.parse(text);
    this.time = snap.tm;
    this.phase = snap.ph;
    this.human = snap.hm ?? 0;
    this.messages = snap.ms ?? [];
    this.owners.fill(-1);
    this.armies = [];
    this.structs.clear();
    for (const d of snap.p) {
      const p = this.players[d.i] ?? this.addPlayer(d.n, d.c, !!d.b);
      p.name = d.n;
      p.color = d.c;
      p.alive = !!d.a;
      p.isBot = !!d.b;
      p.gold = d.g;
      p.grain = d.gr;
      p.timber = d.tb;
      p.ore = d.or;
      p.troops = d.t;
      p.soldiers = d.s;
      p.grainProd = d.gp;
      p.starving = !!d.st;
      p.rates = { grain: d.r[0], timber: d.r[1], ore: d.r[2], gold: d.r[3] };
      p.tiles = /* @__PURE__ */ new Set();
      p.tileCount = 0;
      p.castles = 0;
      p.density = 0;
      for (let i = 0; i < d.k.length; i += 2) {
        const start = d.k[i];
        const len = d.k[i + 1];
        for (let t = start; t < start + len; t++) {
          this.owners[t] = p.id;
          p.tiles.add(t);
          p.tileCount++;
          p.density += DENSITY[this.world.terrain[t]];
        }
      }
      for (let i = this.players.length; i <= d.i; i++) {
        if (!this.players[i]) this.addPlayer("?", PALETTE[i % PALETTE.length], true);
      }
    }
    for (const d of snap.a) {
      this.armies.push({
        id: 0,
        owner: d.o,
        troops: d.n,
        tile: d.t,
        target: d.g,
        progress: 0,
        taken: 0,
        cutOff: !!d.c,
        speed: 0,
        supplyTimer: 0,
        holding: false,
        holdTimer: 0
      });
    }
    for (const d of snap.s) {
      const kind = STRUCT_ORDER[d[1]];
      this.structs.set(d[0], { kind, owner: d[2], tile: d[0], level: d[3] });
      if (kind === "castle") {
        const owner = this.players[d[2]];
        if (owner) owner.castles += d[3];
      }
    }
    this.structDirty = true;
  }
};

// test/sim_claim.ts
var g = new Game(11);
var seat = -1;
var bs = -1;
for (let i = 0; i < g.owners.length; i += 5) {
  if (!g.isLand(i) || g.owners[i] >= 0) continue;
  const q = g.siteQuality(i, 5);
  if (q > bs) {
    bs = q;
    seat = i;
  }
}
g.chooseStart(seat);
var me = g.players[g.human];
var before = me.tileCount;
var w = g.world.w;
var row = seat / w | 0;
var target = row * w + (seat % w + 9);
for (let i = 0; i < 12; i++) {
  g.tick(0.1);
  if (i % 3 === 0) g.orderArmy(me, target, 0.4);
}
var shapes = me.tileCount - before;
var maxRow = 0;
var maxCol = 0;
var rows = /* @__PURE__ */ new Map();
var cols = /* @__PURE__ */ new Map();
for (const t of me.tiles) {
  const r = t / w | 0, c = t % w;
  rows.set(r, (rows.get(r) ?? 0) + 1);
  cols.set(c, (cols.get(c) ?? 0) + 1);
}
for (const v of rows.values()) maxRow = Math.max(maxRow, v);
for (const v of cols.values()) maxCol = Math.max(maxCol, v);
console.log({ tilesGained: shapes, widestRow: maxRow, widestCol: maxCol, armies: g.armies.length });
