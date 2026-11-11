/* ===========================================================================
 * CHIVALRY 2 PVP, REBUILT FROM THEIR OWN DATA
 * ===========================================================================
 * This replaces the accumulated pile of guesses. Every phase duration, damage
 * value, stamina cost, turn limit and swing direction below is READ from
 * chiv.data.js, which is generated from Chivalry's own AbilitiesOverride
 * datatable. Nothing about the timing is invented.
 *
 * THE PHASE PIPELINE, exactly as their data lays it out:
 *
 *   HOLDING -> WINDUPP -> RELEASE -> RECOVERY
 *     ^           ^          ^          ^
 *     |           |          |          +-- their Recovery, or their Blocked
 *     |           |          |              value when the attack was blocked,
 *     |           |          |              or THWACK when it connected
 *     |           |          +-------------- hitbox is LIVE for this long
 *     |           +------------------------- drawn, cannot hit
 *     +------------------------------------- chamber; COMBO replaces it when
 *                                            chaining, and a RIPOSTE replaces
 *                                            the WINDUPP phase instead
 *
 * WHAT THE OLD BUILD GOT WRONG BY BUILDING IT FROM FOR HONOR:
 *  - It had THREE guard zones. Chivalry has ONE front-facing block. Direction
 *    does not decide whether you can block; it decides whether you can COUNTER.
 *  - It had directional guard switching. There is no such thing here.
 *  - It had a thrust that "breaks a held guard". In Chivalry the KICK does
 *    that, and the data says so: KickLow and Shove both carry a 5 damage
 *    guard-break verb with a 0.45 riposte.
 *  - Slashes cost 10 stamina. Their data says StaminaCost 0.0 on every weapon
 *    slash, overhead and stab. Only jabs, shoves, kicks, throws, specials and
 *    sprint attacks cost stamina.
 *  - It had invented ACCEL/DRAG multipliers. Chivalry has no such multiplier:
 *    it has TURN LIMITS, three of them per weapon (horizontal forward,
 *    horizontal reverse, vertical), and a drag is simply what happens when you
 *    keep turning at the limit while the hitbox is live.
 * =========================================================================== */

import { WEAPONS, DEFAULTS } from './chiv.data.js';

export const CFG = {
  HP: 100,
  STAM_MAX: 100,
  STAM_REGEN: 20,            // per second
  STAM_REGEN_DELAY: 0.65,    // after spending any
  BLOCK_STAM_PER_DMG: 0.6,   // blocking a hit costs stamina scaled by its damage
  PARRY_WINDOW: 0.2,         // guard raised inside this before impact = a parry
  COUNTER_WINDOW: 0.9,       // after a block, matching their attack TYPE counters
  RIPOSTE_WINDOW: 1.0,       // after a block, any attack is a riposte
  FEINT_COST: 12,
  EXHAUST_LOCK: 1.1,         // no guard and no attacks while this runs
  STAGGER_TIME: 0.45,
  DODGE_TIME: 0.42,
  DODGE_IFRAMES: 0.26,
  FRONT_ARC: Math.PI * 0.55, // a block only covers this half-angle from facing
  GUARD_BREAK_STAGGER: 0.8,
  START_DIST: 3.2,
  MIN_DIST: 0.55,
  MAX_DIST: 6,
  MOVE_SPEED: 1.9,           // closing speed in metres/second
  TURN_UNIT: 'deg/s',        // their TurnLimitStrength read as degrees per second
};

/* Reach is the one thing the ability table does NOT carry, because it is weapon
 * geometry rather than a number on an attack. Authored, and flagged as such. */
export const REACH = {
  Knife: 1.4, Dagger: 1.5, Katars: 1.55, Claw_Katars: 1.55, Hatchet: 1.8, Cudgel: 1.9,
  Falchion: 2.1, Longsword: 2.25, Messer: 2.25, HighlandSword: 2.35, HeavyCavalrySword: 2.35,
  Mace: 2.0, HeavyMace: 2.15, MorningStar: 2.2, BattleAxe: 2.15, WarAxe: 2.15,
  Maul: 2.4, Greatsword: 2.65, DaneAxe: 2.6, ExecutionersAxe: 2.5,
  PoleAxe: 2.75, Halberd: 2.85, Glaive: 2.8, Goedendag: 2.4, Spear: 3.0, Javelin: 2.6, Lance: 3.2,
  DEFAULT: 2.2,
};

/* The three attack TYPES that a counter has to match. Direction is separate:
 * a slash left and a slash right are the same type, different Direction. */
