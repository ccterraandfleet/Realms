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
  | "siege"
  | "camp"
  | "bridge";

/** Index order used by compact netcode snapshots. */
export const STRUCT_ORDER: StructureKind[] = [
  "castle",
  "farm",
  "lumber",
  "mine",
  "market",
  "tower",
  "siege",
  "camp",
];

export interface ClaimNode {
  owner: number;
  tile: number;
  frontier: number[];
  seen: Set<number>;
  acc: number;
  done: boolean;
  /** True when the owner could not pay for the next tile. */
  stalled?: boolean;
}

/** How far from your own land a claim node can be planted. */
export const CLAIM_REACH = 26;
/** Footprint a single node may settle before it is spent. */
export const NODE_RADIUS = 34;

export interface Structure {
  kind: StructureKind;
  owner: number;
  tile: number;
  level: number;
  /** Fractional progress for camps, which creep one tile at a time. */
  acc?: number;
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
  /** Tiles of this realm's border, refreshed about once a second. */
  frontTiles: number;
  frontTimer: number;
  /** Sum of the richness of every held tile: what the land actually pays. */
  yieldSum: number;
  /** Most ground this realm ever held: the yardstick for capitulation. */
  peak: number;
  /** Tiles each rival has taken off this realm, by attacker id. */
  capturedBy: Record<number, number>;
  /** Set when the realm broke and was absorbed. */
  surrenderTo: number;
  /** Seconds until the "not enough kit" note may fire again. */
  kitWarn: number;
}

export interface Army {
  id: number;
  owner: number;
  /** The castle this formation belongs to; stable across snapshots. */
  home: number;
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
  /**
   * 0..1. Graded, not a flag: a column that can walk home over its own ground
   * and is fed fights at full strength; one that has lost the corridor or is
   * living off nothing fades until it is only a crowd.
   */
  supply: number;
  /**
   * 0..1. Morale is what makes a line break and reform instead of every fight
   * being arithmetic. Under 0.02 the host routes for home and can be ordered
   * back in once it has rallied.
   */
  morale: number;
  /** Routed: falling back to its castle, cannot attack until it rallies. */
  routed: boolean;
  /** Seconds of regrouping left before a routed host will take orders again. */
  rallyTimer: number;
  /**
   * Seconds since this host last traded blows. Morale only recovers while it is
   * out of contact, so a front that stays engaged keeps grinding down instead
   * of letting both sides shrug it off between steps.
   */
  contactTimer: number;
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
};

export const STRUCTURE_LABEL: Record<StructureKind, string> = {
  castle: "Castle",
  farm: "Farm",
  lumber: "Lumber Camp",
  mine: "Iron Mine",
  market: "Market",
  tower: "Watchtower",
  siege: "Siege Camp",
  camp: "War Camp",
  bridge: "Bridge",
};

/**
 * A formation holds one castle's worth of men. Level 1 fields 100, level 2
 * fields 250, level 3 fields 500, and it keeps climbing from there.
 */
export const ARMY_CAP = (level: number) => 50 * (level * level + 1);

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

/**
 * Everything costs something. There is no free land and no free army: what your
 * land produces is the only thing that lets you do anything at all.
 */
/**
 * Passive yield per held tile. This is the recovery floor: losing your stores
 * slows you down, it does not end you, because a bigger realm always out-earns
 * a smaller one in every resource.
 */
/**
 * Flat base production every realm gets, per second, per resource. This is the
 * floor that lets a brand new realm build at all, and the same number across
 * all four resources so nothing is starved at the start. Land and buildings
 * stack on top of it.
 */
export const BASE_YIELD = 10;

/**
 * Last man standing, fought to a decision rather than to the last tile.
 *
 * When a rival has lost this share of the ground the realm ever held, the
 * remainder capitulates and passes to whoever took the most of it, so a war
 * ends when it is decided instead of costing a month of mopping up single
 * tiles. 0.2 kept means 80% captured.
 */
export const SURRENDER_KEEP = 0.2;

