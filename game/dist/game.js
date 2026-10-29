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
    return { w, h, terrain, landTiles, seed: seed2 };
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
    constructor(seed2, w = 400, h = 260) {
      this.seed = seed2;
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
      let best = Infinity;
      for (const n of this.neighbors8(target)) {
        if (this.owners[n] !== p.id) continue;
        const d = Math.abs(n % this.world.w - target % this.world.w);
        if (d < best) {
          best = d;
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
          const r = Math.min(255, base[0] * lift * slope);
          const gch = Math.min(255, base[1] * lift * slope);
          const b = Math.min(255, base[2] * lift * slope);
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
      for (const a of this.g.attacks) {
        const [ax, ay] = toScreen(a.from);
        const [bx, by] = toScreen(a.target);
        const col = PALETTE[a.attacker % PALETTE.length];
        ctx.strokeStyle = "rgba(20,16,10,0.35)";
        ctx.lineWidth = Math.max(1, cam2.scale * 0.22);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        const t = Math.min(1, a.progress / a.duration);
        const dots = Math.min(5, 2 + Math.floor(Math.log10(1 + a.troops)));
        for (let i = 0; i < dots; i++) {
          const f = Math.max(0, Math.min(1, t - i * 0.07));
          const px = ax + (bx - ax) * f;
          const py = ay + (by - ay) * f;
          ctx.fillStyle = i === 0 ? "#fbf3df" : col;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.1, cam2.scale * 0.15), 0, 6.283);
          ctx.fill();
        }
      }
      for (const s of this.g.structs.values()) {
        const [sx, sy] = toScreen(s.tile);
        if (sx < -60 || sy < -60 || sx > this.canvas.width / dpr2 + 60 || sy > this.canvas.height / dpr2 + 60) continue;
        this.drawStructure(ctx, s, sx, sy, cam2.scale);
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
      } else if (s.kind === "harbor") {
        ctx.strokeStyle = "#3b2d1e";
        ctx.lineWidth = Math.max(1, 1.2 * k);
        ctx.beginPath();
        ctx.moveTo(x, y + 3.5 * k);
        ctx.lineTo(x, y - 5 * k);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + 0.8 * k, y - 5 * k);
        ctx.lineTo(x + 5.5 * k, y - 1.6 * k);
        ctx.lineTo(x + 0.8 * k, y - 1.6 * k);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#6b5334";
        ctx.fillRect(x - 5 * k, y + 3.5 * k, 10 * k, 1.8 * k);
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

  // src/main.ts
  var params = new URLSearchParams(location.search);
  var seed = Number(params.get("seed") ?? 7) || 7;
  var canvas = document.getElementById("map");
  var game = new Game(seed);
  var renderer = new Renderer(canvas, game);
  var el = (id) => document.getElementById(id);
  var statGold = el("stat-gold");
  var statTroops = el("stat-troops");
  var statLand = el("stat-land");
  var statCastles = el("stat-castles");
  var statLords = el("stat-lords");
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
  var lastAttackAt = 0;
  var keys = {
    q: "castle",
    w: "tower",
    e: "harbor",
    r: "siege"
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
      buildKind = null;
      syncBuildButtons();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") spaceDown = false;
  });
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
    click(tile);
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
    if (e.buttons & 1) {
      const now = performance.now();
      if (now - lastAttackAt > 55) {
        lastAttackAt = now;
        if (!buildKind) attack(hover);
      }
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
      if (!game.build(me, buildKind, tile)) {
        const cost = game.buildCost(buildKind, 1);
        if (me.gold < cost) log(`Not enough gold for a ${STRUCTURE_LABEL[buildKind].toLowerCase()} (${cost}).`);
        else if (game.structs.has(tile)) log("Something already stands there.");
        else if (game.ownerAt(tile) !== me.id) log("You can only build on your own ground.");
      }
      return;
    }
    attack(tile);
  }
  function attack(tile) {
    const me = game.players[game.human];
    if (!me || game.phase !== "playing") return;
    game.attack(me, tile, Number(ratioInput.value) / 100);
  }
  ratioInput.addEventListener("input", () => {
    ratioVal.textContent = `${ratioInput.value}%`;
  });
  var buildButtons = [...document.querySelectorAll("#build-bar button")];
  for (const b of buildButtons) {
    b.addEventListener("click", () => {
      const kind = b.dataset.kind;
      buildKind = buildKind === kind ? null : kind;
      syncBuildButtons();
    });
  }
  function syncBuildButtons() {
    for (const b of buildButtons) {
      b.classList.toggle("active", b.dataset.kind === buildKind);
    }
  }
  function fmt(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
    return Math.floor(n).toString();
  }
  function log(text) {
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = text;
    logEl.prepend(line);
    while (logEl.children.length > 6) logEl.lastElementChild.remove();
  }
  function refreshHud() {
    const me = game.players[game.human];
    if (!me) return;
    statGold.textContent = fmt(me.gold);
    statTroops.textContent = `${fmt(me.troops)} / ${fmt(game.capacity(me))}`;
    statLand.textContent = `${(game.landShare(me) * 100).toFixed(1)}%`;
    statCastles.textContent = `${me.castles}`;
    const alive = game.players.filter((p) => p.alive).length - 1;
    statLords.textContent = `${alive}`;
    for (const b of buildButtons) {
      const kind = b.dataset.kind;
      const cost = game.buildCost(kind, 1);
      b.classList.toggle("poor", me.gold < cost);
      const costEl = b.querySelector(".cost");
      if (costEl) costEl.textContent = `${cost}g`;
    }
    if (game.phase === "over" && endOverlay.classList.contains("hidden")) {
      const won = game.winner === game.human;
      endTitle.textContent = won ? "The realm is yours" : "Your line has fallen";
      endBody.textContent = won ? `You hold ${(game.landShare(me) * 100).toFixed(1)}% of the land with ${me.castles} castles flying your banner.` : "Rival lords hold the field. Raise a new world and try again.";
      endOverlay.classList.remove("hidden");
    }
  }
  el("new-world").addEventListener("click", () => {
    location.href = `?seed=${seed + 1}`;
  });
  var lastHud = 0;
  var last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1e3);
    last = now;
    game.tick(dt);
    renderer.draw(cam, hover, buildKind, dpr);
    if (now - lastHud > 120) {
      lastHud = now;
      refreshHud();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