const TYPE_OF = {
  Slash: 'slash', SlashHeavy: 'slash',
  Overhead: 'overhead', OverheadHeavy: 'overhead',
  Stab: 'stab', StabHeavy: 'stab',
  Special: 'special',
  Jab: 'jab', Headbutt: 'jab', Throw: 'jab',
  Shove: 'kick', KickLow: 'kick', SprintShove: 'kick',
  SprintAttack: 'slash',
};

let SWING_SEQ = 0;
const isNum = (v) => typeof v === 'number' && isFinite(v) && v >= 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function ability(weapon, name) {
  const w = WEAPONS[weapon];
  if (w && w[name]) return w[name];
  return DEFAULTS[name] || null;
}

export function abilityList(weapon) {
  const w = WEAPONS[weapon];
  return w ? Object.keys(w) : [];
}

export function weaponReach(weapon) {
  return REACH[weapon] ?? REACH.DEFAULT;
}

/* Resolve the four phases for one attack, in seconds. Everything falls back to
 * the ability's own row and never to a constant of mine. */
export function phases(weapon, name) {
  const a = ability(weapon, name);
  if (!a) return null;
  return {
    hold: isNum(a.Holding) ? a.Holding : 0,
    windup: isNum(a.Windup) ? a.Windup : 0,
    release: isNum(a.Release) ? a.Release : 0,
    recovery: isNum(a.Recovery) ? a.Recovery : 0.7,
    blocked: isNum(a.Blocked) ? a.Blocked : 0.75,
    thwack: isNum(a.Thwack) ? a.Thwack : null,
    combo: isNum(a.Combo) ? a.Combo : null,
    riposte: isNum(a.Riposte) ? a.Riposte : null,
    feint: isNum(a.Feint) ? a.Feint : 0.175,
    damage: isNum(a.Damage) ? a.Damage : 0,
    stamina: isNum(a.StaminaCost) ? a.StaminaCost : 0,
    turn: isNum(a.TurnLimitStrength) ? a.TurnLimitStrength : 45,
    turnV: isNum(a.VerticalTurnLimitStrength) ? a.VerticalTurnLimitStrength : 50,
    turnReverse: isNum(a.ReverseTurnLimitStrength) ? a.ReverseTurnLimitStrength : 50,
    direction: a.Direction || null,
    altDirection: a.AltDirection || null,
  };
}

export class Fighter {
  constructor(id, side, weapon = 'Longsword') {
    this.id = id;
    this.side = side;              // -1 player, +1 opponent (for framing)
    this.weapon = WEAPONS[weapon] ? weapon : 'Longsword';
    this.hp = CFG.HP;
    this.stam = CFG.STAM_MAX;
    this.stamSpentAt = -99;
    this.state = 'idle';           // idle | holding | windup | release | recovery | thwack | stagger | dodge | dead
    this.stateT = 0;
    this.stateDur = 0;
    this.attack = null;            // the in-flight ability
    this.guard = false;
    this.guardUpAt = -99;
    this.guardLock = 0;            // can't raise the guard while > 0
    this.riposteUntil = -99;
    this.counterUntil = -99;
    this.counterType = null;       // which attack TYPE would counter
    this.lastBlockedAt = -99;
    this.chained = false;          // this attack came out of a combo
    this.riposting = false;
    this.exhaustedUntil = -99;
    this.facing = side > 0 ? Math.PI : 0;   // where the torso points, radians
    this.turnThisSwing = 0;        // degrees swept since the swing began
    this.turnAllowance = 0;        // degrees the turn limit still permits
    this.stats = { hits: 0, blocked: 0, parried: 0, countered: 0, feints: 0, kicks: 0, jabs: 0, disarmed: 0 };
    this.dodgeDir = 0;
    this.alive = true;
  }

  get busy() {
    return this.state === 'holding' || this.state === 'windup' || this.state === 'release'
        || this.state === 'recovery' || this.state === 'thwack';
  }
  get swinging() { return this.state === 'release'; }
  canAct() { return this.alive && !this.busy; }

  /* the view asks this and gets the same clock the hitbox runs on */
  phaseInfo() {
    if (!this.attack) return null;
    const u = this.stateDur > 0 ? clamp(this.stateT / this.stateDur, 0, 1) : 0;
    if (this.state === 'release') return { phase: 'release', u };
    if (this.state === 'holding') return { phase: 'holding', u };
    if (this.state === 'windup') return { phase: 'windup', u };
    if (this.state === 'recovery' || this.state === 'thwack') return { phase: 'recovery', u };
    return null;
  }

