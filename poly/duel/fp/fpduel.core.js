/* REALMS DUEL CORE
 *
 * The melee rules as pure logic: no renderer, no DOM, no three.js. Two fighters,
 * a fixed timestep, intentions in, events out. Everything that decides a fight
 * lives here so it can be measured in node with thousands of bouts instead of
 * being eyeballed in a browser and hoped at.
 *
 * WHY A FIXED TIMESTEP: a parry window of 140ms is 8.4 frames at 60Hz and 16.8 at
 * 120Hz. If the window is measured in frames the game is different on different
 * hardware, and a player's muscle memory stops transferring. Windows are seconds,
 * simulation runs at 120Hz regardless of what the display does.
 *
 * THE DESIGN IN ONE PARAGRAPH: three guard zones, three attack lines that map to
 * them, and a block that becomes a parry when it starts within 140ms of impact.
 * A parry staggers the attacker and buys a 600ms riposte window that hits for
 * 40% more. A feint cancels a windup for 8 stamina so reflexive parrying is
 * punished. Thrust beats a held block but is slow and parryable. Stamina is the
 * real health bar: it is what stops a player from doing all of these forever.
 */

export const CFG = {
  HP: 100,
  STAM_MAX: 100,
  STAM_REGEN: 14,          // per second, only after the grace period
  STAM_REGEN_DELAY: 0.8,   // seconds of doing nothing
  EXHAUST_REGEN: 8,
  EXHAUST_TIME: 1.2,       // guard broken at zero stamina
  PARRY_WINDOW: 0.10,      // a guard that SETTLED within this of impact = parry
  PARRY_COOLDOWN: 0.35,    // per-press: mashing the guard does not buy more parries
  PARRY_REFUND: 6,         // stamina returned by a successful deflect
  GUARD_SWITCH: 0.09,      // moving the guard to another zone leaves this long open
  DEFLECT_STAGGER: 0.28,   // attacker pays this when parried
  RIPOSTE_WINDOW: 0.60,
  RIPOSTE_MULT: 1.40,
  GUARD_BREAK_STAGGER: 0.50,
  FEINT_COST: 8,
  FEINT_LOCK: 0.12,        // can't immediately attack after a feint
  BAIT_WINDOW: 0.30,       // a defender who pressed this recently is committed
  BAIT_PENALTY: 0.38,      // and stands open this long when the swing was a feint
  FEINT_EARLIEST: 0.09,    // no cancelling on the same frame it started
  DODGE_TIME: 0.25,
  DODGE_IFRAME: 0.12,
  DODGE_COST: 20,
  MOVE_SPEED: 3.0,
  ATTACK_RANGE: 2.05,      // blades meet at about two paces
  ZONES: ['L', 'R', 'T'],
  ATTACKS: {
    /* THE TELEGRAPH HAS TO BE READABLE OR DEFENCE IS A COIN FLIP. A light at 180ms is
     * faster than human reaction, so nobody can see the zone in time, and a bot
     * cannot either: measured, light spam won 83-85% of every matchup including
     * against a dedicated parrier, which is the definition of a broken system.
     * At 340ms the zone is visible, the guard takes 90ms to cross, and the parry
     * window still demands a press between 230ms and 90ms before impact. */
    light:  { windup: 0.34, active: 0.08, recover: 0.26, dmg: 12, stam: 10, reach: 2.05, line: 'zone' },
    heavy:  { windup: 0.58, active: 0.11, recover: 0.42, dmg: 24, stam: 20, reach: 2.25, line: 'zone' },
    thrust: { windup: 0.40, active: 0.08, recover: 0.32, dmg: 14, stam: 14, reach: 2.45, line: 'thrust', breaksBlock: true },
    /* a jab does almost nothing except STOP A SWING ALREADY IN MOTION, which is the
     * only answer to a committed heavy besides giving ground */
    jab:    { windup: 0.17, active: 0.05, recover: 0.22, dmg: 4, stam: 7, reach: 1.95, line: 'zone', interrupt: true },
  },
  /* DEFENCE MUST BE THE CHEAPER HALF OF THE EXCHANGE OR SPAMMING IS CORRECT PLAY.
   * At light 14 the defender spent 33 stamina a second to survive what cost the
   * attacker 21, so the blocker always broke first and light spam won every single
   * cell of the matrix (measured at 81%). Now a blocked light costs 6 and a guard
   * recovers at 40% rate, so the man swinging pays for his own aggression. */
  BLOCK_ABSORB: { light: 6, heavy: 14, thrust: 9 },
  GUARD_REGEN_SCALE: 0.4,   // a held guard still breathes, slowly

  /* ============================ THE CHIVALRY LAYER ============================
   * Modelled on how Chivalry 2 actually resolves a duel, from the mechanics
   * documented by its own guides: INITIATIVE is a real turn you hold or lose,
   * COUNTERS are a block followed by the SAME line (they give stamina back and
   * guard while they travel), RIPOSTES are a block followed by any attack (faster,
   * also guarding), a JAB stops a swing already in motion, and DRAGS and ACCELS
   * let the mouse bend the timing of a cut - dragged against the arc it is slower
   * and reaches further, swung with the arc it is faster. */
  COUNTER_WINDOW: 0.34,    // a block this recent, then the same line back, is a counter
  COUNTER_SPEED: 0.74,     // a counter is far faster than a plain swing
  COUNTER_REFUND: 12,      // and it REGAINS stamina, which is why stamina wars are winnable
  RIPOSTE_SPEED: 0.82,
  /* NO OFF-TURN PENALTY. Mason, plainly: "its not turn based its live pvp - if i attack
   * 20x and you attack 0 times then thats just how it is." He is right, and worse, the
   * 1.40x penalty multiplied straight through the 0.68x accel and cancelled it, which is
   * why accelerating did nothing. Initiative now only breaks a DEAD HEAT. */
  ACCEL_MIN: 0.55,         // turning INTO the arc cuts the windup to 55%: felt, not theoretical
  DRAG_MAX: 1.75,          // turning AGAINST the arc stretches it to 175%
  DRAG_REACH: 0.40,        // a drag carries the blade further, Chivalry's signature
  TURN_FULL: 2.4,          // rad/s of body turn that counts as a full drag or accel
  TRADE_ABSORB: 0.55,      // what a guarding counter/riposte pays to eat a swing
  DISARM_TIME: 1.7,        // blocking at zero stamina costs you the weapon
  BLOCK_REGEN_PENALTY: 0,  // blocking stops regen entirely
};

