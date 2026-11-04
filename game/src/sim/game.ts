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

import { DENSITY, DEFENSE, FOREST, MOUNTAIN, OCEAN, PLAINS, World, generateWorld, idx, mulberry32 } from "./world";

export type StructureKind =
  | "castle"
  | "farm"
  | "lumber"
  | "mine"
  | "market"
  | "tower"
  | "siege";

/** Index order used by compact netcode snapshots. */
export const STRUCT_ORDER: StructureKind[] = [
  "castle",
  "farm",
  "lumber",
  "mine",
  "market",
  "tower",
  "siege",
];

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
  grain: number;
  timber: number;
  ore: number;
  /** Soldiers in the host plus every column in the field. */
  soldiers: number;
  /** True when stores are empty and the army is bigger than the harvest. */
  starving: boolean;
  /** Gross grain per second, before the army eats. */
  grainProd: number;
  /** Net production per second, recomputed every tick. */
  rates: { grain: number; timber: number; ore: number; gold: number };
  troops: number;
  tileCount: number;
  castles: number;
  immune: number;
  aiTimer: number;
  /** Running sum of DENSITY over owned tiles (keeps capacity O(1)). */
  density: number;
  /** The tiles this realm holds, for AI and border lookups. */
  tiles: Set<number>;
  /** Fractional progress of the automatic border spread. */
  spreadAcc: number;
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

/**
 * Late-game economy. Every realm runs on four flows instead of one currency:
 * grain feeds soldiers, timber builds, iron arms, gold buys. Production is
 * bound to terrain, so who wins is decided by which ground you hold and what
 * you build on it, not by how fast you click.
 */
export interface Bundle {
  grain: number;
  timber: number;
  ore: number;
  gold: number;
}

export const BUILD: Record<StructureKind, Bundle> = {
  castle: { grain: 0, timber: 70, ore: 45, gold: 60 },
  farm: { grain: 0, timber: 45, ore: 0, gold: 10 },
  lumber: { grain: 35, timber: 0, ore: 0, gold: 10 },
  mine: { grain: 45, timber: 70, ore: 0, gold: 15 },
  market: { grain: 25, timber: 55, ore: 0, gold: 20 },
  tower: { grain: 0, timber: 55, ore: 25, gold: 30 },
  siege: { grain: 35, timber: 65, ore: 70, gold: 40 },
};

export const STRUCTURE_LABEL: Record<StructureKind, string> = {
  castle: "Castle",
  farm: "Farm",
  lumber: "Lumber Camp",
  mine: "Iron Mine",
  market: "Market",
  tower: "Watchtower",
  siege: "Siege Camp",
};

/** What each building pays out per second. */
export const YIELD: Partial<Record<StructureKind, Partial<Bundle>>> = {
  farm: { grain: 0.55 },
  lumber: { timber: 0.45 },
  mine: { ore: 0.32 },
  market: { gold: 0.5 },
};

/** Building is bound to ground: this is what makes terrain worth taking. */
export const TERRAIN_FOR: Partial<Record<StructureKind, number>> = {
  farm: PLAINS,
  lumber: FOREST,
  mine: MOUNTAIN,
};

/** Grain a soldier eats per second, in the host or in the field. */
export const UPKEEP_PER_TROOP = 0.001;
/** Share of the harvest a realm may commit to soldiers before it eats itself. */
export const FEED_SHARE = 0.8;
/** Iron spent per soldier who takes the field. Offensives run on iron. */
export const ORE_PER_TROOP = 0.004;
/** Field rations drawn from the granary when a column marches. */
export const RATIONS_PER_TROOP = 0.004;

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