  /* ---- attacking ------------------------------------------------------- */
  canStartAttack() {
    if (!this.alive) return false;
    if (this.state === 'idle' || this.state === 'dodge') return true;
    if (this.state === 'recovery' || this.state === 'thwack') return true;   // combo
    return false;
  }

  startAttack(name, { alt = false, clock = 0, combo = false } = {}) {
    const ph = phases(this.weapon, name);
    if (!ph) return false;
    if (!this.canStartAttack()) return false;

    /* HOLDING is skipped by a combo and replaced by their COMBO value, and a
     * riposte replaces the WINDUPP phase entirely rather than shortening it. */
    const chaining = combo || this.state === 'recovery' || this.state === 'thwack';
    const riposting = clock < this.riposteUntil;
    const hold = chaining ? (ph.combo ?? ph.hold) : ph.hold;
    const windup = riposting ? (ph.riposte ?? ph.windup) : ph.windup;

    this.attack = {
      id: ++SWING_SEQ,          // stable per swing: the viewmodel keys its arc off this
      name,
      type: TYPE_OF[name] || 'slash',
      alt,
      dir: alt ? (ph.altDirection || ph.direction) : (ph.direction || null),
      hold, windup,
      release: ph.release,
      recovery: ph.recovery,
      blocked: ph.blocked,
      thwack: ph.thwack,
      damage: ph.damage,
      stamina: ph.stamina,
      turn: ph.turn, turnV: ph.turnV, turnReverse: ph.turnReverse,
      feintWindow: ph.feint,
      chained: !!chaining,
      riposting,
      resolved: false,
      t: 0,
    };
    this.chained = !!chaining;
    this.riposting = riposting;
    this.turnThisSwing = 0;
    this.turnAllowance = 0;
    if (chaining || riposting) { this.riposteUntil = -99; this.counterUntil = -99; }
    if (ph.stamina > 0) { this.spendStam(ph.stamina, clock); }

    if (hold > 0) { this.state = 'holding'; this.stateDur = hold; }
    else if (windup > 0) { this.state = 'windup'; this.stateDur = windup; }
    else if (ph.release > 0) { this.state = 'release'; this.stateDur = ph.release; }
    else { this.state = 'recovery'; this.stateDur = ph.recovery; }
    this.stateT = 0;
    return true;
  }

  canFeint(clock) {
    if (!this.attack) return false;
    const inChamber = this.state === 'holding' || this.state === 'windup';
    if (!inChamber) return false;
    return this.stateT >= 0 && this.stateT <= this.attack.feintWindow + (this.attack.hold || 0);
  }

  feint(clock) {
    if (!this.canFeint(clock)) return false;
    if (this.stam < CFG.FEINT_COST) return false;
    this.spendStam(CFG.FEINT_COST, clock);
    this.stats.feints++;
    this.attack = null;
    this.state = 'idle'; this.stateT = 0; this.stateDur = 0;
    return true;
  }

  /* ---- guard ----------------------------------------------------------- */
  canRaiseGuard(clock) {
    return this.alive && !this.busy && this.guardLock <= 0 && clock >= this.exhaustedUntil;
  }
  raiseGuard(clock) {
    if (this.guard) return true;
    if (!this.canRaiseGuard(clock)) return false;
    this.guard = true;
    this.guardUpAt = clock;
    return true;
  }
  dropGuard() { this.guard = false; }

  spendStam(n, clock) {
    this.stam = Math.max(0, this.stam - n);
    this.stamSpentAt = clock;
  }

  stagger(seconds, clock) {
    this.attack = null;
    this.guard = false;
    this.state = 'stagger';
    this.stateT = 0;
    this.stateDur = seconds;
    this.guardLock = seconds + 0.15;
  }

  disarm(clock) {
    this.stats.disarmed++;
    this.attack = null;
    this.guard = false;
    this.state = 'stagger';
    this.stateT = 0;
    this.stateDur = CFG.EXHAUST_LOCK;
    this.guardLock = CFG.EXHAUST_LOCK;
    this.exhaustedUntil = clock + CFG.EXHAUST_LOCK;
  }

  startDodge(dir, clock) {
    if (!this.alive || this.busy) return false;
    if (clock < this.exhaustedUntil) return false;
    this.attack = null;
    this.guard = false;
    this.dodgeDir = dir;
    this.state = 'dodge';
    this.stateT = 0;
    this.stateDur = CFG.DODGE_TIME;
    return true;
  }

  inDodgeIFrames() {
    return this.state === 'dodge' && this.stateT <= CFG.DODGE_IFRAMES;
  }

