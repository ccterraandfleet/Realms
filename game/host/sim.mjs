// src/sim/world.ts
var OCEAN = 0;
var SAND = 1;
var PLAINS = 2;
var FOREST = 3;
var MOUNTAIN = 4;
var DENSITY = [0, 5, 10, 8, 6];
var DEFENSE = [0, 8, 18, 15, 26];
var MIDDLE_RICHNESS = 3;
var POCKET_RICHNESS = 1;
var POCKET_COUNT = 12;
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
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (i, j) => g[(j % size + size) % size * size + (i % size + size) % size];
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
function idx(w, x, y) {
  return y * w + x;
}
function generateWorld(seed, w = 400, h = 260) {
  const rand = mulberry32(seed);
  const e1 = makeNoise(rand, 6);
  const e2 = makeNoise(rand, 13);
  const ridge = makeNoise(rand, 9);
  const moist = makeNoise(rand, 11);
  const grain = makeNoise(rand, 61);
  const cx = w / 2;
  const cy = h / 2;
  const midRx = w * 0.235;
  const midRy = h * 0.235;
  const pockets = [];
  const pocketCentre = [];
  for (let i = 0; i < POCKET_COUNT; i++) {
    const ang = i / POCKET_COUNT * Math.PI * 2 + 0.16;
    const px = cx + Math.cos(ang) * midRx * 1.34;
    const py = cy + Math.sin(ang) * midRy * 1.34;
    if (px < 8 || py < 8 || px > w - 9 || py > h - 9) continue;
    pocketCentre.push({ x: px, y: py, r: 15 + rand() * 5 });
    pockets.push(idx(w, Math.round(px), Math.round(py)));
  }
  const forced = new Uint8Array(w * h);
  const richness = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      const dx = (x - cx) / midRx;
      const dy = (y - cy) / midRy;
      if (dx * dx + dy * dy <= 1) {
        forced[i] = 1;
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
  const landElev = [];
  const wetLand = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      if (!forced[i]) continue;
      const nx = x / w;
      const ny = y / h;
      let e = 0.55 * e1(nx * 1.7, ny * 1.7) + 0.4 * e2(nx * 3.3, ny * 3.3) + 0.3 * Math.max(0, 1 - Math.abs(ridge(nx * 2.2, ny * 2.2) * 2 - 1));
      landElev.push(e);
      wetLand.push(moist(x / w * 2.4, y / h * 2.4));
    }
  }
  const sorted = landElev.slice().sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
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
      const e = 0.55 * e1(nx * 1.7, ny * 1.7) + 0.4 * e2(nx * 3.3, ny * 3.3) + 0.3 * Math.max(0, 1 - Math.abs(ridge(nx * 2.2, ny * 2.2) * 2 - 1));
      const m = moist(x / w * 2.4, y / h * 2.4);
      let t;
      if (e <= sandCut) t = SAND;
      else if (e > mountainCut) t = MOUNTAIN;
      else t = m > forestCut ? FOREST : PLAINS;
      terrain[i] = t;
      landTiles++;
      if (forced[i] === 1) middleTiles++;
    }
  }
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
      if (terrain[i] === PLAINS && grain(x / w * 3, y / h * 3) > 0.74) terrain[i] = FOREST;
    }
  }
  return { w, h, terrain, landTiles, seed, richness, pockets, middleTiles };
}

