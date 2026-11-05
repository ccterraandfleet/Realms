"use strict";
(() => {
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
  function mulberry32(seed2) {
    let a = seed2 >>> 0;
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
  function generateWorld(seed2, w = 400, h = 260) {
    const rand = mulberry32(seed2);
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
    return { w, h, terrain, landTiles, seed: seed2, richness, pockets, middleTiles };
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
    "camp"
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
    camp: { grain: 20, timber: 60, ore: 30, gold: 40 }
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
    bridge: "Bridge"
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
    constructor(seed2, w = 400, h = 260) {
      this.seed = seed2;
      this.players = [];
      this.structs = /* @__PURE__ */ new Map();
      this.armies = [];
      this.time = 0;
      this.phase = "spawn";
      this.winner = -1;
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
      /* ------------------------------------------------------------------ */
      /* Tick                                                                */
      /* ------------------------------------------------------------------ */
      this.surrenderTimer = 0;
      this.world = generateWorld(seed2, w, h);
      this.owners = new Int16Array(w * h).fill(-1);
      this.rng = mulberry32(seed2 ^ 2654435769);
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
      a.morale = Math.min(1, a.morale + MORALE_RALLY * 1.5 * dt);
      a.supply = Math.min(1, a.supply + SUPPLY_GAIN * dt);
      a.contactTimer = 0;
      if (a.routed && a.troops > 25) {
        a.routed = false;
        a.rallyTimer = 0;
      }
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
        if (a.cutOff) a.supply = Math.max(0, a.supply - SUPPLY_CUT * dt);
        else if (p.grain > 0 && p.rates.grain >= 0) a.supply = Math.min(1, a.supply + SUPPLY_GAIN * dt);
        else a.supply = Math.max(0, a.supply - SUPPLY_HUNGRY * dt);
        if (a.contactTimer > 0) a.contactTimer = Math.max(0, a.contactTimer - dt);
        a.supplyTimer -= 0;
        this.surveyPressure(a);
        const steady = this.moraleTarget(a);
        if (a.contactTimer <= 0) {
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
        rg: a.regrouping ? 1 : 0
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
        hm: this.human,
        ms: this.messages.slice(-10),
        p: players,
        a: armies,
        s: structs,
        cn: nodes
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

  // src/render/renderer.ts
  var P = 3;
  var TERRAIN = {
    [OCEAN]: [26, 55, 74],
    [SAND]: [201, 182, 141],
    [PLAINS]: [109, 138, 74],
    [FOREST]: [58, 92, 54],
    [MOUNTAIN]: [126, 122, 111]
  };
  function hash(x, y, seed2) {
    let h = x * 374761393 + y * 668265263 + seed2 * 2246822519;
    h = (h ^ h >>> 13) * 1274126177;
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, Math.round((n >> 16 & 255) * f)));
    const g = Math.min(255, Math.max(0, Math.round((n >> 8 & 255) * f)));
    const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
    return `rgb(${r},${g},${b})`;
  }
  var Renderer = class {
    constructor(canvas2, game2) {
      this.canvas = canvas2;
      /** Start-of-match highlight: a swirl over your land. */
      this.swirlTile = -1;
      this.swirlFrom = 0;
      /** Which formation the player has picked, by its home castle tile. */
      this.selectedHome = null;
      /** Border tiles, rebuilt a few times a second: the standing lines. */
      this.frontier = [];
      this.frontierTimer = 0;
      this.g = game2;
      const { w, h } = game2.world;
      const mk = () => {
        const c = document.createElement("canvas");
        c.width = w * P;
        c.height = h * P;
        return c;
      };
      this.terrainCv = mk();
      this.ownerCv = mk();
      this.borderCv = mk();
      this.paintTerrain();
      this.repaintAll();
    }
    setSelection(home) {
      this.selectedHome = home;
    }
    beginSwirl(tile, fromMs) {
      this.swirlTile = tile;
      this.swirlFrom = fromMs;
    }
    /* ---------------------------------------------------------------- */
    /* Terrain                                                          */
    /* ---------------------------------------------------------------- */
    paintTerrain() {
      const { w, h, terrain } = this.g.world;
      const ctx = this.terrainCv.getContext("2d");
      const img = ctx.createImageData(w * P, h * P);
      const d = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = terrain[y * w + x];
          const base = TERRAIN[t];
          const n = hash(x, y, 11) - 0.5;
          const lift = 1 + n * (t === OCEAN ? 0.1 : 0.24);
          let slope = 1;
          if (y > 0) {
            const up = terrain[(y - 1) * w + x];
            slope = t === OCEAN ? 1 : 1 + (t - up) * 0.06;
          }
          const rich = this.g.world.richness[y * w + x] || 1;
          const wealth = t === OCEAN ? 1 : 1 + (rich - 1) * 0.16;
          const r = Math.min(255, base[0] * lift * slope * wealth);
          const gch = Math.min(255, base[1] * lift * slope * (1 + (rich - 1) * 0.1));
          const b = Math.min(255, base[2] * lift * slope * (1 - (rich - 1) * 0.05));
          for (let py = 0; py < P; py++) {
            for (let px = 0; px < P; px++) {
              const i = ((y * P + py) * w * P + (x * P + px)) * 4;
              d[i] = r;
              d[i + 1] = gch;
              d[i + 2] = b;
              d[i + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = terrain[y * w + x];
          const r = hash(x, y, 5);
          if (t === FOREST && r > 0.35) {
            ctx.fillStyle = r > 0.8 ? "#4e7d47" : "#31502e";
            const cx = x * P + 1 + hash(x, y, 3) * 1.2;
            const cy = y * P + 1.2 + hash(x, y, 4) * 1.2;
            ctx.beginPath();
            ctx.moveTo(cx, cy - 1.5);
            ctx.lineTo(cx + 1.15, cy + 1.2);
            ctx.lineTo(cx - 1.15, cy + 1.2);
            ctx.closePath();
            ctx.fill();
          } else if (t === MOUNTAIN && r > 0.55) {
            ctx.fillStyle = r > 0.85 ? "#efece4" : "#a9a49a";
            ctx.beginPath();
            ctx.moveTo(x * P + 1.5, y * P + 0.4);
            ctx.lineTo(x * P + 2.9, y * P + 2.6);
            ctx.lineTo(x * P + 0.1, y * P + 2.6);
            ctx.closePath();
            ctx.fill();
          } else if (t === OCEAN && r > 0.86) {
            ctx.fillStyle = "rgba(150,196,214,0.18)";
            ctx.fillRect(x * P, y * P + 1, P, 1);
          }
        }
      }
    }
    /* ---------------------------------------------------------------- */
    /* Territory                                                        */
    /* ---------------------------------------------------------------- */
    paintTile(t) {
      const { w, h } = this.g.world;
      const x = t % w;
      const y = t / w | 0;
      const owner = this.g.ownerAt(t);
      const octx = this.ownerCv.getContext("2d");
      const bctx = this.borderCv.getContext("2d");
      octx.clearRect(x * P, y * P, P, P);
      if (owner >= 0) {
        octx.globalAlpha = 0.5;
        octx.fillStyle = PALETTE[owner % PALETTE.length];
        octx.fillRect(x * P, y * P, P, P);
        octx.globalAlpha = 1;
      }
      bctx.clearRect(x * P, y * P, P, P);
      if (owner < 0) return;
      const col = shade(PALETTE[owner % PALETTE.length], 0.5);
      bctx.fillStyle = col;
      const bx = x * P;
      const by = y * P;
      const same = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
        return this.g.ownerAt(ny * w + nx) === owner;
      };
      const T = Math.max(1, P * 0.42);
      if (!same(x, y - 1)) bctx.fillRect(bx, by, P, T);
      if (!same(x, y + 1)) bctx.fillRect(bx, by + P - T, P, T);
      if (!same(x - 1, y)) bctx.fillRect(bx, by, T, P);
      if (!same(x + 1, y)) bctx.fillRect(bx + P - T, by, T, P);
    }
    /** Repaint the whole territory layer (used on init and world reset). */
    repaintAll() {
      const { w, h } = this.g.world;
      this.ownerCv.getContext("2d").clearRect(0, 0, w * P, h * P);
      this.borderCv.getContext("2d").clearRect(0, 0, w * P, h * P);
      for (let t = 0; t < w * h; t++) this.paintTile(t);
    }
    rebuildFrontier() {
      const { w, h, terrain } = this.g.world;
      const out = [];
      for (let t = 0; t < w * h; t++) {
        const owner = this.g.ownerAt(t);
        if (owner < 0 || terrain[t] === 0) continue;
        const x = t % w;
        const y = t / w | 0;
        if (x > 0 && this.g.ownerAt(t - 1) !== owner || x < w - 1 && this.g.ownerAt(t + 1) !== owner || y > 0 && this.g.ownerAt(t - w) !== owner || y < h - 1 && this.g.ownerAt(t + w) !== owner) {
          out.push(t);
        }
      }
      this.frontier = out;
    }
    /** Flush tiles that changed ownership since the last frame. */
    flushDirty() {
      const dirty = this.g.dirty;
      if (!dirty.size) return;
      let n = 0;
      for (const t of dirty) {
        this.paintTile(t);
        if (++n > 6e3) break;
      }
      dirty.clear();
    }
    /* ---------------------------------------------------------------- */
    /* Frame                                                            */
    /* ---------------------------------------------------------------- */
    draw(cam2, hover2, buildKind2, dpr2) {
      const ctx = this.canvas.getContext("2d");
      const { w, h } = this.g.world;
      this.flushDirty();
      ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#0d1c26";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const dw = w * cam2.scale;
      const dh = h * cam2.scale;
      ctx.drawImage(this.terrainCv, 0, 0, this.terrainCv.width, this.terrainCv.height, cam2.x, cam2.y, dw, dh);
      ctx.drawImage(this.ownerCv, 0, 0, this.ownerCv.width, this.ownerCv.height, cam2.x, cam2.y, dw, dh);
      ctx.drawImage(this.borderCv, 0, 0, this.borderCv.width, this.borderCv.height, cam2.x, cam2.y, dw, dh);
      const toScreen = (t) => {
        const x = t % w + 0.5;
        const y = (t / w | 0) + 0.5;
        return [cam2.x + x * cam2.scale, cam2.y + y * cam2.scale];
      };
      if (cam2.scale >= 2.6) {
        this.frontierTimer -= 1;
        if (this.frontierTimer <= 0) {
          this.frontierTimer = 20;
          this.rebuildFrontier();
        }
        const r = Math.max(0.7, cam2.scale * 0.085);
        for (const t of this.frontier) {
          const owner = this.g.ownerAt(t);
          if (owner < 0) continue;
          const x = t % w;
          const y = t / w | 0;
          const sx = cam2.x + (x + 0.5) * cam2.scale;
          const sy = cam2.y + (y + 0.5) * cam2.scale;
          if (sx < -20 || sy < -20 || sx > this.canvas.width / dpr2 + 20 || sy > this.canvas.height / dpr2 + 20) continue;
          let ox = 0;
          let oy = 0;
          for (const n of this.g.neighbors4(t)) {
            if (this.g.ownerAt(n) === owner) continue;
            const nx = n % w;
            const ny = n / w | 0;
            ox += Math.sign(nx - x) * 0.26;
            oy += Math.sign(ny - y) * 0.26;
          }
          if ((x + y & 1) === 0) continue;
          const px = sx + ox * cam2.scale;
          const py = sy + oy * cam2.scale;
          ctx.fillStyle = "rgba(20,16,10,0.45)";
          ctx.beginPath();
          ctx.arc(px, py + r * 0.5, r * 1.35, 0, 6.283);
          ctx.fill();
          ctx.fillStyle = "#f6efd9";
          ctx.beginPath();
          ctx.arc(px, py, r * 1.3, 0, 6.283);
          ctx.fill();
          ctx.fillStyle = PALETTE[owner % PALETTE.length];
          ctx.beginPath();
          ctx.arc(px, py, r * 0.8, 0, 6.283);
          ctx.fill();
        }
      }
      for (const a of this.g.armies) {
        const col = PALETTE[a.owner % PALETTE.length];
        const [ax, ay] = toScreen(a.tile);
        const [bx, by] = toScreen(a.target);
        if (ax < -80 || ay < -80 || ax > this.canvas.width / dpr2 + 80 || ay > this.canvas.height / dpr2 + 80) continue;
        ctx.strokeStyle = "rgba(18,14,8,0.4)";
        ctx.lineWidth = Math.max(1, cam2.scale * 0.12);
        ctx.setLineDash([Math.max(3, cam2.scale * 0.5), Math.max(3, cam2.scale * 0.45)]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        const cs = Math.max(3, cam2.scale * 0.52);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, cam2.scale * 0.1);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(bx - cs, by);
        ctx.lineTo(bx + cs, by);
        ctx.moveTo(bx, by - cs);
        ctx.lineTo(bx, by + cs);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx, by, cs * 0.62, 0, 6.283);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const dots = Math.max(3, Math.min(9, 2 + Math.floor(Math.log10(1 + a.troops) * 2)));
        const r = Math.max(1.2, cam2.scale * 0.16);
        ctx.globalAlpha = 0.35 + 0.65 * a.supply;
        for (let i = 0; i < dots; i++) {
          const ang = i / dots * 6.283;
          const rad = cam2.scale * (0.3 + 0.11 * (i % 3));
          const px = ax + Math.cos(ang) * rad;
          const py = ay - cam2.scale * 0.1 + Math.sin(ang) * rad * 0.7;
          ctx.fillStyle = i === 0 ? "#fdf6e4" : col;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, 6.283);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const cond = Math.max(0, Math.min(1, a.supply * 0.55 + a.morale * 0.45));
        if (cond < 0.97) {
          const bw = Math.max(10, cam2.scale * 1.25);
          const bh = Math.max(2, cam2.scale * 0.12);
          const bx0 = ax - bw / 2;
          const by0 = ay + cam2.scale * 1;
          ctx.fillStyle = "rgba(12,10,6,0.6)";
          ctx.fillRect(bx0, by0, bw, bh);
          ctx.fillStyle = cond > 0.66 ? "rgba(150,214,120,0.95)" : cond > 0.33 ? "rgba(240,196,90,0.95)" : "rgba(232,88,74,0.95)";
          ctx.fillRect(bx0, by0, bw * cond, bh);
        }
        const tier = Math.max(1, Math.min(3, a.tier ?? 1));
        if (tier > 1) {
          const pw = Math.max(2, cam2.scale * 0.14);
          const gap = Math.max(1, cam2.scale * 0.12);
          const totalW = tier * pw + (tier - 1) * gap;
          const py = ay - cam2.scale * 0.95;
          ctx.fillStyle = tier >= 3 ? "rgba(255,239,178,0.95)" : "rgba(214,190,132,0.9)";
          for (let i = 0; i < tier; i++) {
            ctx.fillRect(ax - totalW / 2 + i * (pw + gap), py, pw, Math.max(2, cam2.scale * 0.09));
          }
        }
        if (a.routed) {
          const [hx, hy] = toScreen(a.home);
          ctx.strokeStyle = "rgba(232,88,74,0.75)";
          ctx.lineWidth = Math.max(1, cam2.scale * 0.1);
          ctx.setLineDash([Math.max(3, cam2.scale * 0.4), Math.max(3, cam2.scale * 0.3)]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = "rgba(255,246,214,0.9)";
          ctx.lineWidth = Math.max(1.2, cam2.scale * 0.12);
          ctx.beginPath();
          ctx.arc(ax, ay, cam2.scale * 1.05, 0, 6.283);
          ctx.stroke();
        }
        if (a.cutOff) {
          ctx.strokeStyle = "rgba(240,90,80,0.9)";
          ctx.lineWidth = Math.max(1.2, cam2.scale * 0.11);
          ctx.setLineDash([Math.max(2, cam2.scale * 0.25), Math.max(2, cam2.scale * 0.2)]);
          ctx.beginPath();
          ctx.arc(ax, ay, cam2.scale * 0.9, 0, 6.283);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (a.holding) {
          ctx.strokeStyle = "rgba(250,240,205,0.75)";
          ctx.lineWidth = Math.max(1, cam2.scale * 0.08);
          ctx.beginPath();
          ctx.arc(ax, ay, cam2.scale * 0.72, 0, 6.283);
          ctx.stroke();
        }
        if (this.selectedHome !== null && a.home === this.selectedHome) {
          ctx.strokeStyle = "rgba(255,246,214,0.95)";
          ctx.lineWidth = Math.max(1.6, cam2.scale * 0.14);
          ctx.beginPath();
          ctx.arc(ax, ay, cam2.scale * 1.15, 0, 6.283);
          ctx.stroke();
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(1.2, cam2.scale * 0.09);
          ctx.beginPath();
          ctx.arc(ax, ay, cam2.scale * 1.45, 0, 6.283);
          ctx.stroke();
        }
        if (cam2.scale > 2.4) {
          const label = String(Math.round(a.troops));
          ctx.font = `${Math.max(9, Math.round(cam2.scale * 0.78))}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.lineWidth = Math.max(2, cam2.scale * 0.2);
          ctx.strokeStyle = "rgba(12,10,6,0.85)";
          ctx.strokeText(label, ax, ay - cam2.scale * 1.5);
          ctx.fillStyle = "#fdf6e4";
          ctx.fillText(label, ax, ay - cam2.scale * 1.5);
          ctx.textAlign = "start";
        }
      }
      for (const n of this.g.claimNodes) {
        const [nx, ny] = toScreen(n.tile);
        if (nx < -40 || ny < -40 || nx > this.canvas.width / dpr2 + 40 || ny > this.canvas.height / dpr2 + 40) continue;
        const col = this.g.players[n.owner]?.color ?? "#f3ead0";
        const k = Math.max(0.6, cam2.scale / 6);
        ctx.save();
        ctx.globalAlpha = n.done ? 0.5 : 0.95;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, 1.1 * k);
        ctx.beginPath();
        ctx.arc(nx, ny, 4.2 * k, 0, 6.283);
        ctx.stroke();
        if (!n.done) {
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(nx, ny, 2.1 * k, 0, 6.283);
          ctx.fillStyle = col;
          ctx.fill();
        }
        ctx.restore();
      }
      for (const s of this.g.structs.values()) {
        const [sx, sy] = toScreen(s.tile);
        if (sx < -60 || sy < -60 || sx > this.canvas.width / dpr2 + 60 || sy > this.canvas.height / dpr2 + 60) continue;
        this.drawStructure(ctx, s, sx, sy, cam2.scale);
      }
      const nowMs = Date.now();
      if (this.swirlTile >= 0 && nowMs < this.swirlFrom + 5200) {
        const [wx, wy] = toScreen(this.swirlTile);
        const me = this.g.players[this.g.human];
        const col = me?.color ?? "#e9ddb8";
        const since = (nowMs - this.swirlFrom + 2200) / 1e3;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let ring = 0; ring < 3; ring++) {
          const phase = ((since * 0.55 + ring * 0.33) % 1 + 1) % 1;
          const r = (6 + phase * 74) * Math.max(0.55, cam2.scale * 0.5);
          ctx.globalAlpha = (1 - phase) * 0.55;
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(1.5, cam2.scale * 0.5 * (1 - phase));
          ctx.beginPath();
          ctx.arc(wx, wy, r, 0, Math.PI * 1.65);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.2, cam2.scale * 0.22);
        const arms = 3;
        for (let i = 0; i < arms; i++) {
          const a0 = since * 1.6 + i * Math.PI * 2 / arms;
          ctx.beginPath();
          ctx.arc(wx, wy, 42 * Math.max(0.55, cam2.scale * 0.5), a0, a0 + 0.9);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (hover2 >= 0) {
        const [hx, hy] = toScreen(hover2);
        const me = this.g.players[this.g.human];
        const size = Math.max(6, cam2.scale * 1.1);
        let col = "rgba(255,255,255,0.5)";
        if (me && this.g.phase === "playing") {
          if (buildKind2) col = this.g.canBuild(me, buildKind2, hover2) ? "rgba(140,230,140,0.85)" : "rgba(230,120,120,0.8)";
          else col = this.g.canAttack(me, hover2) ? "rgba(255,225,140,0.95)" : "rgba(255,255,255,0.35)";
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.strokeRect(hx - size / 2, hy - size / 2, size, size);
      }
    }
    drawStructure(ctx, s, x, y, scale) {
      const col = PALETTE[s.owner % PALETTE.length];
      const k = Math.max(0.6, Math.min(2.4, scale / 3.2));
      if (s.kind === "castle") {
        const w2 = 7.5 * k;
        const wallH = 7 * k;
        const turretW = 3.4 * k;
        const turretH = 11 * k;
        const stroke = Math.max(1, 1 * k);
        ctx.lineWidth = stroke;
        ctx.strokeStyle = "#191309";
        const turret = (cx) => {
          ctx.fillStyle = shade(col, 0.38);
          ctx.beginPath();
          ctx.rect(cx - turretW / 2, y - turretH * 0.5, turretW, turretH * 0.72);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = shade(col, 0.52);
          const n = 2;
          const tw = turretW / (n * 2 - 1);
          for (let i = 0; i < n; i++) {
            ctx.fillRect(cx - turretW / 2 + i * tw * 2, y - turretH * 0.5 - 1.9 * k, tw, 1.9 * k);
          }
        };
        turret(x - w2 + turretW / 2);
        turret(x + w2 - turretW / 2);
        ctx.fillStyle = shade(col, 0.46);
        ctx.beginPath();
        ctx.rect(x - w2 + turretW * 0.7, y - wallH * 0.18, w2 * 2 - turretW * 1.4, wallH * 0.66);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = shade(col, 0.6);
        const merlons = 3;
        const mw = (w2 * 2 - turretW * 1.4) / (merlons * 2 - 1);
        for (let i = 0; i < merlons; i++) {
          ctx.fillRect(x - w2 + turretW * 0.7 + i * mw * 2, y - wallH * 0.18 - 1.5 * k, mw, 1.5 * k);
        }
        ctx.fillStyle = "#241c12";
        ctx.beginPath();
        ctx.moveTo(x - 1.9 * k, y + wallH * 0.48);
        ctx.lineTo(x - 1.9 * k, y + wallH * 0.06);
        ctx.quadraticCurveTo(x, y - 1.4 * k, x + 1.9 * k, y + wallH * 0.06);
        ctx.lineTo(x + 1.9 * k, y + wallH * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#2a2118";
        ctx.lineWidth = Math.max(1, 0.9 * k);
        ctx.beginPath();
        ctx.moveTo(x, y - wallH * 0.18);
        ctx.lineTo(x, y - wallH * 1.15);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, y - wallH * 1.15);
        ctx.lineTo(x + 5 * k, y - wallH * 0.98);
        ctx.lineTo(x, y - wallH * 0.72);
        ctx.closePath();
        ctx.fill();
        if (s.level > 1) {
          ctx.fillStyle = "#f6e7c1";
          for (let i = 0; i < Math.min(8, s.level); i++) {
            ctx.fillRect(x - 4 * k + i * 1.6 * k, y + wallH * 0.62, 1.2 * k, 1.2 * k);
          }
        }
      } else if (s.kind === "camp") {
        const r = 6.5 * k;
        ctx.strokeStyle = "#2a2015";
        ctx.lineWidth = Math.max(1, 0.9 * k);
        ctx.fillStyle = shade(col, 0.34);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.283);
        ctx.fill();
        ctx.stroke();
        const stakes = 9;
        ctx.strokeStyle = shade(col, 0.86);
        ctx.lineWidth = Math.max(1, 0.8 * k);
        for (let i = 0; i < stakes; i++) {
          const ang = i / stakes * 6.283;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(ang) * r * 0.72, y + Math.sin(ang) * r * 0.72);
          ctx.lineTo(x + Math.cos(ang) * r * 1.22, y + Math.sin(ang) * r * 1.22);
          ctx.stroke();
        }
        ctx.strokeStyle = "#231a10";
        ctx.lineWidth = Math.max(1, 0.85 * k);
        ctx.beginPath();
        ctx.moveTo(x, y + r * 0.6);
        ctx.lineTo(x, y - r * 1.25);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.25);
        ctx.lineTo(x + r * 0.85, y - r * 0.95);
        ctx.lineTo(x, y - r * 0.6);
        ctx.closePath();
        ctx.fill();
      } else if (s.kind === "bridge") {
        const half = 6.2 * k;
        ctx.strokeStyle = "#2a2015";
        ctx.lineWidth = Math.max(2.2, 1.5 * k);
        ctx.beginPath();
        ctx.moveTo(x - half, y);
        ctx.lineTo(x + half, y);
        ctx.stroke();
        ctx.strokeStyle = shade("#9a7648", 1.15);
        ctx.lineWidth = Math.max(1.4, 0.95 * k);
        for (let i = -3; i <= 3; i++) {
          const px = x + i / 3 * half;
          ctx.beginPath();
          ctx.moveTo(px, y - half * 0.42);
          ctx.lineTo(px, y + half * 0.42);
          ctx.stroke();
        }
        ctx.strokeStyle = "#6d5230";
        ctx.lineWidth = Math.max(1, 0.7 * k);
        ctx.beginPath();
        ctx.moveTo(x - half, y - half * 0.34);
        ctx.lineTo(x + half, y - half * 0.34);
        ctx.moveTo(x - half, y + half * 0.34);
        ctx.lineTo(x + half, y + half * 0.34);
        ctx.stroke();
      } else if (s.kind === "tower") {
        ctx.fillStyle = shade(col, 0.4);
        ctx.strokeStyle = "#1c1710";
        ctx.lineWidth = Math.max(1, 1 * k);
        ctx.beginPath();
        ctx.rect(x - 2.2 * k, y - 6 * k, 4.4 * k, 10 * k);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = shade(col, 0.62);
        ctx.beginPath();
        ctx.moveTo(x - 3.6 * k, y - 6 * k);
        ctx.lineTo(x, y - 12.5 * k);
        ctx.lineTo(x + 3.6 * k, y - 6 * k);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (s.kind === "farm") {
        ctx.fillStyle = "#8d7a3f";
        ctx.fillRect(x - 5 * k, y - 3.5 * k, 10 * k, 7 * k);
        ctx.strokeStyle = "#4b3d1c";
        ctx.lineWidth = Math.max(1, 0.8 * k);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x - 4.4 * k, y - 2.2 * k + i * 2.2 * k);
          ctx.lineTo(x + 4.4 * k, y - 2.2 * k + i * 2.2 * k);
          ctx.stroke();
        }
        ctx.fillStyle = shade(col, 1.15);
        ctx.fillRect(x - 5 * k, y - 3.5 * k, 10 * k, 1.2 * k);
      } else if (s.kind === "lumber") {
        ctx.fillStyle = shade(col, 0.5);
        ctx.strokeStyle = "#241a10";
        ctx.lineWidth = Math.max(1, 0.9 * k);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.rect(x - 5 * k, y + (i - 1) * 2.4 * k, 8 * k, 1.9 * k);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = "#c8a86a";
        ctx.beginPath();
        ctx.arc(x + 4.2 * k, y, 1.7 * k, 0, 6.283);
        ctx.fill();
        ctx.stroke();
      } else if (s.kind === "mine") {
        ctx.fillStyle = "#2b2620";
        ctx.beginPath();
        ctx.arc(x, y + 2.4 * k, 2.6 * k, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = shade(col, 0.55);
        ctx.lineWidth = Math.max(1, 1.1 * k);
        ctx.beginPath();
        ctx.moveTo(x - 3.4 * k, y + 1.6 * k);
        ctx.lineTo(x, y - 6.2 * k);
        ctx.lineTo(x + 3.4 * k, y + 1.6 * k);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 1.8 * k, y - 2.6 * k);
        ctx.lineTo(x + 1.8 * k, y - 2.6 * k);
        ctx.stroke();
      } else if (s.kind === "market") {
        ctx.strokeStyle = "#3b2d1e";
        ctx.lineWidth = Math.max(1, 1 * k);
        ctx.beginPath();
        ctx.moveTo(x - 4.4 * k, y + 3.6 * k);
        ctx.lineTo(x - 4.4 * k, y - 2.4 * k);
        ctx.moveTo(x + 4.4 * k, y + 3.6 * k);
        ctx.lineTo(x + 4.4 * k, y - 2.4 * k);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? "#f0e2c0" : shade(col, 0.85);
          ctx.beginPath();
          ctx.moveTo(x - 5 * k + i * 2.5 * k, y - 2.4 * k);
          ctx.lineTo(x - 5 * k + (i + 1) * 2.5 * k, y - 2.4 * k);
          ctx.lineTo(x - 5 * k + (i + 1) * 2.5 * k, y - 5.2 * k);
          ctx.lineTo(x - 5 * k + i * 2.5 * k, y - 5.2 * k);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = "#4a3623";
        ctx.fillStyle = shade(col, 0.45);
        ctx.lineWidth = Math.max(1, 1.3 * k);
        ctx.beginPath();
        ctx.rect(x - 4.5 * k, y + 1.5 * k, 9 * k, 2.4 * k);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 3 * k, y + 2 * k);
        ctx.lineTo(x + 3.5 * k, y - 6.5 * k);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x + 4.2 * k, y - 7.2 * k, 1.8 * k, 0, 6.283);
        ctx.fill();
      }
    }
  };

  // src/net.ts
  var ENDPOINT = "https://lyra-01a6009e.base44.app/functions/realmsRelay";
  async function call(payload) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`relay ${res.status}`);
    return await res.json();
  }
  var postIntent = (code, player, tick, data) => call({ action: "post", code, player, tick, data });
  var pollIntents = (code, since) => call({ action: "poll", code, since });
  var postSnapshot = (code, tick, state, prune = false) => call({ action: "snap", code, tick, state, prune });
  var getSnapshot = (code) => call({ action: "view", code });
  var LOBBY = "https://lyra-01a6009e.base44.app/functions/realmsLobby";
  async function lobbyCall(payload) {
    const res = await fetch(LOBBY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`lobby ${res.status}`);
    return await res.json();
  }
  var createMatch = (seed2, client) => lobbyCall({ action: "create", seed: seed2, client });
  var currentMatch = (client) => lobbyCall({ action: "current", client });

  // src/faction.ts
  var COLORS = [
    "#c8443a",
    "#d98a2b",
    "#c9b437",
    "#5b9c46",
    "#3f9d8f",
    "#3d78c4",
    "#6c5bb5",
    "#b8508f"
  ];
  var SHIELD_NAMES = ["Heater", "Pointed", "Round"];
  var EMBLEM_NAMES = ["Cross", "Star", "Tower", "Chevron", "Waves", "Sun"];
  var KEY = "realms.faction";
  function loadFaction() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const f = JSON.parse(raw);
        if (f && typeof f.name === "string") return { ...defaultFaction(), ...f };
      }
    } catch {
    }
    return defaultFaction();
  }
  function saveFaction(f) {
    try {
      localStorage.setItem(KEY, JSON.stringify(f));
    } catch {
    }
  }
  function defaultFaction() {
    return {
      name: "Warden",
      color: COLORS[0],
      shield: 0,
      emblem: 0,
      field: "#1d2733",
      charge: "#e8d9a8"
    };
  }
  function shieldPath(ctx, s, kind) {
    ctx.beginPath();
    if (kind === 0) {
      ctx.moveTo(s * 0.18, s * 0.12);
      ctx.lineTo(s * 0.82, s * 0.12);
      ctx.lineTo(s * 0.82, s * 0.52);
      ctx.quadraticCurveTo(s * 0.82, s * 0.82, s * 0.5, s * 0.92);
      ctx.quadraticCurveTo(s * 0.18, s * 0.82, s * 0.18, s * 0.52);
      ctx.closePath();
    } else if (kind === 1) {
      ctx.moveTo(s * 0.5, s * 0.08);
      ctx.lineTo(s * 0.84, s * 0.26);
      ctx.lineTo(s * 0.84, s * 0.56);
      ctx.lineTo(s * 0.5, s * 0.94);
      ctx.lineTo(s * 0.16, s * 0.56);
      ctx.lineTo(s * 0.16, s * 0.26);
      ctx.closePath();
    } else {
      ctx.arc(s * 0.5, s * 0.48, s * 0.36, 0, Math.PI * 2);
    }
  }
  function emblemPath(ctx, s, kind) {
    const cx = s * 0.5;
    const cy = s * 0.46;
    ctx.beginPath();
    if (kind === 0) {
      ctx.rect(cx - s * 0.055, cy - s * 0.22, s * 0.11, s * 0.44);
      ctx.rect(cx - s * 0.2, cy - s * 0.055, s * 0.4, s * 0.11);
    } else if (kind === 1) {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.22 : s * 0.1;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (kind === 2) {
      ctx.rect(cx - s * 0.13, cy - s * 0.05, s * 0.26, s * 0.27);
      ctx.rect(cx - s * 0.18, cy - s * 0.17, s * 0.1, s * 0.12);
      ctx.rect(cx - s * 0.05, cy - s * 0.17, s * 0.1, s * 0.12);
      ctx.rect(cx + s * 0.08, cy - s * 0.17, s * 0.1, s * 0.12);
    } else if (kind === 3) {
      ctx.moveTo(cx - s * 0.2, cy + s * 0.14);
      ctx.lineTo(cx, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.2, cy + s * 0.14);
      ctx.lineTo(cx + s * 0.2, cy + s * 0.24);
      ctx.lineTo(cx, cy - s * 0.06);
      ctx.lineTo(cx - s * 0.2, cy + s * 0.24);
      ctx.closePath();
    } else if (kind === 4) {
      for (let row = 0; row < 3; row++) {
        const y = cy - s * 0.14 + row * s * 0.11;
        ctx.moveTo(cx - s * 0.22, y);
        for (let i = 0; i < 6; i++) {
          const x0 = cx - s * 0.22 + i * s * 0.44 / 6;
          ctx.quadraticCurveTo(x0 + s * 0.037, y - s * 0.05, x0 + s * 0.074, y);
        }
      }
    } else {
      ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.moveTo(cx + Math.cos(a) * s * 0.14, cy + Math.sin(a) * s * 0.14);
        ctx.lineTo(cx + Math.cos(a) * s * 0.23, cy + Math.sin(a) * s * 0.23);
      }
    }
  }
  function drawBadge(canvas2, f) {
    const s = canvas2.width;
    const ctx = canvas2.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    shieldPath(ctx, s, f.shield);
    ctx.fillStyle = f.field;
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.045);
    ctx.strokeStyle = f.color;
    ctx.stroke();
    ctx.clip();
    ctx.save();
    emblemPath(ctx, s, f.emblem);
    ctx.fillStyle = f.charge;
    ctx.fill();
    if (f.emblem === 4) {
      ctx.strokeStyle = f.charge;
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }
  function badgeDataUrl(f, size = 64) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    drawBadge(c, f);
    return c.toDataURL();
  }

  // src/lobby.ts
  function elt(tag, cls = "", text = "") {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1e3));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    return `${m}m ago`;
  }
  function openLobby(opts) {
    return new Promise((resolve) => {
      const faction = loadFaction();
      const wrap = elt("div", "lobby");
      const card = elt("div", "lobby-card");
      const head = elt("div", "lobby-head");
      head.append(elt("h1", "", "REALMS"));
      head.append(elt("p", "lobby-sub", "Build your banner, then choose a field."));
      card.append(head);
      const matchBox = elt("div", "lobby-match");
      const matchLabel = elt("div", "lobby-label", "MATCH");
      const matchLine = elt("div", "lobby-matchline");
      const matchActions = elt("div", "lobby-actions");
      matchBox.append(matchLabel, matchLine, matchActions);
      card.append(matchBox);
      const banner = elt("div", "lobby-banner");
      const big = elt("canvas", "lobby-badge");
      big.width = 160;
      big.height = 160;
      const right = elt("div", "lobby-fields");
      const nameRow = elt("label", "lobby-field");
      nameRow.append(elt("span", "", "NAME"));
      const nameInput = elt("input", "lobby-input");
      nameInput.value = faction.name;
      nameInput.maxLength = 18;
      nameRow.append(nameInput);
      right.append(nameRow);
      const colorRow = elt("div", "lobby-field");
      colorRow.append(elt("span", "", "COLOUR"));
      const swatches = elt("div", "swatches");
      COLORS.forEach((c) => {
        const b = elt("button", "swatch");
        b.style.background = c;
        b.dataset.color = c;
        b.addEventListener("click", () => {
          faction.color = c;
          paint();
        });
        swatches.append(b);
      });
      colorRow.append(swatches);
      right.append(colorRow);
      const shieldRow = elt("div", "lobby-field");
      shieldRow.append(elt("span", "", "SHIELD"));
      const shields = elt("div", "chips");
      SHIELD_NAMES.forEach((label, i) => {
        const b = elt("button", "chip", label);
        b.addEventListener("click", () => {
          faction.shield = i;
          paint();
        });
        shields.append(b);
      });
      shieldRow.append(shields);
      right.append(shieldRow);
      const emblemRow = elt("div", "lobby-field");
      emblemRow.append(elt("span", "", "CHARGE"));
      const emblems = elt("div", "chips");
      EMBLEM_NAMES.forEach((label, i) => {
        const b = elt("button", "chip", label);
        b.addEventListener("click", () => {
          faction.emblem = i;
          paint();
        });
        emblems.append(b);
      });
      emblemRow.append(emblems);
      right.append(emblemRow);
      banner.append(big, right);
      card.append(banner);
      const foot = elt("div", "lobby-foot");
      foot.append(elt("div", "lobby-hint", "Your banner is saved on this device."));
      card.append(foot);
      wrap.append(card);
      document.body.append(wrap);
      const paint = () => {
        drawBadge(big, faction);
        swatches.querySelectorAll(".swatch").forEach((b) => {
          b.classList.toggle("on", b.dataset.color === faction.color);
        });
        shields.querySelectorAll(".chip").forEach((b, i) => b.classList.toggle("on", i === faction.shield));
        emblems.querySelectorAll(".chip").forEach((b, i) => b.classList.toggle("on", i === faction.emblem));
      };
      nameInput.addEventListener("input", () => {
        faction.name = nameInput.value.trim() || "Warden";
      });
      const finish = (code, host, startedAt = Date.now()) => {
        faction.name = (nameInput.value.trim() || "Warden").slice(0, 18);
        saveFaction(faction);
        wrap.remove();
        resolve({ faction, code, host, startedAt });
      };
      const setLine = (code, sub) => {
        matchLine.innerHTML = "";
        matchLine.append(elt("b", "lobby-code", code));
        matchLine.append(elt("span", "lobby-sub", sub));
      };
      const addButton = (label, primary, onClick) => {
        const b = elt("button", primary ? "lobby-go" : "lobby-alt", label);
        b.addEventListener("click", onClick);
        matchActions.append(b);
        return b;
      };
      const busy = (b) => {
        b.disabled = true;
        b.dataset.label = b.textContent ?? "";
        b.textContent = "starting\u2026";
      };
      if (opts.inviteCode) {
        const known = (() => {
          try {
            const raw = localStorage.getItem("realms.faction");
            return !!raw;
          } catch {
            return false;
          }
        })();
        if (known) {
          finish(opts.inviteCode, false, Date.now() - 6e4);
          return;
        }
        setLine(opts.inviteCode, "you were invited to this match");
        addButton("JOIN MATCH", true, () => finish(opts.inviteCode, false, Date.now() - 6e4));
        paint();
        nameInput.focus();
        nameInput.select();
        return;
      }
      matchLine.append(elt("span", "lobby-sub", "looking for a live match\u2026"));
      paint();
      void currentMatch(opts.client).then((res) => {
        matchActions.innerHTML = "";
        const room = res.room;
        if (!room) {
          setLine("\u2014 none \u2014", "no match running right now");
          const b2 = addButton("START A MATCH", true, () => {
            busy(b2);
            void createMatch(opts.seed, opts.client).then((m) => finish(m.code, true)).catch(() => {
              b2.disabled = false;
              b2.textContent = "could not start \u2014 try again";
            });
          });
          return;
        }
        setLine(room.code, `live \xB7 started ${ago(room.ageMs ?? 0)}`);
        addButton("JOIN THIS MATCH", true, () => finish(room.code, Boolean(room.host), room.startedAt ?? Date.now()));
        const b = addButton("START A NEW MATCH", false, () => {
          busy(b);
          void createMatch(opts.seed, opts.client).then((m) => finish(m.code, true)).catch(() => {
            b.disabled = false;
            b.textContent = "could not start \u2014 try again";
          });
        });
      }).catch(() => {
        matchActions.innerHTML = "";
        setLine("\u2014 offline \u2014", "cannot reach matchmaking");
        const b = addButton("TRY AGAIN", true, () => location.reload());
        b.dataset.label = "TRY AGAIN";
      });
      paint();
      nameInput.focus();
      nameInput.select();
    });
  }

  // src/main.ts
  var params = new URLSearchParams(location.search);
  var seed = Number(params.get("seed") ?? 7) || 7;
  var roomParam = (params.get("room") ?? "").toUpperCase();
  var isHost = !roomParam;
  var isGuest = Boolean(roomParam);
  var roomCode = "";
  var localPlayer = isHost ? 0 : 1;
  var lastIntentAt = 0;
  var canvas = document.getElementById("map");
  var game = new Game(seed);
  var renderer = new Renderer(canvas, game);
  var el = (id) => document.getElementById(id);
  var statGrain = el("stat-grain");
  var statTimber = el("stat-timber");
  var statOre = el("stat-ore");
  var statGold = el("stat-gold");
  var statTroops = el("stat-troops");
  var statLand = el("stat-land");
  var statCastles = el("stat-castles");
  var statLords = el("stat-lords");
  var armyNote = el("army-note");
  var statEra = el("stat-era");
  var hostInfo = el("host-info");
  var pullBtn = el("pull-btn");
  var tierBtn = el("tier-btn");
  var warBtn = el("war-btn");
  var logEl = el("log");
  var spawnOverlay = el("spawn-overlay");
  var endOverlay = el("end-overlay");
  var endTitle = el("end-title");
  var endBody = el("end-body");
  var ratioInput = el("ratio");
  var ratioVal = el("ratio-val");
  var seedBadge = el("seed-badge");
  seedBadge.textContent = `seed ${seed}`;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var cam = { x: 0, y: 0, scale: 4 };
  var hover = -1;
  var buildKind = null;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }
  window.addEventListener("resize", resize);
  resize();
  function fitWorld() {
    const fit = Math.min(window.innerWidth / game.world.w, window.innerHeight / game.world.h);
    cam.scale = Math.max(1.2, fit);
    cam.x = (window.innerWidth - game.world.w * cam.scale) / 2;
    cam.y = (window.innerHeight - game.world.h * cam.scale) / 2;
  }
  fitWorld();
  function clampCamera() {
    const mw = game.world.w * cam.scale;
    const mh = game.world.h * cam.scale;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    cam.x = mw <= vw ? (vw - mw) / 2 : Math.min(0, Math.max(vw - mw, cam.x));
    cam.y = mh <= vh ? (vh - mh) / 2 : Math.min(0, Math.max(vh - mh, cam.y));
  }
  function screenToTile(px, py) {
    const x = Math.floor((px - cam.x) / cam.scale);
    const y = Math.floor((py - cam.y) / cam.scale);
    return game.tileAt(x, y);
  }
  var panning = false;
  var cameFromPan = false;
  var panStart = { x: 0, y: 0, cx: 0, cy: 0 };
  var spaceDown = false;
  var keys = {
    q: "castle",
    w: "farm",
    e: "lumber",
    r: "mine",
    t: "market",
    y: "tower",
    u: "siege"
  };
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") spaceDown = true;
    const k = e.key.toLowerCase();
    if (keys[k]) {
      buildKind = buildKind === keys[k] ? null : keys[k];
      syncBuildButtons();
      e.preventDefault();
    }
    if (e.key === "Escape") {
      if (buildKind) {
        buildKind = null;
        syncBuildButtons();
      } else if (selectedHome !== null) {
        select(null);
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") spaceDown = false;
  });
  var DOUBLE_MS = 340;
  var DOUBLE_PX = 26;
  var lastClick = { at: 0, x: 0, y: 0 };
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || spaceDown) {
      panning = true;
      cameFromPan = false;
      panStart = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
      return;
    }
    cameFromPan = false;
    const tile = screenToTile(e.clientX, e.clientY);
    hover = tile;
    if (game.phase === "spawn" || buildKind) {
      click(tile);
      return;
    }
    const now = performance.now();
    const near = Math.abs(e.clientX - lastClick.x) <= DOUBLE_PX && Math.abs(e.clientY - lastClick.y) <= DOUBLE_PX;
    if (now - lastClick.at <= DOUBLE_MS && near) {
      lastClick.at = 0;
      attack(tile);
    } else {
      lastClick.at = now;
      lastClick.x = e.clientX;
      lastClick.y = e.clientY;
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    hover = screenToTile(e.clientX, e.clientY);
    if (panning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) cameFromPan = true;
      cam.x = panStart.cx + dx;
      cam.y = panStart.cy + dy;
      clampCamera();
      return;
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    panning = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 16e-4);
      const next = Math.max(1.1, Math.min(26, cam.scale * factor));
      const wx = (e.clientX - cam.x) / cam.scale;
      const wy = (e.clientY - cam.y) / cam.scale;
      cam.scale = next;
      cam.x = e.clientX - wx * cam.scale;
      cam.y = e.clientY - wy * cam.scale;
      clampCamera();
    },
    { passive: false }
  );
  var selectedHome = null;
  function myArmyAt(tile) {
    const me = game.players[game.human];
    if (!me) return void 0;
    return game.armies.find(
      (a) => a.owner === me.id && (a.tile === tile || game.tileDistance(a.tile, tile) <= 1)
    );
  }
  function select(home) {
    selectedHome = home;
    renderer.setSelection(home);
    refreshHud();
  }
  function orderSelected(tile) {
    const me = game.players[game.human];
    if (!me || selectedHome === null) return false;
    if (isGuest) {
      void postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "armyMove", home: selectedHome, tile });
      return true;
    }
    return game.moveArmy(me, selectedHome, tile);
  }
  function raiseCamp() {
    const me = game.players[game.human];
    if (!me || selectedHome === null) {
      log("Pick one of your hosts first, then raise the camp.");
      return;
    }
    if (isGuest) {
      void postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "camp", home: selectedHome });
      return;
    }
    if (!game.establishCamp(me, selectedHome)) {
      log("A camp needs a host holding ground at least three tiles from its castle.");
    }
  }
  function pullBack() {
    const me = game.players[game.human];
    if (!me || selectedHome === null) {
      log("Pick one of your hosts first, then pull it back.");
      return;
    }
    if (isGuest) {
      void postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "pull", home: selectedHome });
      return;
    }
    if (!game.withdrawArmy(me, selectedHome)) log("That host is already home.");
  }
  function tierUp() {
    const me = game.players[game.human];
    if (!me || selectedHome === null) {
      log("Pick one of your hosts first, then drill it.");
      return;
    }
    if (isGuest) {
      void postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "tier", home: selectedHome });
      return;
    }
    if (!game.upgradeHost(me, selectedHome)) return;
    refreshHud();
  }
  function breakPeace() {
    const me = game.players[game.human];
    if (!me || isGuest) return;
    if (game.breakPeace(me)) refreshHud();
  }
  pullBtn.addEventListener("click", () => pullBack());
  warBtn.addEventListener("click", () => breakPeace());
  tierBtn.addEventListener("click", () => tierUp());
  function click(tile) {
    if (tile < 0) return;
    const me = game.players[game.human];
    if (game.phase === "spawn") {
      if (game.chooseStart(tile)) {
        spawnOverlay.classList.add("hidden");
        const [x, y] = [tile % game.world.w, tile / game.world.w | 0];
        cam.scale = 7;
        cam.x = window.innerWidth / 2 - x * cam.scale;
        cam.y = window.innerHeight / 2 - y * cam.scale;
        clampCamera();
        log(`Your castle stands. ${game.players.length - 1} rival lords have risen.`);
      }
      return;
    }
    if (!me) return;
    if (buildKind) {
      if (isGuest) {
        void postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "build", k: buildKind, tile });
        return;
      }
      if (!game.build(me, buildKind, tile)) {
        const why = game.blockReason(me, buildKind, tile);
        if (why) log(`Cannot build there: ${why}.`);
        else log(`Not enough resources for a ${STRUCTURE_LABEL[buildKind].toLowerCase()}.`);
      }
      return;
    }
    const mine = myArmyAt(tile);
    if (mine && mine.home !== selectedHome) {
      select(mine.home);
      return;
    }
    if (mine && mine.tile === tile) return;
    if (selectedHome !== null) {
      if (game.isOwnCity(me, tile)) {
        if (isGuest) {
          void postIntent(roomCode, localPlayer, Math.round(game.time * 10), {
            kind: "regroup",
            home: selectedHome,
            city: tile
          });
          return;
        }
        if (!game.orderToCity(me, selectedHome, tile)) log("That host cannot make for that city.");
        return;
      }
      if (!orderSelected(tile)) log("That host cannot march there.");
    }
  }
  function attack(tile) {
    const me = game.players[game.human];
    if (!me || game.phase !== "playing") return;
    const ratio = Number(ratioInput.value) / 100;
    if (isGuest) {
      void postIntent(roomCode, localPlayer, Math.round(game.time * 10), { kind: "order", tile, ratio });
      return;
    }
    if (selectedHome !== null) {
      if (orderSelected(tile)) return;
    }
    const ok = game.orderArmy(me, tile, ratio);
    if (!ok && game.ownerAt(tile) === me.id) log("That is already your ground.");
    else if (!ok && game.ownerAt(tile) === -1 && game.isLand(tile)) {
      log("Too far from your lands to plant a claim node.");
    }
  }
  ratioInput.addEventListener("input", () => {
    ratioVal.textContent = `${ratioInput.value}%`;
  });
  var BUILD_ORDER = ["castle", "farm", "lumber", "mine", "market", "tower", "camp", "bridge"];
  var BUILD_HINT = {
    farm: "plains",
    lumber: "forest",
    mine: "mountains",
    market: "coast"
  };
  function hotkeyFor(kind) {
    for (const [k, v] of Object.entries(keys)) if (v === kind) return k.toUpperCase();
    return "";
  }
  function fmtCost(cost) {
    const parts = [];
    if (cost.grain) parts.push(`<i class="r-grain">${cost.grain}gr</i>`);
    if (cost.timber) parts.push(`<i class="r-timber">${cost.timber}tm</i>`);
    if (cost.ore) parts.push(`<i class="r-ore">${cost.ore}or</i>`);
    if (cost.gold) parts.push(`<i class="r-gold">${cost.gold}au</i>`);
    return parts.join(" ");
  }
  var buildBarEl = el("build-bar");
  buildBarEl.innerHTML = "";
  for (const kind of BUILD_ORDER) {
    const b = document.createElement("button");
    b.dataset.kind = kind;
    const hint2 = BUILD_HINT[kind];
    b.innerHTML = `<span class="label">${STRUCTURE_LABEL[kind]}</span><span class="cost"></span>` + (hint2 ? `<span class="hint">${hint2}</span>` : "") + `<span class="key">${hotkeyFor(kind)}</span>`;
    buildBarEl.appendChild(b);
  }
  var buildButtons = [...document.querySelectorAll("#build-bar button")];
  for (const b of buildButtons) {
    b.addEventListener("click", () => {
      const kind = b.dataset.kind;
      if (kind === "camp") {
        raiseCamp();
        return;
      }
      buildKind = buildKind === kind ? null : kind;
      syncBuildButtons();
    });
  }
  function syncBuildButtons() {
    for (const b of buildButtons) {
      b.classList.toggle("active", b.dataset.kind === buildKind);
    }
  }
  function flow(stock, rate) {
    const sign = rate >= 0 ? "+" : "";
    return `${fmt(Math.max(0, stock))} ${sign}${rate.toFixed(2)}/s`;
  }
  function fmt(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
    return Math.floor(n).toString();
  }
  var shownMessages = 0;
  function drainWorldNews() {
    const msgs = game.messages;
    if (shownMessages > msgs.length) shownMessages = 0;
    for (let i = shownMessages; i < msgs.length; i++) {
      const entry = msgs[i];
      const text = typeof entry === "string" ? entry : entry?.text;
      if (text) log(text);
    }
    shownMessages = msgs.length;
  }
  function log(text) {
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = text;
    logEl.prepend(line);
    while (logEl.children.length > 6) logEl.lastElementChild.remove();
  }
  function costText(b) {
    const bits = [];
    if (b.grain) bits.push(`${Math.ceil(b.grain)} grain`);
    if (b.timber) bits.push(`${Math.ceil(b.timber)} timber`);
    if (b.ore) bits.push(`${Math.ceil(b.ore)} iron`);
    if (b.gold) bits.push(`${Math.ceil(b.gold)} gold`);
    return bits.join(" + ");
  }
  function refreshHud() {
    const me = game.players[game.human];
    if (!me) return;
    drainWorldNews();
    statGrain.textContent = flow(me.grain, me.rates.grain);
    statTimber.textContent = flow(me.timber, me.rates.timber);
    statOre.textContent = flow(me.ore, me.rates.ore);
    statGold.textContent = flow(me.gold, me.rates.gold);
    statTroops.textContent = `${fmt(me.troops)} / ${fmt(game.capacity(me))}`;
    statLand.textContent = `${(game.landShare(me) * 100).toFixed(1)}%`;
    statCastles.textContent = `${me.castles}`;
    statTroops.classList.toggle("starving", me.starving);
    const alive = game.players.filter((p) => p.alive).length - 1;
    statLords.textContent = `${alive}`;
    if (statEra) {
      if (game.era === "war") {
        statEra.textContent = "WAR";
        statEra.classList.add("short");
      } else {
        statEra.textContent = `Peace \xB7 yr ${game.year + 1} of ${PEACE_YEARS}`;
        statEra.classList.remove("short");
      }
      if (warBtn) warBtn.classList.toggle("hidden", game.era !== "peace" || isGuest);
    }
    if (hostInfo) {
      const host = selectedHome === null ? void 0 : game.armies.find((a) => a.owner === me.id && a.home === selectedHome);
      if (!host) {
        hostInfo.textContent = "No host picked";
        pullBtn.disabled = true;
        tierBtn.disabled = true;
      } else {
        const label = TIER_NAME[host.tier] ?? "Levy";
        const state = host.routed ? "routed" : host.pulling ? "pulling back" : host.regrouping ? "making for a city" : host.holding ? game.isOwnCity(me, host.tile) ? "garrisoned" : "holding" : "on the march";
        hostInfo.textContent = `${label} \xB7 ${fmt(host.troops)} men \xB7 ${state} \xB7 supply ${host.supply * 100 | 0}%`;
        pullBtn.disabled = host.tile === host.home;
        tierBtn.disabled = host.tier >= 3;
      }
    }
    if (armyNote) {
      const castle = [...game.structs.values()].find((s) => s.owner === me.id && s.kind === "castle");
      if (castle) {
        const cap = ARMY_CAP(castle.level);
        const kit = game.scaleCost(PRICE.perMan, cap);
        const short = !game.canAfford(me, kit);
        armyNote.textContent = `Next host: ${cap} men for ${costText(kit)}${short ? " (short)" : ""}`;
        armyNote.classList.toggle("short", short);
      } else {
        armyNote.textContent = "No castle: raise one to field a host.";
      }
    }
    for (const b of buildButtons) {
      const kind = b.dataset.kind;
      const cost = game.buildCost(kind, 1);
      b.classList.toggle("poor", !game.canAfford(me, cost));
      const costEl = b.querySelector(".cost");
      if (costEl) costEl.innerHTML = fmtCost(cost);
      b.classList.toggle("active", buildKind === kind);
    }
    if (game.phase === "over" && endOverlay.classList.contains("hidden")) {
      const won = game.winner === game.human;
      const rivals = game.players.filter((p) => p.id !== game.human && p.isBot).length;
      endTitle.textContent = won ? "Last realm standing" : "Your line has fallen";
      endBody.textContent = won ? `Every rival broke. You hold ${(game.landShare(me) * 100).toFixed(1)}% of the land with ${me.castles} castles flying your banner.` : `A rival took 80% of your ground, so the rest went over with the crown. ${rivals} lords still hold the field.`;
      endOverlay.classList.remove("hidden");
    }
  }
  el("new-world").addEventListener("click", () => {
    location.href = `?seed=${seed + 1}`;
  });
  var lastHud = 0;
  var last = performance.now();
  var STEP = 0.1;
  var SPEED_PARAM = Number(new URLSearchParams(location.search).get("speed"));
  var GAME_SPEED = Number.isFinite(SPEED_PARAM) && SPEED_PARAM > 0 ? SPEED_PARAM : 0.5;
  var simAcc = 0;
  var lastWall = performance.now();
  var lastPostAt = 0;
  var posts = 0;
  var pollInFlight = false;
  function advance() {
    const now = performance.now();
    let dt = (now - lastWall) / 1e3;
    lastWall = now;
    if (dt < 0) dt = 0;
    if (dt > 2) dt = 2;
    simAcc += dt * GAME_SPEED;
    const started = Date.now() >= playFrom;
    let steps = 0;
    while (simAcc >= STEP && steps < 24) {
      if (!isGuest && started) game.tick(STEP);
      simAcc -= STEP;
      steps++;
    }
    if (simAcc > STEP * 24) simAcc = 0;
    if (isHost && roomCode && started && now - lastPostAt > 700) {
      lastPostAt = now;
      posts++;
      void postSnapshot(roomCode, Math.round(game.time * 10), game.snapshot(), posts % 8 === 0).catch(() => {
      });
    }
    updateCountdown(now);
  }
  function frame(now) {
    advance();
    renderer.draw(cam, hover, buildKind, dpr);
    if (now - lastHud > 120) {
      lastHud = now;
      refreshHud();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  try {
    const src = "let t;onmessage=(e)=>{if(e.data==='go'){clearInterval(t);t=setInterval(()=>postMessage(1),100);}};";
    const ticker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    ticker.onmessage = () => {
      advance();
      if (document.hidden) refreshHud();
    };
    ticker.postMessage("go");
  } catch {
    window.setInterval(advance, 200);
  }
  async function copyText(text, target, done = "Copied") {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (!target.dataset.label) target.dataset.label = target.textContent ?? "";
    target.textContent = ok ? done : "Press Ctrl+C";
    target.classList.add("copied");
    window.setTimeout(() => {
      target.textContent = target.dataset.label ?? "";
      target.classList.remove("copied");
    }, 1800);
  }
  function showNetbar(html) {
    let bar = document.getElementById("netbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "netbar";
      document.body.appendChild(bar);
    }
    bar.innerHTML = html;
  }
  async function boot() {
    let clientId = "";
    try {
      clientId = localStorage.getItem("realms.client") ?? "";
      if (!clientId) {
        clientId = `c${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("realms.client", clientId);
      }
    } catch {
      clientId = `c${Math.random().toString(36).slice(2, 10)}`;
    }
    const choice = await openLobby({ seed, client: clientId, inviteCode: roomParam });
    const faction = choice.faction;
    const matchCode = choice.code;
    const host = choice.host;
    isHost = host;
    isGuest = !host;
    roomCode = matchCode;
    localPlayer = isHost ? 0 : 1;
    try {
      const here = new URL(location.href);
      here.searchParams.set("seed", String(seed));
      here.searchParams.set("room", matchCode);
      history.replaceState(null, "", here.toString());
    } catch {
    }
    const link = `${location.origin}${location.pathname}?seed=${seed}&room=${matchCode}`;
    game.startMultiplayer(2);
    game.human = localPlayer;
    spawnOverlay.classList.add("hidden");
    const mine = game.players[localPlayer];
    if (mine) {
      mine.name = faction.name;
      mine.color = faction.color;
    }
    if (isGuest) {
      void postIntent(roomCode, localPlayer, 0, {
        kind: "identity",
        name: faction.name,
        color: faction.color
      });
    }
    myName = faction.name;
    myFaction = { name: faction.name, color: faction.color };
    showIdentity(faction);
    for (const st of game.structs.values()) {
      if (st.owner !== localPlayer || st.kind !== "castle") continue;
      cam.scale = 7;
      cam.x = window.innerWidth / 2 - st.tile % game.world.w * cam.scale;
      cam.y = window.innerHeight / 2 - (st.tile / game.world.w | 0) * cam.scale;
      clampCamera();
      break;
    }
    playFrom = (choice.startedAt ?? Date.now()) + MATCH_DELAY_MS;
    for (const st of game.structs.values()) {
      if (st.owner === localPlayer && st.kind === "castle") {
        renderer.beginSwirl(st.tile, playFrom);
        break;
      }
    }
    showNetbar(
      isHost ? `Match <b>${roomCode}</b> \u2014 <button class="copy-link" id="copy-invite">Copy invite link</button>` : `Match <b>${roomCode}</b> \u2014 joined as ${faction.name}`
    );
    const inviteBtn = document.getElementById("copy-invite");
    if (inviteBtn) {
      inviteBtn.title = link;
      inviteBtn.addEventListener("click", () => void copyText(link, inviteBtn, "Link copied"));
    }
    window.setInterval(isHost ? hostTick : guestTick, isHost ? 250 : 400);
    window.setInterval(watchSync, 2e3);
    log(isHost ? `Match ${roomCode}. ${game.players.length - 1} rival lords are loose.` : `Joined match ${roomCode}.`);
  }
  function showIdentity(f) {
    const host = document.getElementById("you");
    if (!host) return;
    host.innerHTML = "";
    const img = document.createElement("img");
    img.src = badgeDataUrl(f, 40);
    img.alt = "";
    const name = document.createElement("span");
    name.className = "you-name";
    name.textContent = f.name;
    const tag = document.createElement("span");
    tag.className = "you-tag";
    tag.textContent = "YOU";
    tag.style.background = f.color;
    host.append(img, name, tag);
    host.title = `${f.name} \u2014 your realm`;
  }
  function hostTick() {
    void pollIntents(roomCode, lastIntentAt).then((res) => {
      for (const it of res.intents ?? []) {
        if (it.at > lastIntentAt) lastIntentAt = it.at;
        const p = game.players[it.player];
        if (!p || !p.alive) continue;
        if (it.data.kind === "identity") {
          if (typeof it.data.name === "string") p.name = String(it.data.name).slice(0, 18);
          if (typeof it.data.color === "string") p.color = String(it.data.color);
          continue;
        }
        if (it.data.kind === "order") game.orderArmy(p, it.data.tile, it.data.ratio ?? 0.3);
        else if (it.data.kind === "armyMove") game.moveArmy(p, it.data.home, it.data.tile);
        else if (it.data.kind === "camp") game.establishCamp(p, it.data.home);
        else if (it.data.kind === "pull") game.withdrawArmy(p, it.data.home);
        else if (it.data.kind === "tier") game.upgradeHost(p, it.data.home);
        else if (it.data.kind === "regroup") game.orderToCity(p, it.data.home, it.data.city);
        else if (it.data.kind === "build") game.build(p, it.data.k, it.data.tile);
      }
    }).catch(() => {
    });
    void postSnapshot(roomCode, Math.round(game.time * 10), game.snapshot()).catch(() => {
    });
  }
  var lastSnapshotAt = 0;
  var syncFailures = 0;
  var lastChangeAt = Date.now();
  var lastPayload = "";
  var joinedAt = Date.now();
  var myName = "";
  var playFrom = 0;
  var MATCH_DELAY_MS = 3e4;
  var countdownEl = null;
  var myFaction = null;
  var hasWorld = false;
  function guestTick() {
    if (pollInFlight) return;
    pollInFlight = true;
    void getSnapshot(roomCode).then((res) => {
      if (!res.state) return;
      if (res.state !== lastPayload) {
        lastPayload = res.state;
        lastChangeAt = Date.now();
      }
      try {
        game.applySnapshot(res.state);
        hasWorld = true;
        snapshotBroken = false;
      } catch {
        snapshotBroken = true;
        lastChangeAt = Date.now() - 4e4;
        return;
      }
      const slot = myName ? game.players.findIndex((pp) => pp.name === myName) : -1;
      game.human = slot >= 0 ? slot : localPlayer;
      lastSnapshotAt = Date.now();
    }).catch(() => {
      syncFailures++;
    }).finally(() => {
      pollInFlight = false;
    });
  }
  function becomeHost() {
    if (isHost) return;
    isHost = true;
    isGuest = false;
    localPlayer = 0;
    const mine0 = game.players[0];
    if (mine0 && myFaction) {
      mine0.name = myFaction.name;
      mine0.color = myFaction.color;
    }
    game.human = 0;
    myName = myFaction?.name ?? myName;
    document.getElementById("takeover")?.remove();
    lastChangeAt = Date.now();
    log("You took the world over. This match now runs from your side.");
  }
  function updateCountdown(_now) {
    const left = playFrom - Date.now();
    if (left <= 0) {
      if (countdownEl) {
        countdownEl.remove();
        countdownEl = null;
      }
      return;
    }
    if (!countdownEl) {
      countdownEl = document.createElement("div");
      countdownEl.id = "countdown";
      document.body.append(countdownEl);
    }
    countdownEl.textContent = String(Math.ceil(left / 1e3));
  }
  var myBuild = "";
  var newerBuild = "";
  var snapshotBroken = false;
  function showBuild() {
    let el2 = document.getElementById("build-stamp");
    if (!el2) {
      const bar = document.getElementById("netbar");
      if (!bar) return;
      el2 = document.createElement("span");
      el2.id = "build-stamp";
      el2.style.opacity = "0.55";
      el2.style.fontSize = "11px";
      bar.append(el2);
    }
    el2.textContent = newerBuild ? ` \xB7 build ${myBuild} \u2014 NEW BUILD, reload` : myBuild ? ` \xB7 build ${myBuild}` : "";
    el2.className = newerBuild ? "sync-bad" : "";
  }
  void fetch(`dist/version.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).then((v) => {
    myBuild = String(v.build ?? "");
    showBuild();
  }).catch(() => {
  });
  window.setInterval(() => {
    void fetch(`dist/version.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).then((v) => {
      const b = String(v.build ?? "");
      if (myBuild && b && b !== myBuild) {
        newerBuild = b;
        showBuild();
      }
    }).catch(() => {
    });
  }, 6e4);
  function watchSync() {
    const bar = document.getElementById("netbar");
    if (!bar) return;
    showBuild();
    let flag = document.getElementById("sync-flag");
    if (!flag) {
      flag = document.createElement("span");
      flag.id = "sync-flag";
      bar.append(flag);
    }
    if (snapshotBroken || newerBuild) {
      flag.textContent = "\xB7 RELOAD \u2014 your build is out of date";
      flag.className = "sync-bad";
      return;
    }
    if (isHost) {
      flag.textContent = "\xB7 hosting";
      flag.className = "sync-ok";
      return;
    }
    const silentFor = Date.now() - lastChangeAt;
    const graceFor = hasWorld ? 8e3 : 3e4;
    if (silentFor > graceFor) {
      flag.textContent = "\xB7 NOT SYNCED \u2014 host silent";
      flag.className = "sync-bad";
      if (!document.getElementById("takeover")) {
        const btn = document.createElement("button");
        btn.id = "takeover";
        btn.className = "copy-link";
        btn.textContent = hasWorld ? "Resume world" : "Take over world";
        btn.title = hasWorld ? "Carry on from the last saved moment of this match" : "Host this match from your side";
        btn.addEventListener("click", () => {
          if (hasWorld) log("Resumed from the last saved moment of this world.");
          becomeHost();
        });
        bar.append(btn);
      }
      return;
    }
    const stale = Date.now() - lastChangeAt > 6e3;
    if (stale) {
      flag.textContent = "\xB7 NOT SYNCED \u2014 waiting for the host";
      flag.className = "sync-bad";
    } else {
      flag.textContent = "\xB7 synced";
      flag.className = "sync-ok";
    }
  }
  void boot();
  window.__realms = {
    game,
    cam,
    renderer,
    clickTile: (t) => click(t),
    attackTile: (t) => attack(t),
    setBuild: (k) => {
      buildKind = k;
      syncBuildButtons();
    }
  };
  var hint = el("spawn-hint");
  if (hint) hint.textContent = "Click open land to plant your castle. Deep inland gives you room to grow.";
  log(`A new world. Seed ${seed}.`);
})();