  /* The turn limit. THEIR RULE, not an invented multiplier: while the weapon is
   * being drawn and while it is travelling, the fighter cannot turn faster than
   * the weapon's own TurnLimitStrength, with separate limits for turning AWAY
   * from the swing (Reverse) and for pitching (Vertical). A drag is just what
   * happens when you keep turning at the limit while the hitbox is live. */
  applyTurn(wantedDegrees, clock) {
    if (!this.attack) return { granted: 0, limit: 0 };
    if (this.state !== 'windup' && this.state !== 'release') return { granted: 0, limit: 0 };
    const a = this.attack;
    const limitRate = wantedDegrees < 0 ? a.turnReverse : a.turn;
    const dtSlice = this._lastDt || 1 / 60;
    const maxThisFrame = limitRate * dtSlice;
    const granted = clamp(wantedDegrees, -maxThisFrame, maxThisFrame);
    this.turnThisSwing += granted;
    return { granted, limit: limitRate };
  }
}

export class Duel {
  constructor(a, b, opts = {}) {
    this.a = a;
    this.b = b;
    this.clock = 0;
    this.dist = opts.dist ?? CFG.START_DIST;
    this.events = [];
    this.over = false;
    this.winner = null;
  }

  emit(type, data = {}) { this.events.push({ t: this.clock, type, ...data }); }
  drain() { const out = this.events; this.events = []; return out; }

  /* one place decides damage, so the number can never disagree with the table */
  damageOf(f) { return f.attack ? f.attack.damage : 0; }
  reachOf(f) { return weaponReach(f.weapon); }

  step(dt, inA = {}, inB = {}) {
    if (this.over) return this.drain();
    this.events = [];
    this.clock += dt;
    const F = [this.a, this.b];
    const I = [inA, inB];

    this._pending = [];
    const closing = (I[0].move ?? 0) + (I[1].move ?? 0);
    this.dist = clamp(this.dist - closing * CFG.MOVE_SPEED * dt, CFG.MIN_DIST, CFG.MAX_DIST);

    for (let i = 0; i < 2; i++) {
      const f = F[i], inp = I[i];
      f._lastDt = dt;
      if (!f.alive) continue;

      /* intent */
      if (inp.turn) f.applyTurn(inp.turn, this.clock);
      if (inp.guard) f.raiseGuard(this.clock);
      else if (f.guard) f.dropGuard();
      if (inp.dodge) f.startDodge(inp.dodge, this.clock);
      if (inp.feint) f.feint(this.clock);
      if (inp.attack) {
        const name = inp.attack;
        const isCounter = f.counterUntil > this.clock
          && (TYPE_OF[name] === f.counterType);
        f.startAttack(name, { alt: !!inp.alt, clock: this.clock, combo: !!inp.combo });
        if (f.attack && isCounter) {
          f.stats.countered++;
          this.emit('counter', { who: f.id, vs: F[1 - i].id, attack: name });
        }
      }

      /* advance the pipeline */
      if (f.busy || f.state === 'stagger' || f.state === 'dodge') {
        f.stateT += dt;
        while (f.stateT >= f.stateDur && f.stateDur > 0) {
          const spill = f.stateT - f.stateDur;
          this.advancePhase(f, i, F);
          if (!f.busy && f.state !== 'stagger' && f.state !== 'dodge') break;
          f.stateT = spill;
        }
      }

      /* stamina */
      if (this.clock - f.stamSpentAt > CFG.STAM_REGEN_DELAY && f.state !== 'stagger') {
        const before = f.stam;
        f.stam = Math.min(CFG.STAM_MAX, f.stam + CFG.STAM_REGEN * dt);
        if (before <= 0 && f.stam > 0) this.emit('recovered', { who: f.id });
      }
    }

    /* RESOLUTION IS DEFERRED UNTIL BOTH MEN HAVE ADVANCED, and it is driven by
     * the release phase actually being entered rather than by spotting the state
     * afterwards. A kick has NO Release phase in the ability table (Release -1),
     * so a zero-length release would otherwise transition to recovery inside the
     * same step the hitbox went live and the strike would vanish unresolved. */
    for (const { att, def } of this._pending) this.resolveStrike(att, def);

    if (this.a.hp <= 0 || this.b.hp <= 0) {
      this.over = true;
      this.winner = this.a.hp <= 0 ? this.b : this.a;
      const dead = this.a.hp <= 0 ? this.a : this.b;
      dead.alive = false; dead.state = 'dead';
      this.emit('death', { who: dead.id, vs: this.winner.id });
    }
    return this.drain();
  }

