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
  const e3 = makeNoise(rand, 29);
  const ridge = makeNoise(rand, 9);
  const moist = makeNoise(rand, 11);
  const grain = makeNoise(rand, 61);
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const ny = y / h;
      let e = 0.55 * e1(nx * 1.7, ny * 1.7) + 0.3 * e2(nx * 3.3, ny * 3.3) + 0.15 * e3(nx * 6.1, ny * 6.1);
      e += Math.max(0, 1 - Math.abs(ridge(nx * 2.2, ny * 2.2) * 2 - 1)) * 0.22;
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const d = Math.sqrt(dx * dx * 0.92 + dy * dy * 1.05);
      e -= smooth(Math.min(1, Math.max(0, (d - 0.52) / 0.62))) * 0.72;
      raw[idx(w, x, y)] = e;
    }
  }
  const all = Array.from(raw);
  const sorted = all.slice().sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  const oceanLevel = q(sorted, 0.42);
  const landElev = sorted.filter((e) => e >= oceanLevel);
  const sandCut = q(landElev, 0.055);
  const mountainCut = q(landElev, 0.84);
  const moisture = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      moisture[idx(w, x, y)] = moist(x / w * 2.4, y / h * 2.4);
    }
  }
  const wetLand = [];
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
      if (terrain[i] === PLAINS && grain(x / w * 3, y / h * 3) > 0.72) terrain[i] = FOREST;
    }
  }
  return { w, h, terrain, landTiles, seed };
}