/**
 * How much of a host's paper strength actually reaches the field.
 *
 * Supply is the spine of the whole war: a well-fed column with an open road
 * home fights at full strength, and an impoverished one at roughly a third,
 * which is why an army that outran its roads loses to a smaller maintained
 * one no matter what the counter says.
 */
export function fieldPower(a: Army): number {
  // Older snapshots and hand-built fixtures predate supply and morale; treat a
  // missing value as a fresh, willing host rather than poisoning every sum
  // downstream with NaN.
  const supply = Number.isFinite(a.supply) ? a.supply : 1;
  const morale = Number.isFinite(a.morale) ? a.morale : 1;
  return a.troops * (0.34 + 0.66 * supply) * (0.55 + 0.45 * morale);
}

/** Supply gained per second with an open road home and grain in store. */
export const SUPPLY_GAIN = 0.55;
/** Supply lost per second with the corridor cut. */
export const SUPPLY_CUT = 0.5;
/** Supply lost per second while the realm cannot feed its men. */
export const SUPPLY_HUNGRY = 0.3;
/** Morale recovered per second while nothing is fighting. */
export const MORALE_RALLY = 0.4;
/** A realm too small to have ever been a realm cannot capitulate on a spike. */
export const SURRENDER_FLOOR = 20;

export const TILE_YIELD = {
  grain: 0.02,
  timber: 0.008,
  ore: 0.004,
  gold: 0.01,
} as const;