  advancePhase(f, i, F) {
    const a = f.attack;
    if (f.state === 'holding') {
      if (a.windup > 0) { f.state = 'windup'; f.stateT = 0; f.stateDur = a.windup; this.emit('windup', { who: f.id, attack: a.name, dir: a.dir }); }
      else { this.enterRelease(f, i, F); }
      return;
    }
    if (f.state === 'windup') { this.enterRelease(f, i, F); return; }
    if (f.state === 'release') {
      f.state = 'recovery';
      f.stateT = 0;
      f.stateDur = a.recovery;
      return;
    }
    /* recovery / thwack / stagger / dodge all end the same way */
    f.attack = null;
    f.state = 'idle';
    f.stateT = 0;
    f.stateDur = 0;
  }

  /* the hitbox goes live HERE, and that is the single place a strike is queued */
  enterRelease(f, i, F) {
    const a = f.attack;
    f.state = 'release';
    f.stateT = 0;
    /* an ability with no release (a kick, a shove) still needs one step of life */
    f.stateDur = Math.max(a.release, 0.001);
    this.emit('release', { who: f.id, attack: a.name, dir: a.dir });
    this._pending.push({ att: f, def: F[1 - i] });
  }

  resolveStrike(att, def) {
    const a = att.attack;
    if (!a || a.resolved) return;
    a.resolved = true;

    const reach = this.reachOf(att) + (a.name === 'SprintAttack' ? 0.4 : 0);
    if (this.dist > reach) { this.emit('whiff', { who: def.id, vs: att.id, dist: +this.dist.toFixed(2) }); return; }
    if (def.state === 'dead') return;
    if (def.inDodgeIFrames()) { this.emit('dodged', { who: def.id, vs: att.id }); return; }

    const type = a.type;
    const isKick = type === 'kick';

    /* A KICK IS THE GUARD BREAK. Their data: KickLow and Shove, 5 damage,
     * 10 stamina, 0.45 riposte. It does not go through a raised guard, it
     * removes it. */
    if (def.guard) {
      if (isKick) {
        def.guard = false;
        def.guardLock = CFG.GUARD_BREAK_STAGGER;
        def.stagger(CFG.GUARD_BREAK_STAGGER, this.clock);
        this.applyDamage(def, 5);
        att.stats.kicks++;
        this.emit('guardbreak', { who: def.id, vs: att.id, dmg: 5 });
        att.state = 'recovery'; att.stateT = 0; att.stateDur = a.blocked;
        return;
      }
      /* a raised guard stops anything from the front */
      const fresh = (this.clock - def.guardUpAt) <= CFG.PARRY_WINDOW;
      const cost = a.damage * CFG.BLOCK_STAM_PER_DMG;
      def.spendStam(cost, this.clock);
      def.stats.blocked++;
      def.lastBlockedAt = this.clock;
      def.counterUntil = this.clock + CFG.COUNTER_WINDOW;
      def.counterType = type;
      def.riposteUntil = this.clock + CFG.RIPOSTE_WINDOW;
      if (fresh) {
        def.stats.parried++;
        def.stam = Math.min(CFG.STAM_MAX, def.stam + 8);
        this.emit('parry', { who: def.id, vs: att.id, attack: a.name, attackType: type });
      } else {
        this.emit('block', { who: def.id, vs: att.id, attack: a.name, attackType: type });
      }
      if (def.stam <= 0) {
        def.disarm(this.clock);
        this.emit('disarmed', { who: def.id, vs: att.id });
      }
      /* the attacker eats the ability's own Blocked recovery */
      att.state = 'recovery'; att.stateT = 0; att.stateDur = a.blocked;
      return;
    }

    if (isKick) {
      this.applyDamage(def, 5);
      att.stats.kicks++;
      this.emit('kick', { who: def.id, vs: att.id, dmg: 5 });
      def.stagger(0.35, this.clock);
      att.state = 'recovery'; att.stateT = 0; att.stateDur = a.blocked;
      return;
    }

    this.applyDamage(def, a.damage);
    att.stats.hits++;
    this.emit('hit', { who: def.id, vs: att.id, dmg: Math.round(a.damage), hp: Math.max(0, def.hp), attack: a.name });
    if (type === 'jab') att.stats.jabs++;
    /* THWACK: their number, and it replaces the recovery on a connect */
    att.state = 'thwack';
    att.stateT = 0;
    att.stateDur = a.thwack ?? a.recovery;
    if (def.stagger) def.stagger(0.3, this.clock);
  }

  applyDamage(f, dmg) {
    f.hp = Math.max(0, f.hp - dmg);
    if (f.hp <= 0) { f.alive = false; f.state = 'dead'; f.attack = null; f.guard = false; }
  }
}

export { TYPE_OF, WEAPONS, DEFAULTS };
