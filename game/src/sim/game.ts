/**
 * Realms simulation. UI-free on purpose: this module owns all game state and
 * rules, so the same code can run inside a browser for solo play today and on
 * a server for the one persistent world later.
 *
 * Mechanics mirror the reference game we studied: a pick-your-start spawn
 * phase, territory as a tile blob, expansion by attacking neighbouring tiles
 * with a share of your army, castles raising the ceiling on army size, gold
 * income from land and harbours, and rival lords doing all of it too.
 */

import { DENSITY, DEFENSE, OCEAN, World, generateWorld, idx, mulberry32 } from "./world";

export type StructureKind = "castle" | "tower" | "harbor" | "siege";

export interface Structure {
  kind: StructureKind;
  owner: number;
  tile: number;
  level: number;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  isBot: boolean;
  alive: boolean;
  gold: number;
  troops: number;
  tileCount: number;
  castles: number;
  immune: number;
  aiTimer: number;
  /** Running sum of DENSITY over owned tiles (keeps capacity O(1)). */
  density: number;
  /** The tiles this realm holds, for AI and border lookups. */
  tiles: Set<number>;
}

export interface Army {
  id: number;
  owner: number;
  /** Soldiers in this push. Speed and hitting power both come from here. */
  troops: number;
  /** Head of the push: the tile the army currently holds. */
  tile: number;
  /** Where the player clicked. The push drives inward toward it. */
  target: number;
  progress: number;
  /** Tiles this push has taken, for the client to draw its track. */
  taken: number;
  /** True when the land route home is severed. */
  cutOff: boolean;
  /** Tiles per second, recomputed from strength each tick. */
  speed: number;
  supplyTimer: number;
  /** Set when the army has reached its objective and is standing there. */
  holding: boolean;
  /** Seconds spent standing at the objective before it folds back into the host. */
  holdTimer: number;
}

export type Phase = "spawn" | "playing" | "over";

export const COSTS: Record<StructureKind, number> = {
  castle: 150,
  tower: 120,
  harbor: 200,
  siege: 400,
};

export const STRUCTURE_LABEL: Record<StructureKind, string> = {
  castle: "Castle",
  tower: "Watchtower",
  harbor: "Harbour",
  siege: "Siege Camp",
};

/** Heraldic colours, one per realm. */
export const PALETTE = [
  "#c0392b", // crimson
  "#2b6ca3", // royal blue
  "#3d7a3a", // forest green
  "#b8860b", // gold
  "#6c3d8f", // purple
  "#1f8f8f", // teal
  "#c26a1e", // burnt orange
  "#8f2d4a", // wine
  "#55606b", // slate
  "#7a6a3a", // olive
  "#4a5fa8", // indigo
  "#a0453a", // brick
];

const LORD_NAMES = [
  "Lord Aldric", "Baroness Vey", "Duke Marrow", "Lady Sable", "Lord Hesk",
  "Earl Bronn", "Baron Krell", "Lady Ostrand", "Lord Vane", "Duke Ferrow",
  "Countess Wren", "Lord Mallister", "Baron Thane", "Lady Corvane",
  "Lord Ashen", "Earl Dunmore",
];

const MAX_ARMIES_PER_PLAYER = 5;
const MAX_ARMIES = 90;
const HOLD_BEFORE_ABSORB = 8;  // seconds a column garrisons before folding back
const IMMUNITY = 20;          // seconds of protection after choosing a start
const SPAWN_RADIUS = 5;       // starting holding radius, in tiles
const BOT_SPAWN_RADIUS = 4;

export class Game {
  world: World;
  owners: Int16Array;
  players: Player[] = [];
  structs = new Map<number, Structure>();
  armies: Army[] = [];
  time = 0;
  phase: Phase = "spawn";
  winner = -1;
  /** Tiles whose ownership changed since the renderer last repainted. */
  dirty = new Set<number>();
  structDirty = true;
  messages: { t: number; text: string }[] = [];
  human = 0;
  private nextArmyId = 1;
  private rng: () => number;

