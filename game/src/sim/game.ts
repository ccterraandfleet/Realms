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

export interface Attack {
  id: number;
  attacker: number;
  from: number;
  target: number;
  troops: number;
  progress: number;
  duration: number;
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

const ATTACK_TIME = 0.7;      // seconds for an army to cross to the target tile
const IMMUNITY = 20;          // seconds of protection after choosing a start
const SPAWN_RADIUS = 5;       // starting holding radius, in tiles
const BOT_SPAWN_RADIUS = 4;

export class Game {
  world: World;
  owners: Int16Array;
  players: Player[] = [];
  structs = new Map<number, Structure>();
  attacks: Attack[] = [];
  time = 0;
  phase: Phase = "spawn";
  winner = -1;
  /** Tiles whose ownership changed since the renderer last repainted. */
  dirty = new Set<number>();
  structDirty = true;
  messages: { t: number; text: string }[] = [];
  human = 0;
  private nextAttackId = 1;
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
  /* War                                                                 */
  /* ------------------------------------------------------------------ */

  /** A tile may be attacked if it is land, unowned by the attacker, and
   *  touches the attacker's territory. */
  canAttack(p: Player, t: number): boolean {
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
  neutralDefense(t: number): number {
    return DEFENSE[this.world.terrain[t]];
  }

  private towerBonus(t: number, defender: number): number {
    let bonus = 0;
    const { w, h } = this.world;
    const x = t % w;
    const y = (t / w) | 0;
    for (const s of this.structs.values()) {
      if (s.owner !== defender || s.kind !== "tower") continue;
      const sx = s.tile % w;
      const sy = (s.tile / w) | 0;
      if (Math.hypot(sx - x, sy - y) <= 18) bonus += 0.3;
    }
    if (this.structs.get(t)?.kind === "castle") bonus += 0.8;
    return bonus;
  }

  attack(p: Player, target: number, ratio: number): boolean {
    if (this.phase !== "playing" || !p.alive) return false;
    if (!this.canAttack(p, target)) return false;
    // One army per target: without this, holding a click drains the whole
    // muster into the same tile and the extra troops vanish into the void.
    for (const a of this.attacks) {
      if (a.attacker === p.id && a.target === target) return false;
    }
    const share = Math.max(0.02, Math.min(1, ratio));
    const send = Math.floor(p.troops * share);
    if (send < 10) return false;
    p.troops -= send;
    // Launch from the nearest owned tile so the marching column reads right.
    let from = target;
    let best = Infinity;
    for (const n of this.neighbors8(target)) {
      if (this.owners[n] !== p.id) continue;
      const d = Math.abs((n % this.world.w) - (target % this.world.w));
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
      duration: ATTACK_TIME,
    });
    return true;
  }

  private resolveAttack(a: Attack) {
    const p = this.players[a.attacker];
    if (!p.alive) return;
    const owner = this.owners[a.target];
    if (owner === a.attacker) return;
    if (owner >= 0) {
      const d = this.players[owner];
      if (d.immune > 0) {
        p.troops += a.troops; // bounced off spawn protection
        return;
      }
      // Towers and a castle on the tile make the defender hit harder.
      const effective = d.troops * (1 + this.towerBonus(a.target, owner));
      if (effective > a.troops) {
        // Repelled: the defender pays in blood, the survivors fall back.
        d.troops = Math.max(0, d.troops - a.troops * 0.8);
        p.troops += Math.floor(a.troops * 0.85);
        return;
      }
      d.troops = Math.max(0, d.troops - a.troops);
      this.capture(a.target, a.attacker);
      p.troops += Math.floor(a.troops * 0.35);
      return;
    }
    // Unclaimed ground: a flat troop cost, no defenders to kill.
    const need = this.neutralDefense(a.target);
    if (a.troops >= need) {
      this.capture(a.target, a.attacker);
      // Survivors walk back into the muster field.
      p.troops += a.troops - need;
    } else {
      p.troops += Math.floor(a.troops * 0.9);
    }
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
      }
      p.gold += this.income(p) * dt;
    }

    // Armies on the march.
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
    const picks = Math.min(targets.length, 3);
    for (let k = 0; k < picks; k++) {
      const ratio = 0.12 + this.rng() * 0.18;
      this.attack(p, targets[k].t, ratio);
    }
  }

  /** Fraction of the world's land a player holds. */
  landShare(p: Player): number {
    return p.tileCount / Math.max(1, this.world.landTiles);
  }
}