export const PRICE = {
  /** Settling one unclaimed tile: seed, stakes and a survey. */
  claimTile: { grain: 2, timber: 1, ore: 0, gold: 0.25 },
  /** Raising one man into a host: rations for the march and iron for a spear. */
  perMan: { grain: 0.5, timber: 0, ore: 0.3, gold: 0.15 },
  /** Taking one tile of somebody else's ground: munitions spent doing it. */
  pushTile: { grain: 8, timber: 0, ore: 4, gold: 2 },
} as const;

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
  claimNodes: ClaimNode[] = [];
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
      peak: 0,
      capturedBy: {},
      surrenderTo: -1,
      castles: 0,
      immune: 0,
      frontTiles: 1,
      frontTimer: 0,
      yieldSum: 0,
      kitWarn: 0,
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

  /** True where a host can cross: dry land, or a bridge laid over the water. */
  passable(t: number): boolean {
    if (this.isLand(t)) return true;
    const s = this.structs.get(t);
    return !!s && s.kind === "bridge";
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
    // Land is the floor under the economy. Every tile you hold yields a little
    // of everything, so a realm that spent itself down to nothing still climbs
    // back instead of dead-ending: the ground you are standing on is the one
    // thing you cannot lose to a bad purchase. Buildings are what make it
    // compound past the tile rate.
    // Wealth is measured per tile of GROUND, and a middle-ground tile is worth
    // several pocket tiles, so taking the middle is what grows a realm.
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
    const rich = this.world.richness[t] || 1;
    if (prev >= 0) {
      const old = this.players[prev];
      old.tileCount--;
      old.density -= dens;
      old.yieldSum -= rich;
      old.tiles.delete(t);
      // Who is taking this realm apart? Capitulation goes to the biggest hand.
      old.capturedBy[playerId] = (old.capturedBy[playerId] ?? 0) + 1;
    }
    const p = this.players[playerId];
    this.owners[t] = playerId;
    p.tileCount++;
    if (p.tileCount > p.peak) p.peak = p.tileCount;
    p.density += dens;
    p.yieldSum += rich;
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
      // Pocket start: every lord begins on their own island, with water between
      // them and the rich middle ground.
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
    // Exactly one lord per pocket: no fallback seat, no player left adrift.
    const count = Math.max(0, Math.min(11, this.world.pockets.length - this.players.length));
    const taken: number[] = [...this.seats];
    // Bots take the pockets the humans did not start in.
    for (let i = 0; i < count; i++) {
      const free = this.world.pockets.filter(
        (pk) => pk >= 0 && this.owners[pk] < 0 && !taken.some((t) => this.tileDistance(t, pk) < 30),
      );
      if (free.length) {
        const seat = free[i % free.length];
        const p = this.addPlayer(LORD_NAMES[i % LORD_NAMES.length], PALETTE[(i + 1) % PALETTE.length], true);
        this.settle(p, seat, SPAWN_RADIUS, 0);
        taken.push(seat);
        continue;
      }
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
  /**
   * Men standing on one tile of front. The pool is spread along the border
   * rather than stacked on every tile, so what holds a line is depth, and a
   * concentrated host can break a stretch of it. This is the number a push has
   * to beat locally, and the number the pickets on screen represent.
   */
  lineStrength(p: Player): number {
    const front = Math.max(1, p.frontTiles);
    return Math.max(3, (p.troops / front) * 3);
  }

  /** Count how much border a realm actually has to hold. */
  private refreshFront(p: Player) {
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

  tileDistance(a: number, b: number): number {
    const { w } = this.world;
    const ax = a % w;
    const ay = (a / w) | 0;
    const bx = b % w;
    const by = (b / w) | 0;
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  /**
   * Expansion, the way unclaimed ground is meant to work: double click an open
   * spot and a node is planted there. The node eats outward from that point,
   * one ring at a time, and stops on its own the moment it touches somebody
   * else's border. Columns are for war; this is for settling.
   */
  startClaimNode(p: Player, tile: number): boolean {
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
      seen: new Set<number>([tile]),
      acc: 0,
      done: false,
    });
    this.capture(tile, p.id);
    if (!p.isBot) this.note("A claim node takes root.");
    return true;
  }

  /** Grow every live claim node. Rate follows production, so a real economy
   *  settles ground faster than a starving one. */
  private growNodes(dt: number) {
    for (const node of this.claimNodes) {
      if (node.done) continue;
      const p = this.players[node.owner];
      if (!p || !p.alive) {
        node.done = true;
        continue;
      }
      // How fast a node settles is set by what the realm produces, and it stops
      // dead when the stores run dry.
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
        const t = node.frontier.shift() as number;
        if (this.owners[t] === -1 && this.isLand(t)) {
          // Settling ground is bought tile by tile out of your stores.
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
          // A node settles a footprint, not the whole map.
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
    // Unclaimed ground is settled, never invaded: plant a node and let it eat
    // outward. Formations only ever march into somebody else's land.
    if (target < 0 || !this.isLand(target)) return false;
    if (this.owners[target] === -1) return this.startClaimNode(p, target);
    if (this.owners[target] === p.id) return false;
    if (!this.canAttack(p, target)) return false;

    // A push is your formations, not your border. If nothing is formed up yet,
    // the order becomes the muster itself.
    const mine = this.armies.filter((a) => a.owner === p.id);
    if (!mine.length) return this.muster(p);

    // Send the formation closest to the point you picked.
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
  muster(p: Player): boolean {
    if (!p.alive || this.phase !== "playing") return false;
    for (const st of this.structs.values()) {
      if (st.owner !== p.id || st.kind !== "castle") continue;
      if (this.armies.some((a) => a.owner === p.id && a.home === st.tile)) continue;
      const cap = ARMY_CAP(st.level);
      if (p.troops < cap) continue;
      if (this.armies.length >= MAX_ARMIES) return false;
      // Kit and rations for every man, paid before he takes the field.
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
        holding: true,
        holdTimer: 0,
      });
      if (!p.isBot) this.note(`${cap} men form up at your castle.`);
      return true;
    }
    return false;
  }

  /** The formation raised by a particular castle. */
  armyOf(p: Player, home: number): Army | undefined {
    return this.armies.find((a) => a.owner === p.id && a.home === home);
  }

  /** March a formation at a point. It stops where you clicked. */
  moveArmy(p: Player, home: number, target: number): boolean {
    if (this.phase !== "playing" || !p.alive) return false;
    const a = this.armyOf(p, home);
    if (!a) return false;
    if (target < 0 || !this.isLand(target)) return false;
    // A host that routed has to be given a moment to reform; once it has, the
    // same order sends it straight back into the line.
    if (a.routed && a.rallyTimer > 0) {
      if (!p.isBot) this.note("That host is still reforming. Give it a moment.");
      return false;
    }
    if (a.routed) a.routed = false;
    if (target === a.tile && a.holding) return false;
    a.target = target;
    a.holding = false;
    a.progress = 0;
    return true;
  }

  /**
   * Pitch a war camp where a formation is standing. From there it eats the
   * ground around it one tile at a time, which is how you take land you could
   * never take by walking through it.
   */
  establishCamp(p: Player, home: number): boolean {
    if (this.phase !== "playing" || !p.alive) return false;
    const a = this.armyOf(p, home);
    if (!a || !a.holding) return false;
    // A formation takes the ground it stands on, so ownership is the wrong
    // test. A camp goes up where a host has marched out and is holding, which
    // covers both ground it just took and enemy land it is standing in.
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
  campGarrison(st: Structure): number {
    let g = st.level * 120;
    for (const a of this.armies) {
      if (a.owner !== st.owner) continue;
      if (this.tileDistance(a.tile, st.tile) <= 1) g += a.troops;
    }
    return g;
  }

  /** Camps creep outward, taking the weakest ground beside them first. */
  private campTick(dt: number) {
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
  private armyBattle(a: Army, p: Player, foe: Army) {
    const atk = fieldPower(a);
    const def = fieldPower(foe);
    if (atk <= 0 || def <= 0) return;
    a.contactTimer = 1.5;
    foe.contactTimer = 1.5;
    const ratio = atk / Math.max(1, def);
    const clamp = (v: number) => Math.max(0.3, Math.min(3, v));
    // No single beat can wipe a host: contact kills at most a quarter of the men
    // in front of it, so a broken line ROUTS with men still alive to reform
    // rather than being deleted by arithmetic.
    const dmgToFoe = Math.min(foe.troops * 0.25, atk * 0.12);
    const dmgToSelf = Math.min(a.troops * 0.25, def * 0.12);

    foe.troops = Math.max(1, foe.troops - dmgToFoe);
    a.troops = Math.max(1, a.troops - dmgToSelf);
    // Morale falls by how badly the other side outweighs you, so a hopeless
    // match breaks quickly and an even one grinds for a while.
    foe.morale = Math.max(0, foe.morale - 0.16 * clamp(ratio));
    a.morale = Math.max(0, a.morale - 0.16 * clamp(1 / ratio));

    const foeBroken = foe.troops < 20 || foe.morale <= 0.02;
    const myBroken = a.troops < 20 || a.morale <= 0.02;
    if (foeBroken && !myBroken) {
      this.route(foe);
      // The men we broke were standing on a camp: it falls with them.
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
    // Still standing, both of them: the front holds and the grinding continues.
    if (!p.isBot && a.holdTimer <= 0) this.note("Hosts lock shields. The line is grinding.");
    a.holdTimer = Math.max(a.holdTimer, 1.5);
  }

  /** Send a breaking host home to reform, or destroy it if too few are left. */
  private route(a: Army) {
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
  private campBattle(a: Army, p: Player, st: Structure) {
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
      if (!Number.isFinite(a.supply)) a.supply = 1;
      if (!Number.isFinite(a.morale)) a.morale = 1;
      if (typeof a.routed !== "boolean") a.routed = false;
      if (!Number.isFinite(a.rallyTimer)) a.rallyTimer = 0;

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

      // Supply is graded, so a column can starve slowly rather than snap.
      if (a.cutOff) a.supply = Math.max(0, a.supply - SUPPLY_CUT * dt);
      else if (p.grain > 0 && p.rates.grain >= 0) a.supply = Math.min(1, a.supply + SUPPLY_GAIN * dt);
      else a.supply = Math.max(0, a.supply - SUPPLY_HUNGRY * dt);

      // Morale drifts toward what the supply state can sustain, and climbs
      // back while the host is out of contact.
      if (a.contactTimer > 0) a.contactTimer = Math.max(0, a.contactTimer - dt);
      const steady = 0.32 + 0.68 * a.supply;
      if (a.contactTimer <= 0) {
        if (a.morale < steady) a.morale = Math.min(steady, a.morale + MORALE_RALLY * dt);
        else a.morale = Math.max(steady, a.morale - MORALE_RALLY * 0.5 * dt);
      }

      // A routed host spends its time regrouping, then answers to orders again.
      if (a.routed && a.rallyTimer > 0) {
        a.rallyTimer = Math.max(0, a.rallyTimer - dt);
        if (a.rallyTimer === 0 && a.morale > 0.5) {
          a.routed = false;
          if (!p.isBot) this.note("A routed host has rallied at home.");
        }
      }

      // Nothing left to hold the line with: the column melts away.
      if (a.supply <= 0.02) {
        a.troops *= 1 - 0.12 * dt;
        if (a.troops < 40) {
          this.armies.splice(i, 1);
          if (!p.isBot) this.note("A push with no supply line has melted away.");
          continue;
        }
      }

      // An army nobody can feed does not sit there eating the realm into a
      // hole forever: the men desert until the ration bill fits what the land
      // produces again. This is the other half of the no-dead-end rule.
      if (p.grain <= 0 && p.rates.grain < 0) {
        a.troops *= 1 - 0.03 * dt;
        if (a.troops < 25) {
          this.armies.splice(i, 1);
          if (!p.isBot) this.note("A host that could not be fed has melted away.");
          continue;
        }
      }

      if (a.routed) {
        // Falling back: home ground, not the objective, and no fighting on the
        // way, so a broken host can be rebuilt and thrown in again.
        const back = this.nextOwnTile(a);
        a.progress += this.armySpeed(a.troops) * dt * 0.85;
        while (a.progress >= 1) {
          a.progress -= 1;
          const step = this.nextOwnTile(a);
          if (step < 0) break;
          a.tile = step;
        }
        if (a.tile === a.home || back < 0) {
          // Back at the castle: the men go into the pool to be mustered again.
          p.troops += Math.round(a.troops);
          this.armies.splice(i, 1);
          if (!p.isBot) this.note("Broken men are back behind the walls and ready to be mustered.");
          continue;
        }
        continue;
      }

      if (a.holding) {
        // A formation stands exactly where it was sent. It does not wander on
        // its own: taking ground from there is a camp or another order.
        a.holdTimer += dt;
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
  private contestTile(a: Army, p: Player, t: number): boolean {
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

  private armyStep(a: Army, p: Player) {
    const next = this.nextTile(a);
    if (next < 0) {
      // Nothing to cross yet, so walk your own ground toward the order. A host
      // standing deep inside its own realm used to read as "arrived" and stop
      // still at its castle.
      const through = this.nextOwnTile(a);
      if (through >= 0) {
        // Home ground is not automatically safe: an enemy host or camp can be
        // sitting on it, and walking into it is a battle.
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
    // Battle for a held border tile. Taking ground costs munitions, so a realm
    // with no iron and no grain simply cannot advance.
    const def = this.defenseAt(next, owner);
    const atk = fieldPower(a);
    if (!this.canAfford(p, PRICE.pushTile)) {
      a.holding = true;
      if (!p.isBot) this.note("Your host is out of stores and cannot press the attack.");
      return;
    }
    if (atk > def) {
      this.pay(p, PRICE.pushTile);
      // Men lost taking ground, worse when the column is running light.
      a.troops = Math.max(1, a.troops - (def * 0.7) / (0.34 + 0.66 * a.supply));
      a.morale = Math.max(0.05, a.morale - 0.05);
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
      defender.troops = Math.max(0, defender.troops - fieldPower(a) * 0.35);
      a.troops = Math.max(0, a.troops - (def * 0.8) / (0.34 + 0.66 * a.supply));
      a.morale = Math.max(0, a.morale - 0.16);
      a.holding = true;
      // Beaten back is not the same as wiped out: a host whose stomach for the
      // fight is gone falls back to reform rather than evaporating here.
      if (a.morale <= 0.02) {
        this.route(a);
        if (!p.isBot) this.note("Your host has had enough and falls back.");
      } else if (a.troops < 45) {
        const idx = this.armies.indexOf(a);
        if (idx >= 0) this.armies.splice(idx, 1);
        if (!p.isBot) this.note("A push has broken against the line.");
      }
    }
  }

  /** An adjacent friendly tile that is closer to the objective, if any. */
  private nextOwnTile(a: Army): number {
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
  private nextTile(a: Army): number {
    let best = -1;
    let bestScore = Infinity;
    const curDist = this.tileDistance(a.tile, a.target);
    for (const n of this.neighbors8(a.tile)) {
      if (!this.passable(n)) continue;
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
        if (!this.passable(n)) continue;
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

  /** Cost of n copies of a price, so per-tile and per-man prices stay one line. */
  scaleCost(cost: { grain: number; timber: number; ore: number; gold: number }, n: number): Bundle {
    return {
      grain: cost.grain * n,
      timber: cost.timber * n,
      ore: cost.ore * n,
      gold: cost.gold * n,
    };
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
    if (kind === "bridge") {
      if (t < 0) return "off the map";
      if (this.isLand(t)) return "water only";
      if (this.structs.has(t)) return "occupied";
      // A bridge has to start from a shore you hold, or from your own last span.
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
      // A span is your ground once it is laid, so the next span can extend it.
      if (kind === "bridge") this.claim(t, p.id);
    }
    this.structDirty = true;
    this.refreshRates(p);
    if (!p.isBot) this.note(`${STRUCTURE_LABEL[kind]} raised.`);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Tick                                                                */
  /* ------------------------------------------------------------------ */

  private surrenderTimer = 0;

  /**
   * 80% captured and the realm breaks: the rest of its ground passes to the
   * rival who took the most of it. Elimination is therefore a decision, not a
   * hunt for the last tile, which is what last-man-standing needs to be
   * survivable in a game that runs for a month.
   */
  private checkSurrender(dt: number) {
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

      // The rest of the realm goes over with the crown.
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
  private checkStanding() {
    const standing = this.players.filter((p) => p.alive && p.tileCount > 0);
    if (standing.length === 1) this.finish(standing[0].id);
  }

  private finish(winner: number) {
    if (this.phase === "over") return;
    this.phase = "over";
    this.winner = winner;
  }

  tick(dt: number) {
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
        // A shrunken realm cannot bank a surplus.
        p.troops = cap;
      }
      // The border pool forms up into hosts as it fills.
      if (!starving) this.muster(p);
    }

    // Formations on the march, then the camps eating ground behind them.
    this.armyTick(dt);
    this.campTick(dt);

    for (const p of this.players) {
      if (p.isBot && p.alive) this.botThink(p, dt);
    }

    if (this.phase === "playing") {
      this.checkSurrender(dt);
      this.checkStanding();
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
    // Lords camp ground they are standing on, which is how they actually take
    // a defended border instead of bouncing off it forever.
    for (const a of this.armies) {
      if (a.owner !== p.id || !a.holding) continue;
      if (this.owners[a.tile] === p.id) continue;
      if (this.rng() < 0.5 && this.establishCamp(p, a.home)) return;
    }
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
    // Your output sets how fast the border creeps: with stores banked it moves,
    // without them it stalls at the first unpaid tile.
    const rate = Math.min(8, 0.25 + Math.max(0, p.grainProd) * 0.9);
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
    // Creeping into unclaimed ground costs the same as any other settled tile.
    if (!this.canAfford(p, PRICE.claimTile)) {
      p.spreadAcc = 0;
      return;
    }
    this.pay(p, PRICE.claimTile);
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
      pk: Math.round(p.peak),
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
      m: a.home,
      h: a.holding ? 1 : 0,
      sp: +a.supply.toFixed(2),
      mo: +a.morale.toFixed(2),
      rt: a.routed ? 1 : 0,
    }));
    const nodes = this.claimNodes.slice(0, 240).map((n) => [n.tile, n.owner, n.done ? 1 : 0]);
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
      cn: nodes,
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
    this.claimNodes = (snap.cn ?? []).map((r: number[]) => ({
      owner: r[1],
      tile: r[0],
      frontier: [],
      seen: new Set<number>(),
      acc: 0,
      done: r[2] === 1,
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
        holding: d.h === 1,
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