// src/sim/game.ts
var STRUCT_ORDER = [
  "castle",
  "farm",
  "lumber",
  "mine",
  "market",
  "tower",
  "siege",
  "camp",
  // Appended, never inserted: STRUCT_ORDER is the index order used by snapshots.
  "barn"
];
var CLAIM_REACH = 26;
var NODE_RADIUS = 34;
var BUILD = {
  castle: { grain: 0, timber: 70, ore: 45, gold: 60 },
  // Each tile of a crossing is priced on its own, so reaching the middle is a
  // real project: a four-wide channel is four bridges.
  bridge: { grain: 0, timber: 45, ore: 15, gold: 30 },
  farm: { grain: 0, timber: 45, ore: 0, gold: 10 },
  lumber: { grain: 35, timber: 0, ore: 0, gold: 10 },
  mine: { grain: 45, timber: 70, ore: 0, gold: 15 },
  market: { grain: 25, timber: 55, ore: 0, gold: 20 },
  tower: { grain: 0, timber: 55, ore: 25, gold: 30 },
  siege: { grain: 35, timber: 65, ore: 70, gold: 40 },
  camp: { grain: 20, timber: 60, ore: 30, gold: 40 },
  // A barn is where a city keeps what it eats. Two thousand rations each.
  barn: { grain: 0, timber: 60, ore: 10, gold: 20 }
};
var STRUCTURE_LABEL = {
  castle: "Castle",
  farm: "Farm",
  lumber: "Lumber Camp",
  mine: "Iron Mine",
  market: "Market",
  tower: "Watchtower",
  siege: "Siege Camp",
  camp: "War Camp",
  bridge: "Bridge",
  barn: "Barn"
};
var ARMY_CAP = (level) => 50 * (level * level + 1);
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
var BASE_YIELD = 10;
var SURRENDER_KEEP = 0.2;
function fieldPower(a) {
  const supply = Number.isFinite(a.supply) ? a.supply : 1;
  const morale = Number.isFinite(a.morale) ? a.morale : 1;
  const tier = Number.isFinite(a.tier) ? Math.max(1, Math.min(3, a.tier)) : 1;
  return a.troops * (0.34 + 0.66 * supply) * (0.55 + 0.45 * morale) * TIER_POWER[tier];
}
var SUPPLY_GAIN = 0.55;
var SUPPLY_CUT = 0.5;
var SUPPLY_HUNGRY = 0.3;
var MORALE_RALLY = 0.4;
var YEAR_SECONDS = 600;
var PEACE_YEARS = 3;
var MIDDLE_MARK = 1.15;
var RATION_PER_MAN = 5e-3;
var BASE_STOCK = 2500;
var STOCK_PER_BARN = 2e3;
var STOCK_CAP = 12e3;
var CITY_POP = 150;
var POP_RATION = 0.02;
var STOCK_FILL_RATE = 12;
var CONVOY_CAP = 400;
var CONVOY_STEP = 1.2;
var SIEGE_MORALE_DRAIN = 0.05;
var SIEGE_MORALE_RECOVER = 0.02;
var TIER_POWER = [1, 1, 1.35, 1.8];
var TIER_COST_SCALE = 2.2;
function tierUpCost(tier) {
  const step = Math.pow(TIER_COST_SCALE, Math.max(0, tier - 1));
  return { grain: 40 * step, timber: 30 * step, ore: 60 * step, gold: 55 * step };
}
var TIER_NAME = ["", "Levy", "Shieldwall", "Testudo"];
var SURRENDER_FLOOR = 20;
var TILE_YIELD = {
  grain: 0.02,
  timber: 8e-3,
  ore: 4e-3,
  gold: 0.01
};
var PRICE = {
  /** Settling one unclaimed tile: seed, stakes and a survey. */
  claimTile: { grain: 2, timber: 1, ore: 0, gold: 0.25 },
  /** Raising one man into a host: rations for the march and iron for a spear. */
  perMan: { grain: 0.5, timber: 0, ore: 0.3, gold: 0.15 },
  /** Taking one tile of somebody else's ground: munitions spent doing it. */
  pushTile: { grain: 8, timber: 0, ore: 4, gold: 2 }
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
var MAX_ARMIES = 220;
var IMMUNITY = 20;
var SPAWN_RADIUS = 5;
var BOT_SPAWN_RADIUS = 4;
var Game = class {
  constructor(seed, w = 400, h = 260) {
    this.seed = seed;
    this.players = [];
    this.structs = /* @__PURE__ */ new Map();
    this.armies = [];
    this.time = 0;
    this.phase = "spawn";
    this.winner = -1;
    /** Convoys on the road, by owner. */
    this.convoys = [];
    /** Rations held in each city, by city tile. */
    this.cityStock = /* @__PURE__ */ new Map();
    /**
     * A city's nerve, 0..1. Separate from any host: a city under siege that runs
     * out of food cracks, and at zero its garrison goes over to the besieger.
     */
    this.cityMorale = /* @__PURE__ */ new Map();
    /** Rough tally of what the AI lords spend their turns on. Diagnostics only. */
    this.botDebug = {};
    /** Peace while realms build their roads, war once the middle is contested. */
    this.era = "peace";
    /** Whole game years elapsed since the world started moving. */
    this.year = 0;
    /** Tiles whose ownership changed since the renderer last repainted. */
    this.dirty = /* @__PURE__ */ new Set();
    this.structDirty = true;
    this.messages = [];
    this.human = 0;
    /** Every seat taken so far, so spawns stay apart. */
    this.seats = [];
    this.claimNodes = [];
    this.nextArmyId = 1;
    this.requestTimer = 0;
    this.nextConvoyId = 1;
    this.nextArmyUid = 1;
    /* ------------------------------------------------------------------ */
    /* Tick                                                                */
    /* ------------------------------------------------------------------ */
    this.surrenderTimer = 0;
    this.world = generateWorld(seed, w, h);
    this.owners = new Int16Array(w * h).fill(-1);
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
      peak: 0,
      capturedBy: {},
      surrenderTo: -1,
      crossed: false,
      castles: 0,
      immune: 0,
      frontTiles: 1,
      frontTimer: 0,
      yieldSum: 0,
      kitWarn: 0,
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
  /** True where a host can cross: dry land, or a bridge laid over the water. */
  passable(t) {
    if (this.isLand(t)) return true;
    const s = this.structs.get(t);
    return !!s && s.kind === "bridge";
  }
  /** Tile index from world coordinates, or -1 when outside the map. */
  tileAt(x, y) {
    const { w, h } = this.world;
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    return idx(w, x | 0, y | 0);
  }
  neighbors4(t) {
    const { w, h } = this.world;
    const x = t % w;
    const y = t / w | 0;
    const out = [];
    if (x > 0) out.push(t - 1);
    if (x < w - 1) out.push(t + 1);
    if (y > 0) out.push(t - w);
    if (y < h - 1) out.push(t + w);
    return out;
  }
  neighbors8(t) {
    const { w, h } = this.world;
    const x = t % w;
    const y = t / w | 0;
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        out.push(idx(w, nx, ny));
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
    const held = Math.max(0, p.yieldSum);
    let grain = BASE_YIELD + TILE_YIELD.grain * held;
    let timber = BASE_YIELD + TILE_YIELD.timber * held;
    let ore = BASE_YIELD + TILE_YIELD.ore * held;
    let gold = BASE_YIELD + TILE_YIELD.gold * held;
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
    p.rates = { grain, timber, ore, gold };
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
    const rich = this.world.richness[t] || 1;
    if (prev >= 0) {
      const old = this.players[prev];
      old.tileCount--;
      old.density -= dens;
      old.yieldSum -= rich;
      old.tiles.delete(t);
      old.capturedBy[playerId] = (old.capturedBy[playerId] ?? 0) + 1;
    }
    const p = this.players[playerId];
    this.owners[t] = playerId;
    p.tileCount++;
    if (p.tileCount > p.peak) p.peak = p.tileCount;
    if (this.world.richness[t] > MIDDLE_MARK) p.crossed = true;
    p.density += dens;
    p.yieldSum += rich;
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
    const { w, h } = this.world;
    const cx = center % w;
    const cy = center / w | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (dx * dx + dy * dy > radius * radius + 1) continue;
        const t = idx(w, x, y);
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
    const { w, h } = this.world;
    let best = -1;
    let bestScore = -Infinity;
    for (let tries = 0; tries < 1200; tries++) {
      const t = this.rng() * (w * h) | 0;
      if (!this.isLand(t) || this.owners[t] >= 0) continue;
      let nearest = Infinity;
      for (const seat of this.seats) nearest = Math.min(nearest, this.tileDistance(t, seat));
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
      const seat = this.world.pockets[i] >= 0 ? this.world.pockets[i] : this.pickSeat(42);
      if (seat < 0) return false;
      const p = this.addPlayer(i === 0 ? "You" : `Player ${i + 1}`, PALETTE[i % PALETTE.length], false);
      this.settle(p, seat, SPAWN_RADIUS, IMMUNITY);
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
    const { w, h } = this.world;
    const count = Math.max(0, Math.min(11, this.world.pockets.length - this.players.length));
    const taken = [...this.seats];
    for (let i = 0; i < count; i++) {
      const free = this.world.pockets.filter(
        (pk) => pk >= 0 && this.owners[pk] < 0 && !taken.some((t) => this.tileDistance(t, pk) < 30)
      );
      if (free.length) {
        const seat = free[i % free.length];
        const p2 = this.addPlayer(LORD_NAMES[i % LORD_NAMES.length], PALETTE[(i + 1) % PALETTE.length], true);
        this.settle(p2, seat, SPAWN_RADIUS, 0);
        taken.push(seat);
        continue;
      }
      let best = -1;
      let bestScore = -1;
      for (let tries = 0; tries < 400; tries++) {
        const t = this.rng() * (w * h) | 0;
        if (this.world.terrain[t] === OCEAN || this.owners[t] >= 0) continue;
        const x = t % w;
        const y = t / w | 0;
        let nearest = Infinity;
        for (const s of taken) {
          const sx = s % w;
          const sy = s / w | 0;
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
    const { w } = this.world;
    const x = t % w;
    const y = t / w | 0;
    for (const s of this.structs.values()) {
      if (s.owner !== defender || s.kind !== "tower") continue;
      const sx = s.tile % w;
      const sy = s.tile / w | 0;
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
  /**
   * Men standing on one tile of front. The pool is spread along the border
   * rather than stacked on every tile, so what holds a line is depth, and a
   * concentrated host can break a stretch of it. This is the number a push has
   * to beat locally, and the number the pickets on screen represent.
   */
  lineStrength(p) {
    const front = Math.max(1, p.frontTiles);
    return Math.max(3, p.troops / front * 1.2);
  }
  /** Count how much border a realm actually has to hold. */
  refreshFront(p) {
    let front = 0;
    for (const t of p.tiles) {
      for (const n of this.neighbors4(t)) {
        if (this.owners[n] !== p.id) {
          front++;
          break;
        }
      }
    }
    p.frontTiles = Math.max(1, front);
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
    const { w } = this.world;
    const ax = a % w;
    const ay = a / w | 0;
    const bx = b % w;
    const by = b / w | 0;
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }
  /**
   * Expansion, the way unclaimed ground is meant to work: double click an open
   * spot and a node is planted there. The node eats outward from that point,
   * one ring at a time, and stops on its own the moment it touches somebody
   * else's border. Columns are for war; this is for settling.
   */
  startClaimNode(p, tile) {
    if (this.phase !== "playing" || !p.alive) return false;
    if (tile < 0 || !this.isLand(tile) || this.owners[tile] !== -1) return false;
    let nearest = Infinity;
    for (const t of p.tiles) nearest = Math.min(nearest, this.tileDistance(t, tile));
    if (nearest > CLAIM_REACH) return false;
    if (this.claimNodes.some((n) => n.tile === tile)) return false;
    this.claimNodes.push({
      owner: p.id,
      tile,
      frontier: [tile],
      seen: /* @__PURE__ */ new Set([tile]),
      acc: 0,
      done: false
    });
    this.capture(tile, p.id);
    if (!p.isBot) this.note("A claim node takes root.");
    return true;
  }
  /** Grow every live claim node. Rate follows production, so a real economy
   *  settles ground faster than a starving one. */
  growNodes(dt) {
    for (const node of this.claimNodes) {
      if (node.done) continue;
      const p = this.players[node.owner];
      if (!p || !p.alive) {
        node.done = true;
        continue;
      }
      if (node.stalled) {
        if (!this.canAfford(p, PRICE.claimTile)) continue;
        node.stalled = false;
      }
      const rate = Math.min(14, 4 + Math.max(0, p.grainProd) * 0.5);
      node.acc = Math.min(node.acc + rate * dt, 24);
      while (node.acc >= 1) {
        if (!node.frontier.length) {
          node.done = true;
          break;
        }
        const t = node.frontier.shift();
        if (this.owners[t] === -1 && this.isLand(t)) {
          const cost = PRICE.claimTile;
          if (!this.canAfford(p, cost)) {
            node.stalled = true;
            break;
          }
          this.pay(p, cost);
          node.stalled = false;
          this.capture(t, node.owner);
        }
        for (const n of this.neighbors4(t)) {
          if (this.owners[n] !== -1 || !this.isLand(n) || node.seen.has(n)) continue;
          if (this.tileDistance(n, node.tile) > NODE_RADIUS) continue;
          node.seen.add(n);
          node.frontier.push(n);
        }
        node.acc -= 1;
      }
    }
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
  claimToward(p, target, ratio) {
    if (target < 0 || !this.isLand(target)) return false;
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
    queue.sort((a, b) => this.tileDistance(a, target) - this.tileDistance(b, target));
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
  orderArmy(p, target, ratio) {
    if (this.phase !== "playing" || !p.alive) return false;
    if (target < 0 || !this.isLand(target)) return false;
    if (this.owners[target] === -1) return this.startClaimNode(p, target);
    if (this.owners[target] === p.id) return false;
    if (!this.canAttack(p, target)) return false;
    const mine = this.armies.filter((a) => a.owner === p.id);
    if (!mine.length) return this.muster(p);
    let best = mine[0];
    let bestD = Infinity;
    for (const a of mine) {
      const d = this.tileDistance(a.tile, target);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    void ratio;
    return this.moveArmy(p, best.home, target);
  }
  /**
   * Formations group themselves. Every castle fields one host, filled to what
   * that castle's level can carry, drawn straight out of the pool standing on
   * the border. Bigger castles hold bigger hosts; more castles hold more of
   * them. What the harvest feeds is still the outer limit.
   */
  muster(p) {
    if (!p.alive || this.phase !== "playing") return false;
    for (const st of this.structs.values()) {
      if (st.owner !== p.id || st.kind !== "castle") continue;
      if (this.armies.some((a) => a.owner === p.id && a.home === st.tile)) continue;
      const cap = ARMY_CAP(st.level);
      if (p.troops < cap) continue;
      if (this.armies.length >= MAX_ARMIES) return false;
      const kit = this.scaleCost(PRICE.perMan, cap);
      if (!this.canAfford(p, kit)) {
        if (!p.isBot && p.kitWarn <= 0) {
          this.note(`${cap} men need ${Math.ceil(kit.ore)} iron and ${Math.ceil(kit.grain)} grain to take the field.`);
          p.kitWarn = 12;
        }
        return false;
      }
      this.pay(p, kit);
      p.troops -= cap;
      this.armies.push({
        id: this.nextArmyId++,
        owner: p.id,
        home: st.tile,
        troops: cap,
        tile: st.tile,
        target: st.tile,
        progress: 0,
        taken: 0,
        cutOff: false,
        speed: 0,
        supplyTimer: 0,
        supply: 1,
        morale: 1,
        routed: false,
        rallyTimer: 0,
        contactTimer: 0,
        tier: 1,
        uid: this.nextArmyUid++,
        rations: cap * RATION_PER_MAN * 150,
        support: 0,
        threat: 0,
        flankSides: 0,
        pulling: false,
        regrouping: false,
        holding: true,
        holdTimer: 0
      });
      if (!p.isBot) this.note(`${cap} men form up at your castle.`);
      return true;
    }
    return false;
  }
  /** The formation raised by a particular castle. */
  armyOf(p, home) {
    return this.armies.find((a) => a.owner === p.id && a.home === home);
  }
  /** March a formation at a point. It stops where you clicked. */
  moveArmy(p, home, target) {
    if (this.phase !== "playing" || !p.alive) return false;
    const a = this.armyOf(p, home);
    if (!a) return false;
    if (target < 0 || !this.isLand(target)) return false;
    if (a.routed && a.rallyTimer > 0) {
      if (!p.isBot) this.note("That host is still reforming. Give it a moment.");
      return false;
    }
    if (a.routed) a.routed = false;
    a.pulling = false;
    a.regrouping = false;
    if (target === a.tile && a.holding) return false;
    a.target = target;
    a.holding = false;
    a.progress = 0;
    return true;
  }
  /**
   * End the peace early. Host only, so a guest cannot start a war on a whim; this
   * exists so a world can be played forward without sitting out the full years.
   */
  breakPeace(p) {
    if (p.id !== this.human) return false;
    if (this.era !== "peace") return false;
    this.era = "war";
    this.note("The peace is broken by decree. The roads belong to armies now.");
    return true;
  }
  /** Is this tile one of the realm's own cities (a castle or a market)? */
  isOwnCity(p, tile) {
    const st = this.structs.get(tile);
    return !!st && st.owner === p.id && (st.kind === "castle" || st.kind === "market");
  }
  /**
   * Send a host to one of your cities to heal.
   *
   * Click your formation, click your city: it marches there over its own roads,
   * garrisons, refills from the pool and comes back with its nerve restored.
   */
  orderToCity(p, home, city) {
    if (this.phase !== "playing" || !p.alive) return false;
    const a = this.armyOf(p, home);
    if (!a) return false;
    if (!this.isOwnCity(p, city)) return false;
    if (a.routed && a.rallyTimer > 0) {
      if (!p.isBot) this.note("That host is still reforming. Give it a moment.");
      return false;
    }
    a.routed = false;
    a.pulling = false;
    a.regrouping = true;
    a.holding = false;
    a.progress = 0;
    a.target = city;
    return true;
  }
  /**
   * Pull a host back to its castle without it having to be broken first.
   *
   * This is the other half of front control: push costs ground and men, pulling
   * costs position and time, and the men come home intact to be sent out again.
   */
  withdrawArmy(p, home) {
    if (this.phase !== "playing" || !p.alive) return false;
    const a = this.armyOf(p, home);
    if (!a) return false;
    if (a.tile === a.home && a.holding) return false;
    a.pulling = true;
    a.routed = false;
    a.rallyTimer = 0;
    a.holding = false;
    a.progress = 0;
    a.target = a.home;
    return true;
  }
  /**
   * Take a formation up a tier. Quality is the slow clock: the cost multiplies
   * every step, so a tier 3 host is an investment a realm plans for, and the
   * castle has to be big enough to field men of that quality at all.
   */
  upgradeHost(p, home) {
    if (this.phase !== "playing" || !p.alive) return false;
    const a = this.armyOf(p, home);
    if (!a) return false;
    if (a.tier >= 3) {
      if (!p.isBot) this.note("That host is already testudo, the finest we can field.");
      return false;
    }
    const castle = this.structs.get(a.home);
    if (!castle || castle.kind !== "castle") return false;
    if (castle.level < a.tier + 1) {
      if (!p.isBot) this.note(`A tier ${a.tier + 1} host needs a level ${a.tier + 1} castle.`);
      return false;
    }
    const cost = tierUpCost(a.tier);
    if (!this.canAfford(p, cost)) {
      if (!p.isBot) {
        this.note(
          `Tier ${a.tier + 1} wants ${Math.ceil(cost.ore)} iron and ${Math.ceil(cost.gold)} gold.`
        );
      }
      return false;
    }
    this.pay(p, cost);
    a.tier += 1;
    if (!p.isBot) this.note(`Your host drills as ${TIER_NAME[a.tier]} (tier ${a.tier}).`);
    return true;
  }
  /**
   * Pitch a war camp where a formation is standing. From there it eats the
   * ground around it one tile at a time, which is how you take land you could
   * never take by walking through it.
   */
  establishCamp(p, home) {
    if (this.phase !== "playing" || !p.alive) return false;
    const a = this.armyOf(p, home);
    if (!a || !a.holding) return false;
    if (a.tile === a.home || this.tileDistance(a.tile, a.home) < 3) return false;
    if (this.structs.has(a.tile)) return false;
    const cost = BUILD.camp;
    if (!this.canAfford(p, cost)) return false;
    this.pay(p, cost);
    this.structs.set(a.tile, { kind: "camp", owner: p.id, tile: a.tile, level: 1, acc: 0 });
    this.structDirty = true;
    this.capture(a.tile, p.id);
    if (!p.isBot) this.note("A war camp is raised. The ground around it is yours to take.");
    return true;
  }
  /** Men standing at a camp: its garrison is whatever formation guards it. */
  campGarrison(st) {
    let g = st.level * 120;
    for (const a of this.armies) {
      if (a.owner !== st.owner) continue;
      if (this.tileDistance(a.tile, st.tile) <= 1) g += a.troops;
    }
    return g;
  }
  /** Camps creep outward, taking the weakest ground beside them first. */
  campTick(dt) {
    for (const st of [...this.structs.values()]) {
      if (st.kind !== "camp") continue;
      const p = this.players[st.owner];
      if (!p || !p.alive) {
        this.structs.delete(st.tile);
        this.structDirty = true;
        continue;
      }
      const g = this.campGarrison(st);
      st.acc = (st.acc ?? 0) + dt * (1 + g / 900);
      if (st.acc < 1) continue;
      st.acc -= 1;
      let bestT = -1;
      let bestDef = Infinity;
      for (const n of this.neighbors4(st.tile)) {
        if (!this.isLand(n) || this.owners[n] === st.owner) continue;
        const o = this.owners[n];
        if (this.era === "peace" && o >= 0) continue;
        if (o >= 0 && this.players[o].immune > 0) continue;
        const d = o >= 0 ? this.defenseAt(n, o) : this.neutralDefense(n);
        if (d < bestDef) {
          bestDef = d;
          bestT = n;
        }
      }
      if (bestT >= 0 && g * 0.5 >= bestDef * 0.2) this.capture(bestT, st.owner);
    }
  }
  /** Two hosts on the same ground: the bigger one carries the field. */
  /**
   * Two hosts in contact grind instead of resolving in one sum.
   *
   * Each beat of contact bleeds both sides in proportion to the pressure they
   * are under, and shakes the line's morale. Neither passes until one breaks,
   * so a stronger army on the same tick is not an automatic win: it has to be
   * sustained. A broken host routes for home and can be brought back in once it
   * has rallied, which is what makes the front active rather than a single
   * decisive click.
   */
  armyBattle(a, p, foe) {
    if (this.era === "peace") return;
    const atk = fieldPower(a);
    const def = fieldPower(foe);
    if (atk <= 0 || def <= 0) return;
    a.contactTimer = 1.5;
    foe.contactTimer = 1.5;
    const pressed = (x) => x.threat > 0 && (x.flankSides >= 2 || x.threat > x.support);
    const guarded = (x) => {
      if (x.tier >= 3) return pressed(x) ? 0.35 : 0.72;
      if (x.tier === 2) return pressed(x) ? 0.72 : 0.85;
      return 1;
    };
    const ratio = atk / Math.max(1, def);
    const clamp = (v) => Math.max(0.3, Math.min(3, v));
    const dmgToFoe = Math.min(foe.troops * 0.25, atk * 0.12) * guarded(foe);
    const dmgToSelf = Math.min(a.troops * 0.25, def * 0.12) * guarded(a);
    foe.troops = Math.max(1, foe.troops - dmgToFoe);
    a.troops = Math.max(1, a.troops - dmgToSelf);
    foe.morale = Math.max(0, foe.morale - 0.16 * clamp(ratio));
    a.morale = Math.max(0, a.morale - 0.16 * clamp(1 / ratio));
    const foeBroken = foe.troops < 20 || foe.morale <= 0.02;
    const myBroken = a.troops < 20 || a.morale <= 0.02;
    if (foeBroken && !myBroken) {
      this.route(foe);
      const st = this.structs.get(foe.tile);
      if (st && st.kind === "camp" && st.owner === foe.owner) {
        this.structs.delete(st.tile);
        this.structDirty = true;
        if (!p.isBot) this.note("The camp falls with its garrison.");
      }
      this.capture(foe.tile, a.owner);
      a.tile = foe.tile;
      a.morale = Math.min(1, a.morale + 0.12);
      if (!p.isBot) this.note("Two hosts meet. Their line breaks and yours holds the field.");
      return;
    }
    if (myBroken && !foeBroken) {
      this.route(a);
      if (!p.isBot) this.note("Your host is broken in the open field and falls back.");
      return;
    }
    if (myBroken && foeBroken) {
      this.route(a);
      this.route(foe);
      if (!p.isBot) this.note("Both hosts break off and fall back.");
      return;
    }
    if (!p.isBot && a.holdTimer <= 0) this.note("Hosts lock shields. The line is grinding.");
    a.holdTimer = Math.max(a.holdTimer, 1.5);
  }
  /** Send a breaking host home to reform, or destroy it if too few are left. */
  route(a) {
    a.routed = true;
    a.holding = false;
    a.target = a.home;
    a.rallyTimer = 9;
    if (a.troops < 10) {
      const i = this.armies.indexOf(a);
      if (i >= 0) this.armies.splice(i, 1);
    }
  }
  /** Assaulting a war camp: beat the men holding it and the camp falls. */
  campBattle(a, p, st) {
    if (this.era === "peace") return;
    const garrison = this.campGarrison(st);
    if (a.troops > garrison) {
      a.troops -= garrison * 0.6;
      this.structs.delete(st.tile);
      this.structDirty = true;
      this.capture(st.tile, a.owner);
      a.tile = st.tile;
      if (!p.isBot) this.note("The war camp is broken and your ground is yours again.");
    } else {
      const i = this.armies.indexOf(a);
      if (i >= 0) this.armies.splice(i, 1);
      if (!p.isBot) this.note("Your host breaks on the camp's palisade.");
    }
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
    return Math.max(0.7, Math.min(4.2, 0.82 + Math.sqrt(Math.max(1, troops)) * 0.05));
  }
  /**
   * Who is standing around this host, and on how many sides.
   *
   * Morale is not a private number: it is a reading of the field. Friendly
   * formations near a host steady it, enemy formations erode it, and being
   * pressed from several directions at once is what flanking actually feels
   * like. Tiered men handle that differently, which is the whole point of
   * paying for tiers.
   */
  surveyPressure(a) {
    let friendly = 0;
    let enemy = 0;
    const sides = /* @__PURE__ */ new Set();
    const at = a.tile;
    const ax = at % this.world.w;
    const ay = Math.floor(at / this.world.w);
    for (const other of this.armies) {
      if (other === a) continue;
      const d = this.tileDistance(at, other.tile);
      if (d > 3) continue;
      const power = fieldPower(other);
      if (other.owner === a.owner) {
        friendly += power;
        continue;
      }
      enemy += power;
      const ox = other.tile % this.world.w;
      const oy = Math.floor(other.tile / this.world.w);
      const ang = Math.atan2(oy - ay, ox - ax);
      sides.add(Math.round(ang / (Math.PI * 2) * 8) & 7);
    }
    a.support = friendly;
    a.threat = enemy;
    a.flankSides = sides.size;
  }
  /**
   * Standing in one of your own cities is how a host heals.
   *
   * Men are the health of a formation, so refilling from the realm's pool IS the
   * repair: a beaten host parked on its own castle or market fills back up to
   * what that city can hold, and recovers its nerve far faster than in the open.
   */
  garrisonTick(a, p, dt) {
    const st = this.structs.get(a.tile);
    const home = st && st.owner === p.id && (st.kind === "castle" || st.kind === "market") ? st : void 0;
    a.regrouping = false;
    if (!home) return;
    const cap = ARMY_CAP(home.level);
    if (a.troops < cap && p.troops > 0) {
      const take = Math.min(cap - a.troops, p.troops, Math.max(8, cap * 0.25) * dt);
      a.troops += take;
      p.troops -= take;
    }
    let rations = this.rationsOf(a);
    const available = this.cityStock.get(a.tile) ?? 0;
    if (Number.isFinite(rations) && rations <= 0 && available > 20) {
      const draw = Math.min(available - 20, Math.max(60, a.troops * RATION_PER_MAN * 60), 200 * dt);
      a.rations = rations + draw;
      this.cityStock.set(a.tile, available - draw);
      rations = this.rationsOf(a);
    }
    if (!Number.isFinite(rations) || rations > a.troops * RATION_PER_MAN * 30) {
      a.morale = Math.min(1, a.morale + MORALE_RALLY * 1.5 * dt);
    }
    a.supply = Math.min(1, a.supply + SUPPLY_GAIN * dt);
    a.contactTimer = 0;
    if (a.routed && a.troops > 25) {
      a.routed = false;
      a.rallyTimer = 0;
    }
  }
  /** Rations a host has, treating an untracked host as fed. */
  rationsOf(a) {
    return Number.isFinite(a.rations) ? a.rations : Infinity;
  }
  /** How much food a city can hold: its barns within reach, capped. */
  stockCap(tile, owner) {
    let barns = 0;
    for (const st of this.structs.values()) {
      if (st.owner !== owner || st.kind !== "barn") continue;
      if (this.tileDistance(st.tile, tile) <= 3) barns++;
    }
    return Math.min(STOCK_CAP, BASE_STOCK + STOCK_PER_BARN * barns);
  }
  /** Every city this realm holds: castles and markets are where food lives. */
  citiesOf(owner) {
    const out = [];
    for (const st of this.structs.values()) {
      if (st.owner === owner && (st.kind === "castle" || st.kind === "market")) out.push(st);
    }
    return out;
  }
  /**
   * A city's food store, filled from the realm's granary and eaten by its people.
   *
   * The realm still earns grain; what changes is that food in a city is a finite
   * pile that can be starved, rather than a number nobody can interrupt.
   */
  cityStockTick(p, dt) {
    const cities = this.citiesOf(p.id);
    if (!cities.length) {
      for (const [tile] of this.cityStock) {
        const st = this.structs.get(tile);
        if (!st || st.owner === p.id) this.cityStock.delete(tile);
      }
      return;
    }
    for (const city of cities) {
      const cap = this.stockCap(city.tile, p.id);
      const popEat = (CITY_POP + city.level * 75) * POP_RATION;
      let stock = this.cityStock.get(city.tile) ?? 0;
      stock = Math.max(0, stock - popEat * dt);
      const larder = Math.min(cap, popEat * 180);
      const spare = (p.grain - 40) * 0.5;
      if (stock < larder && spare > 0) {
        const pull = Math.min(STOCK_FILL_RATE * dt, larder - stock, spare);
        stock += pull;
        p.grain -= pull;
      }
      this.cityStock.set(city.tile, stock);
      let nerve = this.cityMorale.get(city.tile) ?? 1;
      if (stock <= 0.5) {
        nerve = Math.max(0, nerve - SIEGE_MORALE_DRAIN * dt);
      } else {
        nerve = Math.min(1, nerve + SIEGE_MORALE_RECOVER * dt);
      }
      this.cityMorale.set(city.tile, nerve);
      if (nerve <= 0) this.cityCracks(city, p);
    }
  }
  /**
   * Hosts in the field ask for food, and cities answer with a convoy.
   *
   * This is deliberately automatic: a player sets the lines up by taking ground
   * and building barns, and the carts run from there. What the player controls is
   * whether the road stays open.
   */
  supplyRequests(dt) {
    this.requestTimer -= dt;
    if (this.requestTimer > 0) return;
    this.requestTimer = 2.5;
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const a of this.armies) {
        if (a.owner !== p.id) continue;
        const rations = this.rationsOf(a);
        const need = a.troops * RATION_PER_MAN * 90;
        if (Number.isFinite(rations) && rations > need) continue;
        if (this.convoys.some((c) => c.owner === p.id && c.to === (a.uid ?? a.home))) continue;
        this.dispatchConvoy(p.id, a);
      }
    }
  }
  /**
   * A starved host that has lost its nerve goes over to somebody else.
   *
   * The men are not destroyed: they enlist with the nearest rival holding ground,
   * which is what makes starving an army better than fighting it.
   */
  hostDefects(a) {
    const from = this.players[a.owner];
    let taker;
    let best = 20;
    for (const other of this.players) {
      if (!other.alive || other.id === a.owner) continue;
      let near = Infinity;
      for (const t of other.tiles) {
        const d = this.tileDistance(t, a.tile);
        if (d < near) near = d;
        if (near < best) break;
      }
      if (near < best) {
        best = near;
        taker = other;
      }
    }
    if (taker) {
      taker.troops += a.troops;
      if (!from.isBot) this.note(`Your hungry host gave up and went over to ${taker.name}: ${Math.round(a.troops)} men lost.`);
      else if (!taker.isBot) this.note(`${from.name}'s starving host came over to you: ${Math.round(a.troops)} men.`);
    } else {
      if (!from.isBot) this.note(`Your hungry host dispersed: ${Math.round(a.troops)} men simply went home.`);
    }
  }
  /** A city whose nerve is gone falls to whoever is besieging it. */
  cityCracks(city, p) {
    let besieger;
    let best = 7;
    for (const a of this.armies) {
      if (a.owner === p.id) continue;
      const d = this.tileDistance(a.tile, city.tile);
      if (d < best) {
        best = d;
        besieger = a;
      }
    }
    if (!besieger) {
      this.cityMorale.set(city.tile, 0);
      return;
    }
    const taker = this.players[besieger.owner];
    const old = p;
    city.owner = besieger.owner;
    this.cityStock.set(city.tile, 0);
    this.cityMorale.set(city.tile, 0.5);
    for (const t of this.neighbors4(city.tile)) {
      if (this.owners[t] === old.id) this.claim(t, besieger.owner);
    }
    for (const a of this.armies) {
      if (a.owner !== old.id) continue;
      if (this.tileDistance(a.tile, city.tile) > 2) continue;
      a.owner = besieger.owner;
      a.rations = 0;
    }
    this.note(`${old.name} lost ${city.kind === "castle" ? "its castle" : "a market"}: the garrison went over to ${taker.name}.`);
  }
  /** Rations in the nearest city of a realm. */
  nearestStockTile(owner, from) {
    let best = -1;
    let bestD = Infinity;
    for (const city of this.citiesOf(owner)) {
      const d = this.tileDistance(city.tile, from);
      if (d < bestD && (this.cityStock.get(city.tile) ?? 0) > 20) {
        bestD = d;
        best = city.tile;
      }
    }
    return best;
  }
  /**
   * Send rations from a city to a host in the field.
   *
   * The food travels: a real convoy on the map that an enemy host can cut. That
   * is the whole point of the supply war, so nothing is delivered abstractly.
   */
  dispatchConvoy(owner, host) {
    const from = this.nearestStockTile(owner, host.tile);
    if (from < 0) return false;
    const stock = this.cityStock.get(from) ?? 0;
    const load = Math.min(CONVOY_CAP, stock - 20, Math.max(80, host.troops * RATION_PER_MAN * 90));
    if (load <= 20) return false;
    this.cityStock.set(from, stock - load);
    this.convoys.push({
      id: this.nextConvoyId++,
      owner,
      from,
      to: host.uid ?? host.home,
      tile: from,
      rations: load,
      progress: 0
    });
    return true;
  }
  /** Convoys move, arrive, and die. */
  convoyTick(dt) {
    if (!this.convoys.length) return;
    const keep = [];
    for (const c of this.convoys) {
      const target = this.armies.find((a) => (a.uid ?? a.home) === c.to && a.owner === c.owner);
      if (!target) {
        const home = this.citiesOf(c.owner).sort(
          (x, y) => this.tileDistance(x.tile, c.tile) - this.tileDistance(y.tile, c.tile)
        )[0];
        if (!home) continue;
        c.to = -1;
        c.tile = this.stepToward(c.tile, home.tile, c.owner) ?? c.tile;
        if (c.tile === home.tile) this.cityStock.set(home.tile, (this.cityStock.get(home.tile) ?? 0) + c.rations);
        else keep.push(c);
        continue;
      }
      let ambush;
      for (const a of this.armies) {
        if (a.owner === c.owner) continue;
        if (this.tileDistance(a.tile, c.tile) <= 1 && a.troops > 40) {
          ambush = a;
          break;
        }
      }
      if (ambush) {
        this.note(`A convoy of ${this.players[c.owner].name} was cut: ${Math.round(c.rations)} rations lost.`);
        for (const a of this.armies) {
          if (a.owner === c.owner && this.tileDistance(a.tile, c.tile) <= 6) {
            a.morale = Math.max(0, a.morale - 0.05);
          }
        }
        continue;
      }
      c.progress += dt / CONVOY_STEP;
      while (c.progress >= 1) {
        c.progress -= 1;
        const step = this.stepToward(c.tile, target.tile, c.owner);
        if (step !== null) c.tile = step;
      }
      if (this.tileDistance(c.tile, target.tile) <= 1) {
        target.rations = this.rationsOf(target) + c.rations;
        if (!this.players[c.owner].isBot) this.note(`${Math.round(c.rations)} rations reached your host.`);
        continue;
      }
      keep.push(c);
    }
    this.convoys = keep;
  }
  /** The next step along your own ground toward a target, or null. */
  stepToward(from, to, owner) {
    if (from === to) return null;
    let best = null;
    let bestD = this.tileDistance(from, to);
    for (const n of this.neighbors4(from)) {
      if (!this.isLand(n)) continue;
      const o = this.owners[n];
      if (o >= 0 && o !== owner) continue;
      const d = this.tileDistance(n, to);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }
  /** What this host's morale is trying to be, given supply and the field. */
  moraleTarget(a) {
    const base = 0.32 + 0.68 * a.supply;
    const balance = (a.support + 400) / (a.threat + 400);
    let target = base + 0.22 * (Math.min(2.2, balance) - 1);
    const extra = Math.max(0, a.flankSides - 1);
    const flankWeight = a.tier >= 3 ? 0 : a.tier === 2 ? 0.11 : 0.22;
    target -= extra * flankWeight;
    if (a.tier === 1 && a.threat > a.support * 1.6 && a.flankSides >= 3) target -= 0.2;
    return Math.max(0.05, Math.min(1, target));
  }
  armyTick(dt) {
    for (let i = this.armies.length - 1; i >= 0; i--) {
      const a = this.armies[i];
      const p = this.players[a.owner];
      if (!p.alive) {
        this.armies.splice(i, 1);
        continue;
      }
      if (!Number.isFinite(a.supply)) a.supply = 1;
      if (!Number.isFinite(a.morale)) a.morale = 1;
      if (typeof a.routed !== "boolean") a.routed = false;
      if (!Number.isFinite(a.rallyTimer)) a.rallyTimer = 0;
      a.supplyTimer -= dt;
      if (a.supplyTimer <= 0) {
        a.supplyTimer = 0.35;
        const connected = this.traceHome(a);
        if (a.cutOff !== !connected) {
          a.cutOff = !connected;
          if (a.cutOff && !p.isBot) this.note("A push has been cut off from home.");
        }
      }
      const rations = this.rationsOf(a);
      const starving = Number.isFinite(rations) && rations <= 0;
      if (Number.isFinite(rations)) {
        const eat = a.troops * RATION_PER_MAN * dt;
        a.rations = rations - eat;
        if (a.rations <= 0) {
          a.rations = 0;
          a.morale = Math.max(0, a.morale - 0.06 * dt);
          a.supply = Math.max(0, a.supply - SUPPLY_CUT * dt);
          if (a.morale <= 0.02) {
            this.hostDefects(a);
            this.armies.splice(i, 1);
            continue;
          }
        }
        const steadyFood = a.troops * RATION_PER_MAN * 30;
        if (a.rations > steadyFood && a.morale < 1) {
          a.morale = Math.min(1, a.morale + 0.02 * dt);
        }
      }
      if (a.cutOff) a.supply = Math.max(0, a.supply - SUPPLY_CUT * dt);
      else if (p.grain > 0 && p.rates.grain >= 0) a.supply = Math.min(1, a.supply + SUPPLY_GAIN * dt);
      else a.supply = Math.max(0, a.supply - SUPPLY_HUNGRY * dt);
      if (a.contactTimer > 0) a.contactTimer = Math.max(0, a.contactTimer - dt);
      a.supplyTimer -= 0;
      this.surveyPressure(a);
      const steady = starving ? 0 : this.moraleTarget(a);
      if (a.contactTimer <= 0 && !starving) {
        if (a.morale < steady) a.morale = Math.min(steady, a.morale + MORALE_RALLY * dt);
        else a.morale = Math.max(steady, a.morale - MORALE_RALLY * 0.5 * dt);
      }
      if (a.routed && a.rallyTimer > 0) {
        a.rallyTimer = Math.max(0, a.rallyTimer - dt);
        if (a.rallyTimer === 0 && a.morale > 0.5) {
          a.routed = false;
          if (!p.isBot) this.note("A routed host has rallied at home.");
        }
      }
      if (a.supply <= 0.02) {
        a.troops *= 1 - 0.12 * dt;
        if (a.troops < 40) {
          this.armies.splice(i, 1);
          if (!p.isBot) this.note("A push with no supply line has melted away.");
          continue;
        }
      }
      if (p.grain <= 0 && p.rates.grain < 0) {
        a.troops *= 1 - 0.03 * dt;
        if (a.troops < 25) {
          this.armies.splice(i, 1);
          if (!p.isBot) this.note("A host that could not be fed has melted away.");
          continue;
        }
      }
      if (a.routed || a.pulling) {
        const back = this.nextOwnTile(a);
        a.progress += this.armySpeed(a.troops) * dt * 0.85;
        while (a.progress >= 1) {
          a.progress -= 1;
          const step = this.nextOwnTile(a);
          if (step < 0) break;
          a.tile = step;
        }
        if (a.tile === a.home || back < 0) {
          p.troops += Math.round(a.troops);
          this.armies.splice(i, 1);
          if (!p.isBot) {
            this.note(
              a.pulling ? "Your host is back behind the walls, ready to be thrown in again." : "Broken men are back behind the walls and ready to be mustered."
            );
          }
          continue;
        }
        continue;
      }
      if (a.holding) {
        a.holdTimer += dt;
        this.garrisonTick(a, p, dt);
        if (a.supply > 0.25 && p.troops > 0) {
          const homeCastle = this.structs.get(a.home);
          const cap = homeCastle && homeCastle.kind === "castle" ? ARMY_CAP(homeCastle.level) : 100;
          if (a.troops < cap) {
            const take = Math.min(cap - a.troops, p.troops, Math.max(6, cap * 0.06) * dt);
            a.troops += take;
            p.troops -= take;
          }
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
  /**
   * Anything already standing on a tile a host walks into. Returns true when
   * the move became a fight, so the caller does not also move the host.
   */
  contestTile(a, p, t) {
    if (this.era === "peace") return false;
    const foe = this.armies.find((x) => x !== a && x.owner !== a.owner && x.tile === t);
    if (foe) {
      this.armyBattle(a, p, foe);
      return true;
    }
    const st = this.structs.get(t);
    if (st && st.kind === "camp" && st.owner !== a.owner) {
      this.campBattle(a, p, st);
      return true;
    }
    return false;
  }
  armyStep(a, p) {
    const tgtOwner = this.owners[a.target];
    if (tgtOwner === a.owner || a.regrouping && tgtOwner === a.owner) {
      const through = this.nextOwnTile(a);
      if (through >= 0) {
        if (this.contestTile(a, p, through)) return;
        a.tile = through;
        if (a.tile === a.target) a.holding = true;
        return;
      }
    }
    const next = this.nextTile(a);
    if (next < 0) {
      const through = this.nextOwnTile(a);
      if (through >= 0) {
        if (this.contestTile(a, p, through)) return;
        a.tile = through;
        if (a.tile === a.target) a.holding = true;
        return;
      }
      a.holding = true;
      return;
    }
    if (this.contestTile(a, p, next)) return;
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
    if (this.era === "peace") {
      a.holding = true;
      if (!p.isBot) this.note("The peace holds. Your host will not cross the border.");
      return;
    }
    const def = this.defenseAt(next, owner);
    const atk = fieldPower(a);
    if (!this.canAfford(p, PRICE.pushTile)) {
      a.holding = true;
      if (!p.isBot) this.note("Your host is out of stores and cannot press the attack.");
      return;
    }
    if (atk > def) {
      this.pay(p, PRICE.pushTile);
      const armour = a.tier >= 3 ? 0.55 : a.tier === 2 ? 0.8 : 1;
      a.troops = Math.max(1, a.troops - def * 0.7 / (0.34 + 0.66 * a.supply) * armour);
      a.morale = Math.max(0.05, a.morale - 0.05);
      const defender = this.players[owner];
      defender.troops = Math.max(0, defender.troops - def * 0.45);
      this.capture(next, a.owner);
      a.tile = next;
      a.taken++;
      if (next === a.target) a.holding = true;
      if (!p.isBot && a.taken === 1) this.note("The line has been broken.");
    } else {
      const defender = this.players[owner];
      defender.troops = Math.max(0, defender.troops - fieldPower(a) * 0.35);
      a.troops = Math.max(0, a.troops - def * 0.8 / (0.34 + 0.66 * a.supply));
      a.morale = Math.max(0, a.morale - 0.16);
      a.holding = true;
      if (a.morale <= 0.02) {
        this.route(a);
        if (!p.isBot) this.note("Your host has had enough and falls back.");
      } else if (a.troops < 45) {
        const idx2 = this.armies.indexOf(a);
        if (idx2 >= 0) this.armies.splice(idx2, 1);
        if (!p.isBot) this.note("A push has broken against the line.");
      }
    }
  }
  /** An adjacent friendly tile that is closer to the objective, if any. */
  nextOwnTile(a) {
    let best = -1;
    let bestD = this.tileDistance(a.tile, a.target);
    for (const n of this.neighbors8(a.tile)) {
      if (!this.isLand(n) || this.owners[n] !== a.owner) continue;
      const d = this.tileDistance(n, a.target);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }
  /** Next tile for a push: toward the objective, never onto own ground. */
  nextTile(a) {
    let best = -1;
    let bestScore = Infinity;
    const curDist = this.tileDistance(a.tile, a.target);
    for (const n of this.neighbors8(a.tile)) {
      if (!this.passable(n)) continue;
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
        if (!this.passable(n)) continue;
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
  /** Cost of n copies of a price, so per-tile and per-man prices stay one line. */
  scaleCost(cost, n) {
    return {
      grain: cost.grain * n,
      timber: cost.timber * n,
      ore: cost.ore * n,
      gold: cost.gold * n
    };
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
    if (kind === "bridge") {
      if (t < 0) return "off the map";
      if (this.isLand(t)) return "water only";
      if (this.structs.has(t)) return "occupied";
      const mine = this.neighbors4(t).some((n) => this.owners[n] === p.id && this.passable(n));
      return mine ? null : "from your shore";
    }
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
      if (kind === "bridge") this.claim(t, p.id);
    }
    this.structDirty = true;
    this.refreshRates(p);
    if (!p.isBot) this.note(`${STRUCTURE_LABEL[kind]} raised.`);
    return true;
  }
  /**
   * 80% captured and the realm breaks: the rest of its ground passes to the
   * rival who took the most of it. Elimination is therefore a decision, not a
   * hunt for the last tile, which is what last-man-standing needs to be
   * survivable in a game that runs for a month.
   */
  checkSurrender(dt) {
    this.surrenderTimer -= dt;
    if (this.surrenderTimer > 0) return;
    this.surrenderTimer = 0.5;
    for (const p of this.players) {
      if (!p.alive || p.peak < SURRENDER_FLOOR) continue;
      if (p.tileCount > p.peak * SURRENDER_KEEP) continue;
      let taker = -1;
      let most = 0;
      for (const key of Object.keys(p.capturedBy)) {
        const id = Number(key);
        const taken = p.capturedBy[id] ?? 0;
        const other = this.players[id];
        if (!other || !other.alive || id === p.id) continue;
        if (taken > most) {
          most = taken;
          taker = id;
        }
      }
      if (taker < 0) continue;
      for (const t of [...p.tiles]) this.claim(t, taker);
      p.alive = false;
      p.surrenderTo = taker;
      p.soldiers = 0;
      p.troops = 0;
      this.note(`${p.name} has broken: ${this.players[taker].name} takes the field.`);
      if (p.id === this.human) this.finish(-2);
    }
  }
  /** Last man standing: one realm left holding ground ends the world. */
  checkStanding() {
    const standing = this.players.filter((p) => p.alive && p.tileCount > 0);
    if (standing.length === 1) this.finish(standing[0].id);
  }
  finish(winner) {
    if (this.phase === "over") return;
    this.phase = "over";
    this.winner = winner;
  }
  tick(dt) {
    if (this.phase === "spawn") return;
    this.time += dt;
    this.growNodes(dt);
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.immune > 0) p.immune = Math.max(0, p.immune - dt);
      if (p.kitWarn > 0) p.kitWarn -= dt;
      p.frontTimer -= dt;
      if (p.frontTimer <= 0) {
        p.frontTimer = 1;
        this.refreshFront(p);
      }
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
      if (!starving) this.muster(p);
    }
    this.armyTick(dt);
    this.campTick(dt);
    for (const p of this.players) {
      if (p.isBot && p.alive) this.botThink(p, dt);
    }
    if (this.phase === "playing") {
      this.year = Math.floor(this.time / YEAR_SECONDS);
      if (this.era === "peace") {
        const living = this.players.filter((p) => p.alive && p.tileCount > 0);
        const allCrossed = living.length > 0 && living.every((p) => p.crossed);
        if (allCrossed || this.year >= PEACE_YEARS) {
          this.era = "war";
          this.note(
            allCrossed ? "Every banner stands on middle ground. The peace is broken." : "The years of peace are over. The roads belong to armies now."
          );
        }
      }
      for (const p of this.players) if (p.alive) this.cityStockTick(p, dt);
      this.convoyTick(dt);
      this.supplyRequests(dt);
      this.checkSurrender(dt);
      this.checkStanding();
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
      if (t >= 0 && this.build(p, kind, t)) {
        this.botDebug["build:" + kind] = (this.botDebug["build:" + kind] ?? 0) + 1;
        return;
      }
    }
    if (p.rates.grain > 3 && p.gold > 260 && p.timber > 220) {
      const seat = [...this.structs.values()].filter((st) => st.owner === p.id && st.kind === "castle").sort((a, b) => b.level - a.level)[0];
      if (seat && this.build(p, "castle", seat.tile)) {
        this.botDebug["raise-seat"] = (this.botDebug["raise-seat"] ?? 0) + 1;
        return;
      }
    }
    if (!p.crossed && this.botBridge(p)) {
      this.botDebug.bridge = (this.botDebug.bridge ?? 0) + 1;
      return;
    }
    if (p.rates.grain <= 0.05) {
      const surplus = this.armies.filter((a) => a.owner === p.id && !a.routed);
      if (surplus.length > 1) {
        this.route(surplus[surplus.length - 1]);
        this.botDebug.starveRoute = (this.botDebug.starveRoute ?? 0) + 1;
        return;
      }
      this.botDebug.starveIdle = (this.botDebug.starveIdle ?? 0) + 1;
      return;
    }
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
    if (!targets.length) {
      this.botDebug.noTargets = (this.botDebug.noTargets ?? 0) + 1;
      return;
    }
    targets.sort((a, b) => a.cost - b.cost);
    const pick = targets[Math.floor(this.rng() * Math.min(4, targets.length))];
    const ratio = 0.25 + this.rng() * 0.3;
    for (const a of this.armies) {
      if (a.owner !== p.id || !a.holding) continue;
      if (this.owners[a.tile] === p.id) continue;
      if (this.rng() < 0.5 && this.establishCamp(p, a.home)) {
        this.botDebug.camp = (this.botDebug.camp ?? 0) + 1;
        return;
      }
    }
    const idle = this.armies.filter((a) => a.owner === p.id && a.holding && !a.routed && !a.pulling);
    if (idle.length && this.rng() < 0.8) {
      const host = idle[Math.floor(this.rng() * idle.length)];
      const local = this.nearestBorderTarget(p, host.tile);
      const goal = local >= 0 ? local : pick.t;
      if (host.tile !== goal && this.moveArmy(p, host.home, goal)) {
        this.botDebug.pushHost = (this.botDebug.pushHost ?? 0) + 1;
        return;
      }
    }
    this.orderArmy(p, pick.t, ratio);
  }
  /**
   * Lay one span of the crossing to the middle ground, if this lord can pay.
   *
   * The chain is built the same way a player builds it: a span on water that
   * touches your own ground, which then becomes your ground so the next span
   * can push further. Each span chosen is the one closest to the middle, so the
   * bridge goes somewhere instead of wandering along the beach.
   */
  botBridge(p) {
    if (this.era === "war" && this.rng() < 0.5) return false;
    const cost = this.buildCost("bridge", 1);
    if (!this.canAfford(p, cost)) return false;
    const cx = this.world.w >> 1;
    const cy = this.world.h >> 1;
    const middle = cy * this.world.w + cx;
    let best = -1;
    let bestD = Infinity;
    for (const i of p.tiles) {
      for (const n of this.neighbors4(i)) {
        if (this.isLand(n)) continue;
        if (this.owners[n] >= 0 && this.owners[n] !== p.id) continue;
        const d = this.tileDistance(n, middle);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    if (best < 0) return false;
    return this.build(p, "bridge", best);
  }
  /**
   * The border tile nearest a given host, which is where that host should fight.
   *
   * Lords used to order a host at whatever weak border they could see anywhere
   * in the world, so columns spent whole campaigns walking and never met. A host
   * fights the front it is standing on.
   */
  nearestBorderTarget(p, from) {
    let best = -1;
    let bestD = Infinity;
    for (const i of p.tiles) {
      if (this.tileDistance(i, from) > bestD) continue;
      for (const n of this.neighbors4(i)) {
        if (this.owners[n] === p.id || !this.isLand(n)) continue;
        const owner = this.owners[n];
        if (owner >= 0 && this.players[owner].immune > 0) continue;
        const d = this.tileDistance(n, from);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    return best;
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
    const rate = Math.min(8, 0.25 + Math.max(0, p.grainProd) * 0.9);
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
    if (!this.canAfford(p, PRICE.claimTile)) {
      p.spreadAcc = 0;
      return;
    }
    this.pay(p, PRICE.claimTile);
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
      pk: Math.round(p.peak),
      cx: p.crossed ? 1 : 0,
      cb: Object.keys(p.capturedBy).map((k) => [Number(k), p.capturedBy[Number(k)]]),
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
      c: a.cutOff ? 1 : 0,
      m: a.home,
      h: a.holding ? 1 : 0,
      sp: +a.supply.toFixed(2),
      mo: +a.morale.toFixed(2),
      rt: a.routed ? 1 : 0,
      tr: a.tier,
      pl: a.pulling ? 1 : 0,
      rg: a.regrouping ? 1 : 0,
      ui: a.uid ?? 0,
      ra: Number.isFinite(a.rations) ? Math.round(a.rations) : -1
    }));
    const nodes = this.claimNodes.slice(0, 240).map((n) => [n.tile, n.owner, n.done ? 1 : 0]);
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
      // Without these a reload put the world back in year one of peacetime and
      // every war in progress simply stopped: the refresh looked like a ruined
      // game. The era is part of the world, not of the session.
      er: this.era,
      yr: this.year,
      wn: this.winner,
      hm: this.human,
      ms: this.messages.slice(-10),
      p: players,
      a: armies,
      s: structs,
      cn: nodes,
      cv: this.convoys.map((c) => [c.id, c.owner, c.from, c.to, c.tile, Math.round(c.rations)]),
      cs: [...this.cityStock.entries()].map(([t, v]) => [t, Math.round(v)]),
      cm: [...this.cityMorale.entries()].map(([t, v]) => [t, +v.toFixed(2)]),
      ua: this.nextArmyUid,
      uc: this.nextConvoyId
    });
  }
  /** Guest side: become a display of the host's world. */
  applySnapshot(text) {
    const snap = JSON.parse(text);
    this.time = snap.tm;
    this.phase = snap.ph;
    this.era = snap.er === "war" ? "war" : "peace";
    this.year = Number.isFinite(snap.yr) ? snap.yr : Math.floor((this.time || 0) / YEAR_SECONDS);
    this.winner = Number.isFinite(snap.wn) ? snap.wn : -1;
    this.human = snap.hm ?? 0;
    this.messages = snap.ms ?? [];
    this.owners.fill(-1);
    this.armies = [];
    this.structs.clear();
    this.convoys = (snap.cv ?? []).map((r) => ({
      id: r[0],
      owner: r[1],
      from: r[2],
      to: r[3],
      tile: r[4],
      rations: r[5],
      progress: 0
    }));
    this.cityStock = new Map((snap.cs ?? []).map((r) => [r[0], r[1]]));
    this.cityMorale = new Map((snap.cm ?? []).map((r) => [r[0], r[1]]));
    this.nextArmyUid = Number.isFinite(snap.ua) ? snap.ua : 1;
    this.nextConvoyId = Number.isFinite(snap.uc) ? snap.uc : 1;
    this.claimNodes = (snap.cn ?? []).map((r) => ({
      owner: r[1],
      tile: r[0],
      frontier: [],
      seen: /* @__PURE__ */ new Set(),
      acc: 0,
      done: r[2] === 1
    }));
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
      p.peak = Math.round(d.pk ?? p.tileCount);
      p.crossed = !!d.cx;
      p.capturedBy = {};
      for (const pair of d.cb ?? []) p.capturedBy[pair[0]] = pair[1];
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
        home: d.m ?? d.t,
        troops: d.n,
        tile: d.t,
        target: d.g,
        progress: 0,
        taken: 0,
        cutOff: !!d.c,
        speed: 0,
        supplyTimer: 0,
        supply: typeof d.sp === "number" ? d.sp : 1,
        morale: typeof d.mo === "number" ? d.mo : 1,
        routed: !!d.rt,
        rallyTimer: 0,
        contactTimer: 0,
        tier: typeof d.tr === "number" ? d.tr : 1,
        uid: typeof d.ui === "number" && d.ui > 0 ? d.ui : void 0,
        rations: typeof d.ra === "number" && d.ra >= 0 ? d.ra : void 0,
        support: 0,
        threat: 0,
        flankSides: 0,
        pulling: !!d.pl,
        regrouping: !!d.rg,
        holding: d.h === 1,
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
export {
  ARMY_CAP,
  BASE_STOCK,
  BASE_YIELD,
  BUILD,
  CITY_POP,
  CLAIM_REACH,
  CONVOY_CAP,
  CONVOY_STEP,
  FEED_SHARE,
  Game,
  MIDDLE_MARK,
  MORALE_RALLY,
  NODE_RADIUS,
  ORE_PER_TROOP,
  PALETTE,
  PEACE_YEARS,
  POP_RATION,
  PRICE,
  RATIONS_PER_TROOP,
  RATION_PER_MAN,
  SIEGE_MORALE_DRAIN,
  SIEGE_MORALE_RECOVER,
  STOCK_CAP,
  STOCK_FILL_RATE,
  STOCK_PER_BARN,
  STRUCTURE_LABEL,
  STRUCT_ORDER,
  SUPPLY_CUT,
  SUPPLY_GAIN,
  SUPPLY_HUNGRY,
  SURRENDER_FLOOR,
  SURRENDER_KEEP,
  TERRAIN_FOR,
  TIER_COST_SCALE,
  TIER_NAME,
  TIER_POWER,
  TILE_YIELD,
  UPKEEP_PER_TROOP,
  YEAR_SECONDS,
  YIELD,
  fieldPower,
  tierUpCost
};