const MIN_ARMIES_PER_PLAYER = 3;
const MAX_ARMIES_PER_PLAYER = 10;
const MAX_ARMIES = 220;
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
  /** Every seat taken so far, so spawns stay apart. */
  seats: number[] = [];
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
      tiles: new Set<number>(),
      spreadAcc: 0,
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

  /**
   * Army ceiling. Keeps raise it directly, but the real ceiling is how many
   * mouths the realm can feed, so farms are what let you field a big host.
   */
  capacity(p: Player): number {
    // What land and keeps can physically hold, against what the harvest can
    // feed. Food is the binding constraint, so an army is grown, not clicked.
    // Land and keeps set a generous physical ceiling; food is what binds.
    const military = p.density * 2 + p.castles * 4000;
    const foodCap = (Math.max(0, p.grainProd) / UPKEEP_PER_TROOP) * FEED_SHARE;
    return Math.round(Math.max(60, Math.min(military, foodCap)));
  }

  /** Recompute production and upkeep. Once per realm per tick. */
  refreshRates(p: Player) {
    // Bare ground yields a trickle of everything, so no realm can be locked
    // out of a resource; buildings on the right ground are what make it scale.
    let grain = 0.8 + p.tileCount * 0.004;
    let timber = 0.14 + p.tileCount * 0.002;
    let ore = 0.11 + p.tileCount * 0.0015;
    let gold = 0.35 + p.tileCount * 0.003;
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
    // Grain is income minus what the army eats; a negative flow starves it.
    p.rates = { grain: grain - soldiers * UPKEEP_PER_TROOP, timber, ore, gold };
  }

  income(p: Player): number {
    return p.rates.gold;
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

  /**
   * How good a patch of ground is as a seat. Farms, camps and mines can only
   * go on their own terrain, so a realm that spawns inside one biome can never
   * build a real economy. Score a seat by the mix it gives you.
   */
  siteQuality(t: number, radius: number): number {
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
    return viable * 1000 + plains * 3 + forest * 2 + mountain;
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

  /** Pick a seat with good ground, far from everyone already placed. */
  private pickSeat(minSpacing: number): number {
    const { w, h } = this.world;
    let best = -1;
    let bestScore = -Infinity;
    for (let tries = 0; tries < 1200; tries++) {
      const t = (this.rng() * (w * h)) | 0;
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
  startMultiplayer(humans: number): boolean {
    if (this.phase !== "spawn") return false;
    for (let i = 0; i < humans; i++) {
      const seat = this.pickSeat(42);
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

  private settle(p: Player, tile: number, radius: number, immunity: number) {
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

  private spawnLords() {
    const { w, h } = this.world;
    const count = 11;
    const taken: number[] = [...this.seats];
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
        if (nearest < 40) continue;
        const score = nearest + this.siteQuality(t, BOT_SPAWN_RADIUS) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
        if (nearest > 55 && this.siteQuality(t, BOT_SPAWN_RADIUS) >= 2000) break;
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
  /** True once another living realm touches our ground. */
  bordersRival(p: Player): boolean {
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
  claimToward(p: Player, target: number, ratio: number): boolean {
    if (target < 0 || !this.isLand(target)) return false;
    const share = Math.max(0.05, Math.min(1, ratio));
    const budget = Math.max(24, p.troops * share);
    const queue: number[] = [];
    const seen = new Set<number>();
    for (const t of p.tiles) {
      for (const n of this.neighbors4(t)) {
        if (!this.isLand(n) || this.owners[n] !== -1 || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    if (!queue.length) return false;
    // Closest to the click first, so the sweep goes where the player pointed.
    queue.sort((a, b) => this.tileDistance(a, target) - this.tileDistance(b, target));
    const COST = 18;
    let spent = 0;
    let claimed = 0;
    while (queue.length) {
      const t = queue.shift() as number;
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

  orderArmy(p: Player, target: number, ratio: number): boolean {
    if (this.phase !== "playing" || !p.alive) return false;
    // Open ground is claimed the way OpenFront does it: the border sweeps
    // outward toward the click. Once another realm shares a border, land stops
    // being free and the war goes onto columns instead.
    if (!this.bordersRival(p)) return this.claimToward(p, target, ratio);
    if (!this.canAttack(p, target)) return false;
    const share = Math.max(0.05, Math.min(1, ratio));
    const send = Math.floor(p.troops * share);
    if (send < 12) return false;
    // Every campaign draws on the economy twice: iron to arm the column and
    // grain to feed it on the road. Lose either and the offensive stops.
    const equip = Math.ceil(send * ORE_PER_TROOP);
    if (p.ore < equip) return false;
    const rations = Math.ceil(send * RATIONS_PER_TROOP);
    if (p.grain < rations) return false;

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
    // A larger economy commands more columns at once: how much you produce
    // decides how many fronts you can hold.
    const limit = Math.min(
      MAX_ARMIES_PER_PLAYER,
      MIN_ARMIES_PER_PLAYER + Math.floor(this.capacity(p) / 4000),
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

  /** The closest free tile beside a column, or -1 when it is walled in. */
  nearestOpenTile(a: Army): number {
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
        // A column that takes its objective keeps pressing outward while it
        // still has men, which is what turns one order into a real front.
        const nextPush = this.nearestOpenTile(a);
        if (a.troops >= 40 && nextPush >= 0) {
          a.target = nextPush;
          a.holding = false;
          a.holdTimer = 0;
        } else if (a.holdTimer >= HOLD_BEFORE_ABSORB) {
          // Nothing left to take: the survivors rejoin the host.
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

  buildCost(kind: StructureKind, level: number): Bundle {
    const b = BUILD[kind];
    const m = kind === "castle" ? Math.max(1, level) : 1;
    return { grain: b.grain * m, timber: b.timber * m, ore: b.ore * m, gold: b.gold * m };
  }

  canAfford(p: Player, cost: Bundle): boolean {
    return p.grain >= cost.grain && p.timber >= cost.timber &&
      p.ore >= cost.ore && p.gold >= cost.gold;
  }

  private pay(p: Player, cost: Bundle) {
    p.grain -= cost.grain;
    p.timber -= cost.timber;
    p.ore -= cost.ore;
    p.gold -= cost.gold;
  }

  /** Why this building cannot go here, or null when it can. */
  blockReason(p: Player, kind: StructureKind, t: number): string | null {
    if (this.phase !== "playing" || !p.alive) return "not now";
    if (t < 0 || this.owners[t] !== p.id) return "own ground";
    const existing = this.structs.get(t);
    if (kind === "castle") {
      if (existing?.kind === "castle") return existing.level < 8 ? null : "max level";
      return existing ? "occupied" : null;
    }
    if (existing) return "occupied";
    const need = TERRAIN_FOR[kind];
    if (need !== undefined && this.world.terrain[t] !== need) {
      return kind === "farm" ? "plains only" : kind === "lumber" ? "forest only" : "mountains only";
    }
    if (kind === "market" && !this.isCoastal(t)) return "coast only";
    return null;
  }

  canBuild(p: Player, kind: StructureKind, t: number): boolean {
    return this.blockReason(p, kind, t) === null;
  }

  build(p: Player, kind: StructureKind, t: number): boolean {
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
      this.refreshRates(p);
      // Production first: every flow moves at its own rate.
      p.grain += p.rates.grain * dt;
      p.timber += p.rates.timber * dt;
      p.ore += p.rates.ore * dt;
      p.gold += p.rates.gold * dt;
      this.spread(p, dt);
      // Famine: stores empty while the army still wants feeding.
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
        // Columns folding back into a shrunken realm cannot bank a surplus.
        p.troops = cap;
      }
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

    // Grow the economy in the order a realm actually grows: food first,
    // then wood and iron, then walls once the harvest can carry them.
    const own = [...p.tiles];
    const empty = (t: number) => !this.structs.has(t);
    const wants: StructureKind[] = [];
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

    // No food in the granary means no campaign.
    if (p.rates.grain <= 0.05) return;

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

  /**
   * Production fuels a slow automatic land grab: a realm's border creeps
   * outward on its own until it runs into someone else's ground. Attacking is
   * for taking ground that is already claimed.
   */
  private spread(p: Player, dt: number) {
    const rate = Math.min(1.2, 0.08 + Math.max(0, p.grainProd) * 0.06);
    p.spreadAcc += rate * dt;
    if (p.spreadAcc < 1) return;
    const frontier: number[] = [];
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
    this.claim(frontier[(this.rng() * frontier.length) | 0], p.id);
  }

  /* ------------------------------------------------------------------ */
  /* Netcode                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Compact snapshot for a guest. Territory is run-length encoded, so a whole
   * realm costs a few hundred numbers instead of one per tile.
   */
  snapshot(): string {
    const runs = (tiles: number[]): number[] => {
      const sorted = tiles.slice().sort((a, b) => a - b);
      const out: number[] = [];
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
        +p.rates.gold.toFixed(3),
      ],
      k: runs([...p.tiles]),
    }));
    const armies = this.armies.map((a) => ({
      o: a.owner,
      t: a.tile,
      n: Math.round(a.troops),
      g: a.target,
      c: a.cutOff ? 1 : 0,
    }));
    const structs = [...this.structs.values()].map((st) => [
      st.tile,
      STRUCT_ORDER.indexOf(st.kind),
      st.owner,
      st.level,
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
    });
  }

  /** Guest side: become a display of the host's world. */
  applySnapshot(text: string) {
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
      p.tiles = new Set<number>();
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
        holdTimer: 0,
      });
    }
    for (const d of snap.s) {
      const kind = STRUCT_ORDER[d[1]] as StructureKind;
      this.structs.set(d[0], { kind, owner: d[2], tile: d[0], level: d[3] });
      if (kind === "castle") {
        const owner = this.players[d[2]];
        if (owner) owner.castles += d[3];
      }
    }
    this.structDirty = true;
  }
}