// src/sim/game.ts
var COSTS = {
  castle: 150,
  tower: 120,
  harbor: 200,
  siege: 400
};
var STRUCTURE_LABEL = {
  castle: "Castle",
  tower: "Watchtower",
  harbor: "Harbour",
  siege: "Siege Camp"
};
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
var MAX_ARMIES_PER_PLAYER = 5;
var MAX_ARMIES = 90;
var HOLD_BEFORE_ABSORB = 8;
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
    /** Tiles whose ownership changed since the renderer last repainted. */
    this.dirty = /* @__PURE__ */ new Set();
    this.structDirty = true;
    this.messages = [];
    this.human = 0;
    this.nextArmyId = 1;
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
      troops: 0,
      tileCount: 0,
      castles: 0,
      immune: 0,
      aiTimer: 0,
      density: 0,
      tiles: /* @__PURE__ */ new Set()
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
  /** Army ceiling: the land you hold plus the castles that hold it. */
  capacity(p) {
    return Math.round(p.density * 1.15 + p.castles * 700);
  }
  income(p) {
    let harbors = 0;
    let siege = 0;
    for (const s of this.structs.values()) {
      if (s.owner !== p.id) continue;
      if (s.kind === "harbor") harbors++;
      if (s.kind === "siege") siege++;
    }
    return (1 + p.tileCount * 0.06) * 0.35 + harbors * 1.5 + siege * 0.4;
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
  settle(p, tile, radius, immunity) {
    for (const t of this.blob(tile, radius)) this.claim(t, p.id);
    this.claim(tile, p.id);
    this.structs.set(tile, { kind: "castle", owner: p.id, tile, level: 1 });
    p.castles += 1;
    p.immune = immunity;
    p.troops = Math.round(this.capacity(p) * 0.5);
    this.structDirty = true;
  }
  spawnLords() {
    const { w, h } = this.world;
    const count = 11;
    const taken = [];
    for (let i = 0; i < count; i++) {
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
        if (nearest > bestScore) {
          bestScore = nearest;
          best = t;
        }
        if (nearest > 55) break;
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
    const { w } = this.world;
    const ax = a % w;
    const ay = a / w | 0;
    const bx = b % w;
    const by = b / w | 0;
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }
  /**
   * Click a point, and an army launches toward it and pushes inward from
   * there. Bigger detachments move faster and hit harder.
   */
  orderArmy(p, target, ratio) {
    if (this.phase !== "playing" || !p.alive) return false;
    if (!this.canAttack(p, target)) return false;
    const share = Math.max(0.05, Math.min(1, ratio));
    const send = Math.floor(p.troops * share);
    if (send < 12) return false;
    let launch = -1;
    let bestD = Infinity;
    for (const t of p.tiles) {
      const d = this.tileDistance(t, target);
      if (d < bestD) {
        bestD = d;
        launch = t;
      }
    }
    if (launch < 0 || bestD > 40) return false;
    const mine = this.armies.reduce((n, a) => n + (a.owner === p.id ? 1 : 0), 0);
    if (mine >= MAX_ARMIES_PER_PLAYER || this.armies.length >= MAX_ARMIES) return false;
    for (const a of this.armies) {
      if (a.owner === p.id && a.target === target) return false;
    }
    p.troops -= send;
    this.armies.push({
      id: this.nextArmyId++,
      owner: p.id,
      troops: send,
      tile: launch,
      target,
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
        if (a.holdTimer >= HOLD_BEFORE_ABSORB) {
          p.troops += a.troops;
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
    return kind === "castle" ? COSTS.castle * level : COSTS[kind];
  }
  canBuild(p, kind, t) {
    if (this.phase !== "playing" || !p.alive) return false;
    if (t < 0 || this.owners[t] !== p.id) return false;
    const existing = this.structs.get(t);
    if (kind === "castle") {
      if (existing?.kind === "castle") return existing.level < 8;
      return !existing;
    }
    if (existing) return false;
    if (kind === "harbor" && !this.isCoastal(t)) return false;
    return true;
  }
  build(p, kind, t) {
    if (!this.canBuild(p, kind, t)) return false;
    const existing = this.structs.get(t);
    const level = existing?.kind === "castle" ? existing.level + 1 : 1;
    const cost = this.buildCost(kind, existing?.kind === "castle" ? level - 1 : 1);
    if (p.gold < cost) return false;
    p.gold -= cost;
    if (existing?.kind === "castle") {
      existing.level = level;
      p.castles += 1;
    } else {
      this.structs.set(t, { kind, owner: p.id, tile: t, level: 1 });
      if (kind === "castle") p.castles += 1;
    }
    this.structDirty = true;
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
      const cap = Math.max(1, this.capacity(p));
      if (p.troops < cap) {
        p.troops = Math.min(cap, p.troops + Math.max(1.5, (cap - p.troops) * 0.06) * dt);
      }
      p.gold += this.income(p) * dt;
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
    const castleReady = p.gold >= this.buildCost("castle", 1) && p.castles < 7 && this.rng() < 0.6;
    const own = [...p.tiles];
    if (castleReady && own.length) {
      this.build(p, "castle", own[this.rng() * own.length | 0]);
    } else if (p.gold >= COSTS.tower && this.rng() < 0.2 && own.length) {
      this.build(p, "tower", own[this.rng() * own.length | 0]);
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
};

// test/sim_battle.ts
function fresh() {
  const g = new Game(7);
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.owners.length; i++) {
    if (!g.isLand(i) || g.owners[i] >= 0) continue;
    const x = i % g.world.w, y = i / g.world.w | 0;
    const d = Math.hypot(x - g.world.w / 2, y - g.world.h / 2);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  g.chooseStart(best);
  return { g, me: g.players[g.human], start: best };
}
function borderRival(g, me) {
  const rival = g.players.find((p) => p.isBot);
  const edge = [...me.tiles].reduce((a, b) => b % g.world.w > a % g.world.w ? b : a);
  const x = edge % g.world.w, y = edge / g.world.w | 0;
  const tiles = [];
  for (let dx = 1; dx <= 6; dx++) {
    for (let dy = -6; dy <= 6; dy++) {
      const t = g.tileAt(x + dx, y + dy);
      if (t >= 0 && g.isLand(t) && g.ownerAt(t) < 0) tiles.push(t);
    }
  }
  for (const t of tiles) {
    g.owners[t] = rival.id;
    rival.tiles.add(t);
    rival.tileCount++;
    g.dirty.add(t);
  }
  const castleTile = tiles[Math.floor(tiles.length / 2)];
  g.structs.set(castleTile, { kind: "castle", owner: rival.id, tile: castleTile, level: 2 });
  rival.castles += 2;
  rival.immune = 0;
  return { rival, castleTile, size: tiles.length };
}
{
  const { g, me } = fresh();
  const { rival, castleTile } = borderRival(g, me);
  me.troops = 2e4;
  rival.troops = 1500;
  const target = castleTile;
  const defBefore = g.defenseAt(target, rival.id);
  console.log(`defended border tile: ${Math.round(defBefore)} troops to break (rival host ${Math.round(rival.troops)})`);
  const before = me.tileCount, rivalBefore = rival.tileCount;
  g.orderArmy(me, target, 0.9);
  const a = g.armies[0];
  console.log(`launched a push of ${Math.round(a.troops)} at a ${Math.round(defBefore)} defence`);
  for (let s = 0; s < 200; s++) g.tick(0.1);
  console.log(`strong push: mine ${before} -> ${me.tileCount}, rival ${rivalBefore} -> ${rival.tileCount}, castle owner now ${g.structs.get(target)?.owner === me.id ? "MINE" : "rival"}`);
}
{
  const { g, me } = fresh();
  const { rival, castleTile } = borderRival(g, me);
  me.troops = 400;
  rival.troops = 9e3;
  const target = castleTile;
  const def = g.defenseAt(target, rival.id);
  g.orderArmy(me, target, 0.9);
  const a = g.armies[0];
  const before = me.tileCount;
  for (let s = 0; s < 120; s++) g.tick(0.1);
  const gone = !g.armies.includes(a);
  console.log(`weak push of ${Math.round(a.troops)} vs ${Math.round(def)} defence: mine ${before} -> ${me.tileCount}, rival kept ${rival.tileCount}, push broken: ${gone || a.holding}`);
}
{
  const { g, me } = fresh();
  const { rival, castleTile } = borderRival(g, me);
  me.troops = 9e3;
  rival.troops = 300;
  g.orderArmy(me, castleTile, 0.7);
  const a = g.armies[0];
  for (let s = 0; s < 40; s++) g.tick(0.1);
  const ax = a.tile % g.world.w, ay = a.tile / g.world.w | 0;
  let severed = 0;
  for (let dx = -5; dx <= 5; dx++) {
    for (let dy = -5; dy <= 5; dy++) {
      const t = g.tileAt(ax + dx, ay + dy);
      if (t < 0 || g.ownerAt(t) !== me.id) continue;
      g.owners[t] = rival.id;
      me.tiles.delete(t);
      rival.tiles.add(t);
      me.tileCount--;
      rival.tileCount++;
      severed++;
      g.dirty.add(t);
    }
  }
  const t0 = a.troops;
  let routed = false;
  for (let s = 0; s < 80; s++) {
    g.tick(0.1);
    if (!g.armies.includes(a)) {
      routed = true;
      break;
    }
  }
  console.log(`surrounded by ${severed} hostile tiles: cutOff ${a.cutOff}, ${Math.round(t0)} -> ${Math.round(a.troops)} troops, routed: ${routed}`);
}
