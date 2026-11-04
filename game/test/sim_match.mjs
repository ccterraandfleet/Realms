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
  const sample = [];
  for (let i = 0; i < raw.length; i += 37) sample.push(raw[i]);
  sample.sort((a, b) => a - b);
  const oceanLevel = sample[Math.floor(sample.length * 0.42)];
  const terrain = new Uint8Array(w * h);
  let landTiles = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      const e = raw[i];
      let t;
      if (e < oceanLevel) t = OCEAN;
      else if (e < oceanLevel + 0.035) t = SAND;
      else if (e > oceanLevel + 0.34) t = MOUNTAIN;
      else {
        const m = moist(x / w * 2.4, y / h * 2.4);
        t = m > 0.52 && e < oceanLevel + 0.24 ? FOREST : PLAINS;
      }
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
var ATTACK_TIME = 0.7;
var IMMUNITY = 20;
var SPAWN_RADIUS = 5;
var BOT_SPAWN_RADIUS = 4;
var Game = class {
  constructor(seed, w = 400, h = 260) {
    this.seed = seed;
    this.players = [];
    this.structs = /* @__PURE__ */ new Map();
    this.attacks = [];
    this.time = 0;
    this.phase = "spawn";
    this.winner = -1;
    /** Tiles whose ownership changed since the renderer last repainted. */
    this.dirty = /* @__PURE__ */ new Set();
    this.structDirty = true;
    this.messages = [];
    this.human = 0;
    this.nextAttackId = 1;
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
      let best2 = -1;
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
          best2 = t;
        }
        if (nearest > 55) break;
      }
      if (best2 < 0) continue;
      const p = this.addPlayer(
        LORD_NAMES[i % LORD_NAMES.length],
        PALETTE[(i + 1) % PALETTE.length],
        true
      );
      taken.push(best2);
      this.settle(p, best2, BOT_SPAWN_RADIUS, IMMUNITY);
    }
    this.note(`${this.players.length - 1} rival lords have taken the field.`);
  }
  /* ------------------------------------------------------------------ */
  /* War                                                                 */
  /* ------------------------------------------------------------------ */
  /** A tile may be attacked if it is land, unowned by the attacker, and
   *  touches the attacker's territory. */
  canAttack(p, t) {
    if (t < 0 || !this.isLand(t)) return false;
    if (this.owners[t] === p.id) return false;
    const owner = this.owners[t];
    if (owner >= 0 && this.players[owner].immune > 0) return false;
    for (const n of this.neighbors8(t)) {
      if (this.owners[n] === p.id) return true;
    }
    return false;
  }
  /** Cost in troops to take an unowned tile. */
  neutralDefense(t) {
    return DEFENSE[this.world.terrain[t]];
  }
  towerBonus(t, defender) {
    let bonus = 0;
    const { w, h } = this.world;
    const x = t % w;
    const y = t / w | 0;
    for (const s of this.structs.values()) {
      if (s.owner !== defender || s.kind !== "tower") continue;
      const sx = s.tile % w;
      const sy = s.tile / w | 0;
      if (Math.hypot(sx - x, sy - y) <= 18) bonus += 0.3;
    }
    if (this.structs.get(t)?.kind === "castle") bonus += 0.8;
    return bonus;
  }
  attack(p, target, ratio) {
    if (this.phase !== "playing" || !p.alive) return false;
    if (!this.canAttack(p, target)) return false;
    for (const a of this.attacks) {
      if (a.attacker === p.id && a.target === target) return false;
    }
    const share = Math.max(0.02, Math.min(1, ratio));
    const send = Math.floor(p.troops * share);
    if (send < 10) return false;
    p.troops -= send;
    let from = target;
    let best2 = Infinity;
    for (const n of this.neighbors8(target)) {
      if (this.owners[n] !== p.id) continue;
      const d = Math.abs(n % this.world.w - target % this.world.w);
      if (d < best2) {
        best2 = d;
        from = n;
      }
    }
    this.attacks.push({
      id: this.nextAttackId++,
      attacker: p.id,
      from,
      target,
      troops: send,
      progress: 0,
      duration: ATTACK_TIME
    });
    return true;
  }
  resolveAttack(a) {
    const p = this.players[a.attacker];
    if (!p.alive) return;
    const owner = this.owners[a.target];
    if (owner === a.attacker) return;
    if (owner >= 0) {
      const d = this.players[owner];
      if (d.immune > 0) {
        p.troops += a.troops;
        return;
      }
      const effective = d.troops * (1 + this.towerBonus(a.target, owner));
      if (effective > a.troops) {
        d.troops = Math.max(0, d.troops - a.troops * 0.8);
        p.troops += Math.floor(a.troops * 0.85);
        return;
      }
      d.troops = Math.max(0, d.troops - a.troops);
      this.capture(a.target, a.attacker);
      p.troops += Math.floor(a.troops * 0.35);
      return;
    }
    const need = this.neutralDefense(a.target);
    if (a.troops >= need) {
      this.capture(a.target, a.attacker);
      p.troops += a.troops - need;
    } else {
      p.troops += Math.floor(a.troops * 0.9);
    }
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
    for (let i = this.attacks.length - 1; i >= 0; i--) {
      const a = this.attacks[i];
      a.progress += dt;
      if (a.progress >= a.duration) {
        this.attacks.splice(i, 1);
        this.resolveAttack(a);
      }
    }
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
    const picks = Math.min(targets.length, 3);
    for (let k = 0; k < picks; k++) {
      const ratio = 0.12 + this.rng() * 0.18;
      this.attack(p, targets[k].t, ratio);
    }
  }
  /** Fraction of the world's land a player holds. */
  landShare(p) {
    return p.tileCount / Math.max(1, this.world.landTiles);
  }
};