let SEQ = 1;
export const nowClock = (() => { let t = 0; return { get: () => t, add: (d) => (t += d), reset: () => (t = 0) }; })();

export class Fighter {
  constructor(name, side) {
    this.id = SEQ++;
    this.name = name;
    this.side = side;          // -1 faces right, +1 faces left; only for bookkeeping
    this.hp = CFG.HP;
    this.stam = CFG.STAM_MAX;
    this.guard = null;         // 'L' | 'R' | 'T' while held
    this.transitionUntil = 0;  // guard finishes crossing here
    this.guardSetAt = -1;      // when the guard settled in its zone (parry clock)
    this.state = 'idle';       // idle | windup | active | recover | stagger | dodge | exhausted
    this.attack = null;        // { kind, zone, t, dur, resolve }
    this.tState = 0;           // time in current state
    this.riposteUntil = -1;
    this.lastAction = -99;     // clock stamp of the last thing that cost stamina
    this.deflected = 0;        // count, for stats
    this.parries = 0;
    this.feints = 0;
    this.hits = 0;
    this.whiffs = 0;
    this.dodges = 0;
    this.guardBreaks = 0;
    this.baited = 0;
    this.lastPressAt = -99;
    this.guardLockUntil = 0;
    this.feintLock = 0;
    this.forcedStagger = 0;
    /* chivalry layer */
    this.blockedAt = -99;      // when this fighter last stopped a swing
    this.blockedKind = null;   // and with what line, so a counter can match it
    this.blockedZone = null;
    this.disarmUntil = -99;
    this.counters = 0;
    this.jabbed = 0;
    this.drags = 0;
    this.accels = 0;
  }