  constructor(public seed: number, w = 400, h = 260) {
    this.world = generateWorld(seed, w, h);
    this.owners = new Int16Array(w * h).fill(-1);
    this.rng = mulberry32(seed ^ 0x9e3779b9);
  }

  private note(text: string) {
    this.messages.push({ t: this.time, text });
    if (this.messages.length > 60) this.messages.shift();
  }

  addPlayer(name: string, color: string, isBot: boolean): Player {
    const p: Player = {
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
      tiles: new Set<number>(),
    };
    this.players.push(p);
    return p;
  }

  /* ------------------------------------------------------------------ */
  /* World state helpers                                                 */
  /* ------------------------------------------------------------------ */

  terrainAt(t: number): number {
    return this.world.terrain[t];
  }

  ownerAt(t: number): number {
    return this.owners[t];
  }

  isLand(t: number): boolean {
    return this.world.terrain[t] !== OCEAN;
  }

  /** Tile index from world coordinates, or -1 when outside the map. */
  tileAt(x: number, y: number): number {
    const { w, h } = this.world;
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    return idx(w, x | 0, y | 0);
  }

  neighbors4(t: number): number[] {
    const { w, h } = this.world;
    const x = t % w;
    const y = (t / w) | 0;
    const out: number[] = [];
    if (x > 0) out.push(t - 1);
    if (x < w - 1) out.push(t + 1);
    if (y > 0) out.push(t - w);
    if (y < h - 1) out.push(t + w);
    return out;
  }