// test/sim_match.ts
var g = new Game(7);
var start = -1;
var best = Infinity;
for (let i = 0; i < g.owners.length; i++) {
  if (!g.isLand(i) || g.owners[i] >= 0) continue;
  const x = i % g.world.w, y = i / g.world.w | 0;
  const d = Math.hypot(x - g.world.w / 2, y - g.world.h / 2);
  if (d < best) {
    best = d;
    start = i;
  }
}
g.chooseStart(start);
var me = g.players[g.human];
var t0 = performance.now();
var clicks = 0;
var frontier = () => {
  const out = [];
  for (const i of me.tiles) for (const n of g.neighbors8(i)) {
    if (!g.canAttack(me, n)) continue;
    const o = g.owners[n];
    out.push({ t: n, cost: o >= 0 ? g.players[o].troops * 0.4 : g.neutralDefense(n) });
  }
  out.sort((a, b) => a.cost - b.cost);
  return out;
};
for (let step = 0; step < 3600; step++) {
  g.tick(0.1);
  if (step % 3 === 0) {
    for (const c of frontier().slice(0, 3)) if (g.attack(me, c.t, 0.35)) clicks++;
    if (me.gold > g.buildCost("castle", 1) && me.tileCount % 40 === 0) {
      const free = [...me.tiles].find((t) => !g.structs.has(t));
      if (free !== void 0) g.build(me, "castle", free);
    }
  }
  if (g.phase === "over") break;
}
var ms = performance.now() - t0;
console.log(`sim 6min in ${ms.toFixed(0)}ms (${(ms / 3600).toFixed(3)}ms/tick)`);
console.log("phase", g.phase, "winner", g.winner, "tiles", me.tileCount, "share", (g.landShare(me) * 100).toFixed(1) + "%");
console.log("clicks", clicks, "troops", me.troops.toFixed(0), "/", g.capacity(me), "gold", me.gold.toFixed(0));
console.log("castles", me.castles, "structures", [...g.structs.values()].filter((s) => s.owner === 0).length);
var ranked = [...g.players].sort((a, b) => b.tileCount - a.tileCount).slice(0, 4).map((p) => `${p.name}:${p.tileCount}`).join("  ");
console.log("standings:", ranked);
console.log("eliminated", g.players.filter((p) => !p.alive).length, "of", g.players.length);