  get alive() { return this.hp > 0; }
  get staminaRatio() { return this.stam / CFG.STAM_MAX; }
  get healthRatio() { return this.hp / CFG.HP; }

  spend(n, clock) {
    this.stam = Math.max(0, this.stam - n);
    this.lastAction = clock;
    return this.stam > 0;
  }

  canAct() {
    return this.alive && this.state !== 'stagger' && this.state !== 'exhausted' && this.state !== 'dodge';
  }

  /* THE GUARD HAS A TRAVEL TIME. Switching zones costs 90ms during which nothing is
   * covered, while re-tapping the same zone is instant. That single rule is what
   * makes a feint worth eight stamina: you cannot be in two places at once, so a
   * cancelled swing to one side and a real one to the other arrives while the
   * guard is still crossing. Without it, guard switching is free, feints do
   * nothing, and the whole mind game collapses into who swings first. */
  startBlock(zone, clock) {
    if (!this.alive) return false;
    if (this.state === 'stagger' || this.state === 'exhausted' || this.state === 'dodge') return false;
    if (this.state === 'windup' || this.state === 'active' || this.state === 'recover') return false;
    /* A PRESS IS NOT ALWAYS A PARRY. Only one press per cooldown can deflect, so
     * holding a zone and twitching it does not make you unkillable; the second
     * press inside the cooldown still guards, it just cannot deflect. This is what
     * gives a feint its teeth: the bait spends the defender's one good press. */
    if (clock < (this.guardLockUntil ?? 0)) return false;   // baited: hands out of position
    const parryPress = clock >= (this.parryReadyAt ?? 0);
    this.lastPressAt = clock;
    if (parryPress) this.parryReadyAt = clock + CFG.PARRY_COOLDOWN;
    this.pressIsParry = parryPress;
    if (this.guard === zone) {
      this.guardSetAt = clock;
      this.transitionUntil = clock;
    } else {
      this.guard = zone;
      this.transitionUntil = clock + CFG.GUARD_SWITCH;
      this.guardSetAt = this.transitionUntil;
    }
    this.lastAction = clock;   // a held block never regenerates stamina
    return true;
  }

  stopBlock() { this.guard = null; this.transitionUntil = 0; this.guardSetAt = -1; }

  /* effective means the guard has finished crossing to its zone */
  guardUp(clock) { return !!this.guard && clock >= (this.transitionUntil ?? 0); }

  startAttack(kind, zone, clock, opts = {}) {
    if (!this.canAct()) return false;
    /* YOU CANNOT START A SWING WHILE MID-SWING. canAct() only excludes stagger, exhausted
     * and dodge, so a held button (or a repeated intent) used to restart the windup every
     * frame and quietly drain stamina, which made a swing look like it never finished. */
    if (this.state === 'windup' || this.state === 'active' || this.state === 'recover') return false;
    if (clock < this.disarmUntil) return false;
    if (this.guard) return false;
    if (this.feintLock > 0) return false;
    const a = CFG.ATTACKS[kind];
    if (!a) return false;
    if (this.stam < a.stam * 0.5) return false;   // too spent to swing properly
    this.spend(a.stam, clock);

    const line = a.line === 'thrust' ? 'T' : zone;
    /* COUNTER: raise the guard on a line, then throw that SAME line back. Chivalry
     * gives it stamina back, makes it faster, and lets it guard while it travels,
     * which is what makes stamina wars and 1vX survivable. */
    const countered = kind !== 'jab' && this.blockedAt >= clock - CFG.COUNTER_WINDOW &&
      this.blockedKind === kind && (kind === 'thrust' || this.blockedZone === line);
    /* RIPOSTE: any attack straight out of a block, already opened by a parry or a
     * block. Faster than a plain swing, and it guards at the start. */
    const riposte = !countered && kind !== 'jab' &&
      (this.riposteUntil > clock || this.blockedAt >= clock - CFG.COUNTER_WINDOW);

    let base = 1;
    if (countered) { base *= CFG.COUNTER_SPEED; this.stam = Math.min(CFG.STAM_MAX, this.stam + CFG.COUNTER_REFUND); this.counters++; }
    else if (riposte) base *= CFG.RIPOSTE_SPEED;
    this.state = 'windup';
    this.tState = 0;
    this.lastKind = kind;
    this.attackSeq = (this.attackSeq || 0) + 1;
    this.attack = { id: this.id * 10000 + this.attackSeq, kind, zone: line, t: 0,
      resolved: false, deflectedThisSwing: false,
      baseMul: base, durMul: base, isCounter: countered, isRiposte: riposte,
      guarded: countered || riposte, reachBonus: 0, turn: 0 };
    return true;
  }