  neighbors8(t: number): number[] {
    const { w, h } = this.world;
    const x = t % w;
    const y = (t / w) | 0;
    const out: number[] = [];
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

  isCoastal(t: number): boolean {
    for (const n of this.neighbors4(t)) {
      if (this.world.terrain[n] === OCEAN) return true;
    }
    return false;
  }

  /** Army ceiling: the land you hold plus the castles that hold it. */
  capacity(p: Player): number {
    return Math.round(p.density * 1.15 + p.castles * 700);
  }

  income(p: Player): number {
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

  private claim(t: number, playerId: number) {
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
    // Borders are drawn from neighbouring differences, so repaint those too.
    for (const n of this.neighbors4(t)) this.dirty.add(n);
  }

  private relinquish(t: number) {
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
  private blob(center: number, radius: number): number[] {
    const out: number[] = [];
    const { w, h } = this.world;
    const cx = center % w;
    const cy = (center / w) | 0;
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
  chooseStart(tile: number): boolean {
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

  private settle(p: Player, tile: number, radius: number, immunity: number) {
    for (const t of this.blob(tile, radius)) this.claim(t, p.id);
    this.claim(tile, p.id);
    this.structs.set(tile, { kind: "castle", owner: p.id, tile, level: 1 });
    p.castles += 1;
    p.immune = immunity;
    p.troops = Math.round(this.capacity(p) * 0.5);
    this.structDirty = true;
  }

  private spawnLords() {
    const { w, h } = this.world;
    const count = 11;
    const taken: number[] = [];
    for (let i = 0; i < count; i++) {
      let best = -1;
      let bestScore = -1;
      for (let tries = 0; tries < 400; tries++) {
        const t = (this.rng() * (w * h)) | 0;
        if (this.world.terrain[t] === OCEAN || this.owners[t] >= 0) continue;
        const x = t % w;
        const y = (t / w) | 0;
        let nearest = Infinity;
        for (const s of taken) {
          const sx = s % w;
          const sy = (s / w) | 0;
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
        true,
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
  canAttack(p: Player, t: number): boolean {
    if (t < 0 || !this.isLand(t)) return false;
    if (this.owners[t] === p.id) return false;
    const owner = this.owners[t];
    if (owner >= 0 && this.players[owner].immune > 0) return false;
    return true;
  }

  /** Troops needed to walk over unclaimed ground (scouts, not soldiers). */
  neutralDefense(t: number): number {
    return DEFENSE[this.world.terrain[t]];
  }

  private towerBonus(t: number, defender: number): number {
    let bonus = 0;
    const { w } = this.world;
    const x = t % w;
    const y = (t / w) | 0;
    for (const s of this.structs.values()) {
      if (s.owner !== defender || s.kind !== "tower") continue;
      const sx = s.tile % w;
      const sy = (s.tile / w) | 0;
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
  lineStrength(p: Player): number {
    return Math.max(4, p.troops * 0.28);
  }

  /** Defence of a held tile: its share of the line, terrain, works, garrisons. */
  defenseAt(t: number, defender: number): number {
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

  private tileDistance(a: number, b: number): number {
    const { w } = this.world;
    const ax = a % w;
    const ay = (a / w) | 0;
    const bx = b % w;
    const by = (b / w) | 0;
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  /**
   * Click a point, and an army launches toward it and pushes inward from
   * there. Bigger detachments move faster and hit harder.
   */
  orderArmy(p: Player, target: number, ratio: number): boolean {
    if (this.phase !== "playing" || !p.alive) return false;
    if (!this.canAttack(p, target)) return false;
    const share = Math.max(0.05, Math.min(1, ratio));
    const send = Math.floor(p.troops * share);
    if (send < 12) return false;

    // Launch from the own tile closest to the objective.
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
    // A realm can only command so many columns at once; the rest of the host
    // stays on the line. Keeps the field readable and the sim cheap.
    const mine = this.armies.reduce((n, a) => n + (a.owner === p.id ? 1 : 0), 0);
    if (mine >= MAX_ARMIES_PER_PLAYER || this.armies.length >= MAX_ARMIES) return false;

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
      holdTimer: 0,
    });
    return true;
  }

  /** Stronger columns advance faster; rough ground slows them. */
  armySpeed(troops: number): number {
    return Math.max(0.45, Math.min(3.4, 0.5 + Math.sqrt(Math.max(1, troops)) * 0.035));
  }

  private armyTick(dt: number) {
    for (let i = this.armies.length - 1; i >= 0; i--) {
      const a = this.armies[i];
      const p = this.players[a.owner];
      if (!p.alive) {
        this.armies.splice(i, 1);
        continue;
      }

      // Supply check: can this column still trace a land route home?
      a.supplyTimer -= dt;
      if (a.supplyTimer <= 0) {
        a.supplyTimer = 0.35;
        const connected = this.traceHome(a);
        if (a.cutOff !== !connected) {
          a.cutOff = !connected;
          if (a.cutOff && !p.isBot) this.note("A push has been cut off from home.");
        }
      }

      // Cut off and surrounded: the column bleeds out fast and can be routed.
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
          // The objective is held; the survivors rejoin the host.
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
  private armyStep(a: Army, p: Player) {
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
      // Scouts survey the open edge, then the column files in behind them.
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
    // Battle for a held border tile.
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
      // The push is spent: survivors fall back or are destroyed.
      const defender = this.players[owner];
      defender.troops = Math.max(0, defender.troops - a.troops * 0.35);
      a.troops -= Math.min(a.troops, def * 0.8);
      a.holding = true;
      if (a.troops < 45) {
        const idx = this.armies.indexOf(a);
        if (idx >= 0) this.armies.splice(idx, 1);
        if (!p.isBot) this.note("A push has broken against the line.");
      }
    }
  }

  /** Next tile for a push: toward the objective, never onto own ground. */
  private nextTile(a: Army): number {
    let best = -1;
    let bestScore = Infinity;
    const curDist = this.tileDistance(a.tile, a.target);
    for (const n of this.neighbors8(a.tile)) {
      if (!this.isLand(n)) continue;
      if (this.owners[n] === a.owner) continue;
      const d = this.tileDistance(n, a.target);
      // Slight preference for continuing to advance over stalling in place.
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
  private traceHome(a: Army): boolean {
    const owner = a.owner;
    const p = this.players[owner];
    let hasCastle = false;
    for (const s of this.structs.values()) {
      if (s.owner === owner && s.kind === "castle") {
        hasCastle = true;
        break;
      }
    }
    const seen = new Set<number>([a.tile]);
    const queue = [a.tile];
    while (queue.length && seen.size < 1500) {
      const t = queue.pop()!;
      const s = this.structs.get(t);
      if (s && s.owner === owner && s.kind === "castle") return true;
      // Diagonal contact counts: a push that advances on the diagonal has not
      // cut itself off from home.
      for (const n of this.neighbors8(t)) {
        if (seen.has(n)) continue;
        if (!this.isLand(n)) continue;
        if (this.owners[n] !== owner) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    // A realm with no castle left has no anchor to trace to; in that case a
    // substantial connected body still counts as home ground.
    if (!hasCastle) return seen.size >= Math.min(25, Math.max(6, p.tileCount * 0.5));
    return false;
  }

  private capture(t: number, playerId: number) {
    const prev = this.owners[t];
    this.claim(t, playerId);
    // Structures change hands with the ground they stand on.
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

  buildCost(kind: StructureKind, level: number): number {
    return kind === "castle" ? COSTS.castle * level : COSTS[kind];
  }

  canBuild(p: Player, kind: StructureKind, t: number): boolean {
    if (this.phase !== "playing" || !p.alive) return false;
    if (t < 0 || this.owners[t] !== p.id) return false;
    const existing = this.structs.get(t);
    if (kind === "castle") {
      // Castle on empty ground, or an upgrade of an existing castle.
      if (existing?.kind === "castle") return existing.level < 8;
      return !existing;
    }
    if (existing) return false;
    if (kind === "harbor" && !this.isCoastal(t)) return false;
    return true;
  }

  build(p: Player, kind: StructureKind, t: number): boolean {
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

  private finish(winner: number) {
    if (this.phase === "over") return;
    this.phase = "over";
    this.winner = winner;
  }

  tick(dt: number) {
    if (this.phase === "spawn") return;
    this.time += dt;

    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.immune > 0) p.immune = Math.max(0, p.immune - dt);
      const cap = Math.max(1, this.capacity(p));
      if (p.troops < cap) {
        p.troops = Math.min(cap, p.troops + Math.max(1.5, (cap - p.troops) * 0.06) * dt);
      } else if (p.troops > cap) {
        // Columns folding back into a shrunken realm cannot bank a surplus.
        p.troops = cap;
      }
      p.gold += this.income(p) * dt;
    }

    // Columns on the march.
    this.armyTick(dt);

    for (const p of this.players) {
      if (p.isBot && p.alive) this.botThink(p, dt);
    }

    if (this.phase === "playing") {
      const human = this.players[this.human];
      if (human && human.tileCount > this.world.landTiles * 0.5) this.finish(this.human);
    }
  }

  private botThink(p: Player, dt: number) {
    p.aiTimer -= dt;
    if (p.aiTimer > 0) return;
    p.aiTimer = 0.5 + this.rng() * 0.9;

    // Spend gold: castles first, then the occasional tower.
    const castleReady =
      p.gold >= this.buildCost("castle", 1) && p.castles < 7 && this.rng() < 0.6;
    const own = [...p.tiles];
    if (castleReady && own.length) {
      this.build(p, "castle", own[(this.rng() * own.length) | 0]);
    } else if (p.gold >= COSTS.tower && this.rng() < 0.2 && own.length) {
      this.build(p, "tower", own[(this.rng() * own.length) | 0]);
    }

    // Move on the cheapest neighbouring ground.
    const targets: { t: number; cost: number }[] = [];
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
    // Lords push on the weakest stretch they can see, with one column.
    const pick = targets[Math.floor(this.rng() * Math.min(4, targets.length))];
    const ratio = 0.25 + this.rng() * 0.3;
    this.orderArmy(p, pick.t, ratio);
  }

  /** Fraction of the world's land a player holds. */
  landShare(p: Player): number {
    return p.tileCount / Math.max(1, this.world.landTiles);
  }
}