  /* DRAG AND ACCEL. The page measures how fast the player is turning and which way
   * relative to the arc; positive turns into the swing and speeds it up, negative
   * turns against it, slowing the blade and carrying it further. This is the single
   * deepest skill in Chivalry's combat and it costs nothing but the wrist. */
  applySwingTurn(turn) {
    if (this.state !== 'windup' || !this.attack) return;
    const t = Math.max(-1, Math.min(1, turn || 0));
    this.attack.turn = t;
    const turnMul = t >= 0 ? 1 - (1 - CFG.ACCEL_MIN) * t : 1 + (CFG.DRAG_MAX - 1) * (-t);
    this.attack.durMul = this.attack.baseMul * turnMul;
    this.attack.reachBonus = CFG.DRAG_REACH * Math.max(0, -t);
  }

  tryFeint(clock) {
    if (this.state !== 'windup' || !this.attack) return false;
    if (this.attack.t < CFG.FEINT_EARLIEST) return false;
    if (this.stam < CFG.FEINT_COST) return false;
    this.spend(CFG.FEINT_COST, clock);
    this.state = 'idle';
    this.tState = 0;
    this.attack = null;
    this.feintLock = CFG.FEINT_LOCK;
    this.feints++;
    this.feintAt = clock;
    return true;
  }

  startDodge(dir, clock) {
    if (!this.canAct()) return false;
    if (this.stam < CFG.DODGE_COST) return false;
    this.spend(CFG.DODGE_COST, clock);
    this.state = 'dodge';
    this.tState = 0;
    this.dodgeDir = dir;
    this.attack = null;
    this.guard = null;
    this.dodges++;
    return true;
  }

  stagger(sec) {
    this.state = 'stagger';
    this.tState = 0;
    this.forcedStagger = Math.max(this.forcedStagger, sec);
    this.attack = null;
    this.guard = null;
  }

  exhaust() {
    this.state = 'exhausted';
    this.tState = 0;
    this.stam = 0;
    this.attack = null;
    this.guard = null;
    this.guardBreaks++;
  }

  inDodgeIFrames() {
    return this.state === 'dodge' && this.tState <= CFG.DODGE_IFRAME;
  }
}

export class Duel {
  constructor(a, b, opts = {}) {
    this.a = a;
    this.b = b;
    this.clock = 0;
    this.events = [];
    this.over = false;
    this.winner = null;
    this.maxTime = opts.maxTime ?? 45;   // a duel that runs long is a draw
    /* WHO HAS THE TURN. null means neutral: nobody has landed or stopped anything
     * yet, so both men swing at full speed and the faster line wins the exchange. */
    this.turn = null;
  }

  emit(type, data = {}) { this.events.push({ t: this.clock, type, ...data }); }

  /* ONE RESOLUTION POINT. The strike is judged on the first frame of its active
   * window and never again, so a hit is a single deterministic event instead of
   * something that can double fire while two hitboxes overlap. */
  /* A PARRY THAT CATCHES NOTHING IS A MISTAKE, NOT A FREE ACTION. When a swing is
   * cancelled, anyone who pressed inside the bait window has their hands out of
   * position and stands open: guard down and unable to raise it for 280ms. Without
   * this a feint costs six stamina and buys nothing, and pure parrying has no
   * counter at all, which is the one complaint every For Honor player has. */
  resolveFeint(att, def) {
    if (!att.feintAt || att.feintAt !== this.clock) return;
    att.feintAt = 0;
    if ((def.lastPressAt ?? -99) >= this.clock - CFG.BAIT_WINDOW && def.guardUp(this.clock)) {
      def.guard = null;
      def.guardLockUntil = this.clock + CFG.BAIT_PENALTY;
      def.guardSetAt = -1;
      def.pressIsParry = false;
      def.baited = (def.baited || 0) + 1;
      this.emit('baited', { who: def.id, vs: att.id });
    }
  }

  resolveStrike(att, def) {
    /* CAPTURE THE LINE FIRST. A parry staggers the attacker, and staggering nulls his
     * attack, so reading att.attack.kind afterwards threw on EVERY successful parry and
     * killed the whole game loop. Anything read after a stagger has to be saved up front. */
    const attKind = att.attack.kind;
    const A = CFG.ATTACKS[attKind];
    const zone = att.attack.zone;
    const riposte = att.riposteUntil > this.clock;
    let dmg = A.dmg * (riposte ? CFG.RIPOSTE_MULT : 1);

    /* A COUNTER OR RIPOSTE GUARDS WHILE IT TRAVELS. The swing comes in on the same
     * line this man is already throwing and his blade eats it, for a fraction of the
     * stamina a static block would cost. Without this, being outnumbered is fatal and
     * the counter has no reason to exist. */
    if (def.state === 'windup' && def.attack && def.attack.guarded &&
        (def.attack.zone === zone || A.line === 'thrust')) {
      const chip = (CFG.BLOCK_ABSORB[attKind] ?? 8) * CFG.TRADE_ABSORB;
      def.stam = Math.max(0, def.stam - chip);
      def.lastAction = this.clock;
      this.turn = def.id;
      this.emit('guardtrade', { who: def.id, vs: att.id, zone, chip: Math.round(chip * 10) / 10 });
      return;
    }

    if (def.inDodgeIFrames()) {
      att.whiffs++;
      this.emit('dodge', { who: def.id, vs: att.id });
      return;
    }
    const blocking = def.guardUp(this.clock) && def.state !== 'stagger' && def.state !== 'exhausted';
    const zoneMatches = blocking && (def.guard === zone || A.line === 'thrust');

    if (zoneMatches) {
      const fresh = def.pressIsParry && (this.clock - (def.guardSetAt ?? -1)) <= CFG.PARRY_WINDOW;
      if (fresh) {
        /* PARRY. Costs the attacker his footing, refunds the defender's nerve, and
         * opens the riposte. This is the single most important number in the game:
         * 140ms. Longer and defence is free; shorter and it is not worth learning. */
        def.parries++;
        att.deflected++;
        att.stagger(CFG.DEFLECT_STAGGER);
        def.stam = Math.min(CFG.STAM_MAX, def.stam + CFG.PARRY_REFUND);
        def.riposteUntil = this.clock + CFG.RIPOSTE_WINDOW;
        def.blockedAt = this.clock; def.blockedKind = attKind; def.blockedZone = zone;
        this.turn = def.id;                     // the deflector takes the turn
        this.emit('parry', { who: def.id, vs: att.id, zone });
        return;
      }
      if (A.breaksBlock) {
        def.guard = null;
        def.stagger(CFG.GUARD_BREAK_STAGGER);
        this.turn = att.id;
        this.emit('guardbreak', { who: def.id, vs: att.id });
        return;
      }
      const chip = CFG.BLOCK_ABSORB[attKind] ?? 12;
      const broke = def.stam - chip <= 0;
      def.stam = Math.max(0, def.stam - chip);
      def.lastAction = this.clock;
      /* remember the line that was blocked: this is what a counter is built on */
      def.blockedAt = this.clock; def.blockedKind = attKind; def.blockedZone = zone;
      this.turn = def.id;                       // blocking takes the turn
      if (broke) {
        /* CHIVALRY'S CRUELEST RULE: block with nothing left and you DROP THE WEAPON */
        def.exhaust();
        def.disarmUntil = this.clock + CFG.DISARM_TIME;
        this.emit('disarmed', { who: def.id, vs: att.id });
      } else this.emit('block', { who: def.id, vs: att.id, zone, chip });
      return;
    }

    /* A JAB STOPS A SWING THAT IS ALREADY MOVING. It is the only cheap answer to a
     * committed heavy, and it takes the turn when it lands. */
    if (A.interrupt && (def.state === 'windup' || def.state === 'active')) {
      def.stagger(0.34);
      att.jabbed++;
      this.turn = att.id;
      this.emit('jabbed', { who: def.id, vs: att.id });
      return;
    }
    def.hp = Math.max(0, def.hp - dmg);
    att.hits++;
    this.turn = att.id;                         // landing a hit takes the turn
    this.emit('hit', { who: def.id, vs: att.id, dmg: Math.round(dmg), riposte, zone, hp: def.hp });
    if (def.hp <= 0) { this.over = true; this.winner = att; this.emit('death', { who: def.id, vs: att.id }); }
    else if (!def.guard) { def.stagger(0.22); }
  }

  step(dt, inA, inB) {
    if (this.over) return this.events;
    this.events = [];
    this.clock += dt;
    const P = [this.a, this.b];
    const I = [inA, inB];

    /* distance closes and opens with intent. Without movement there is no whiff,
     * and without whiffs there is no punishment, which is half of the skill floor. */
    /* +1 means "toward the other man". Both approaching closes twice as fast; one
     * advancing into one retreating holds the distance; both backing off opens it. */
    const closing = (I[0].move ?? 0) + (I[1].move ?? 0);
    this.dist = Math.max(0.6, Math.min(6, (this.dist ?? 3.4) - closing * CFG.MOVE_SPEED * dt));

    const pending = [];
    for (let i = 0; i < 2; i++) {
      const f = P[i], o = P[1 - i], inp = I[i];
      f.tState += dt;
      f.feintLock = Math.max(0, f.feintLock - dt);

      /* INTENT: guard is a held zone, press is the tap that starts or refreshes it. */
      if (inp.press && inp.guard && f.canAct()) f.startBlock(inp.guard, this.clock);
      else if (inp.guard && !f.guard && f.canAct()) f.startBlock(inp.guard, this.clock);
      else if (!inp.guard && f.guard) f.stopBlock();
      if (inp.dodge && !inp._dodgeLatch && f.canAct()) f.startDodge(inp.dodge, this.clock);
      if (inp.feint && !inp._feintLatch) { if (f.tryFeint(this.clock)) this.resolveFeint(f, o); }
      if (inp.attack && !inp._attackLatch) {
        f.startAttack(inp.attack, inp.zone, this.clock,
          { offTurn: this.turn !== null && this.turn !== f.id });
      }
      /* the mouse bends the swing: accel shortens it, drag stretches it */
      if (f.state === 'windup' && inp.turn) f.applySwingTurn(inp.turn);

      /* STATE MACHINE */
      if (f.state === 'stagger') {
        if (f.tState >= f.forcedStagger) { f.state = 'idle'; f.tState = 0; f.forcedStagger = 0; }
      } else if (f.state === 'exhausted') {
        if (f.tState >= CFG.EXHAUST_TIME) { f.state = 'idle'; f.tState = 0; }
      } else if (f.state === 'dodge') {
        if (f.tState >= CFG.DODGE_TIME) { f.state = 'idle'; f.tState = 0; }
      } else if (f.state === 'windup') {
        /* durMul is the swing's own clock rate: a counter or an accel runs it faster,
         * a drag or an off-turn swing runs it slower, and the VISUAL swing reads this
         * same number so what you see always matches what is being resolved */
        f.attack.t += dt / (f.attack.durMul || 1);
        if (f.attack.t >= CFG.ATTACKS[f.attack.kind].windup) {
          f.state = 'active'; f.tState = 0;
          const A = CFG.ATTACKS[f.attack.kind];
          const reach = A.reach * (1 + (f.attack.reachBonus || 0));
          /* BOTH MEN CAN BE MID-SWING. Land the blades after both have been advanced,
           * so neither side gets the first slot by array order and a simultaneous
           * exchange resolves on speed rather than on who the loop happened to visit. */
          if (!f.attack.resolved) {
            f.attack.resolved = true;
            pending.push({ f, o, reach, over: f.attack.t - CFG.ATTACKS[f.attack.kind].windup, who: f.id });
          }
        }
      } else if (f.state === 'active') {
        if (f.tState >= CFG.ATTACKS[f.lastKind ?? 'light'].active) {
          f.state = 'recover'; f.tState = 0;
          f.attack = null;
        }
      } else if (f.state === 'recover') {
        if (f.tState >= CFG.ATTACKS[f.lastKind ?? 'light'].recover) { f.state = 'idle'; f.tState = 0; }
      }

      /* STAMINA. Regeneration waits for the grace period and stops dead while a
       * guard is up, so turtling costs the same as swinging: patience is a
       * resource, not a free strategy. */
      if (f.state === 'exhausted') {
        f.stam = Math.min(CFG.STAM_MAX, f.stam + CFG.EXHAUST_REGEN * dt);
      } else if (this.clock - f.lastAction >= CFG.STAM_REGEN_DELAY) {
        const scale = f.guard ? CFG.GUARD_REGEN_SCALE : 1;
        f.stam = Math.min(CFG.STAM_MAX, f.stam + CFG.STAM_REGEN * scale * dt);
      }
    }

    /* LIVE EXCHANGE. Nobody waits their turn: if both blades finish winding on the same
     * frame, the one that ran out of windup FIRST lands first, and only an exact dead
     * heat is broken by initiative. Attacking 20 times while the other man attacks zero
     * is always legal - he just has to survive it. */
    if (pending.length) {
      if (pending.length > 1) {
        pending.sort((x, y) => (x.over - y.over) ||
          ((x.who === this.turn && y.who !== this.turn) ? -1 : (y.who === this.turn && x.who !== this.turn) ? 1 : 0));
      }
      for (const p of pending) {
        if (this.over) break;
        /* a man staggered by the blade that arrived first does not get to land his own */
        if (!p.f.attack || p.f.state !== 'active') continue;
        if (this.dist <= p.reach) this.resolveStrike(p.f, p.o);
        else { p.f.whiffs++; this.emit('outofrange', { who: p.f.id }); }
      }
      if (this.over) return this.events;
    }

    if (this.clock >= this.maxTime && !this.over) {
      this.over = true;
      this.winner = this.a.healthRatio === this.b.healthRatio ? null
        : (this.a.healthRatio > this.b.healthRatio ? this.a : this.b);
      this.emit('timeout', { winner: this.winner?.id ?? null });
    }
    return this.events;
  }
}

/* Record which attack each fighter last committed to, so recovery length is the
 * recovery of the swing actually thrown rather than a default. */
export function noteKinds(a, b, inA, inB) {
  if (inA?.attack && !inA._attackLatch) inA._lastKind = inA.attack;
  if (inB?.attack && !inB._attackLatch) inB._lastKind = inB.attack;
}

export function edgeLatch(inp) {
  inp = inp || {};
  inp._attackLatch = !!inp.attack;
  inp._feintLatch = !!inp.feint;
  inp._dodgeLatch = !!inp.dodge;
  return inp;
}
