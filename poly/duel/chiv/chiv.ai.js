import { zoneOf } from './chiv.styles.js';
import { ability } from './chiv.core.js';
/* ===========================================================================
 * A CHIVALRY OPPONENT FOR THE DATA-DRIVEN CORE
 * ===========================================================================
 * It speaks the new intent shape {guard, attack, alt, feint, dodge, move} and
 * its decisions are made against the SAME table the player fights under, so it
 * can read a windup honestly: it sees which attack TYPE is coming and answers
 * with the matching counter, or a kick if you just stand there holding guard.
 *
 * It is deliberately beatable. Every reaction is gated by a delay and the
 * aggression dial, and it cannot see an attack before the windup begins.
 * =========================================================================== */

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TEMPERAMENTS = {
  /* name: how hard, how fast to answer, how often it feints, how often it kicks */
  recruit:   { aggression: 0.42, reaction: 0.42, feintChance: 0.05, kickChance: 0.12, guardChance: 0.55, label: 'RECRUIT' },
  manatarms: { aggression: 0.60, reaction: 0.30, feintChance: 0.14, kickChance: 0.22, guardChance: 0.74, label: 'MAN-AT-ARMS' },
  knight:    { aggression: 0.74, reaction: 0.22, feintChance: 0.26, kickChance: 0.34, guardChance: 0.88, label: 'KNIGHT' },
  champion:  { aggression: 0.88, reaction: 0.15, feintChance: 0.38, kickChance: 0.46, guardChance: 0.95, label: 'CHAMPION' },
};

export function makeChivBrain(weapon = 'Longsword', temperament = 'manatarms', seed = 7) {
  const t = TEMPERAMENTS[temperament] || TEMPERAMENTS.manatarms;
  return {
    weapon, ...t,
    rng: mulberry32(seed),
    seenAttack: null,        // the attack ID it has already reacted to
    reactAt: 0,              // when it is allowed to answer that attack
    nextDecision: 0,
    wantGuard: false,
    plan: 'wait',
    planUntil: 0,
    feintedThis: false,
    lastAttackName: null,
    foeSwingTimes: [], foeGuardSince: 0,
    nextJabAt: 0, nextPunish: 0, nextKickAt: 0, nextBaitAt: 0,
  };
}

const ATTACKS_BY_TYPE = {
  slash: ['Slash', 'SlashHeavy'],
  overhead: ['Overhead', 'OverheadHeavy'],
  stab: ['Stab', 'StabHeavy'],
};

export function chivThink(brain, self, foe, dist, clock, dt, style) {
  const out = {};
  if (!self || !foe) return out;
  const rng = brain.rng;

  /* ---- perceive a swing. Keyed off the ATTACK OBJECT, never a moving timer,
   * which is the trap that once made a bot re-notice one swing 120 times a
   * second and never defend. ---- */
  const fAtk = foe.attack;
  if (fAtk && fAtk !== brain.seenAttack && (foe.state === 'windup' || foe.state === 'holding')) {
    brain.seenAttack = fAtk;
    brain.reactAt = clock + brain.reaction * (0.75 + rng() * 0.5);
    brain.incomingType = fAtk.type;
    brain.foeSwingTimes = (brain.foeSwingTimes || []).filter((t) => clock - t < 1.6).concat(clock);
  }
  if (!fAtk) brain.seenAttack = null;

  const inDanger = fAtk && (foe.state === 'windup' || foe.state === 'release');
  const spammy = (brain.foeSwingTimes || []).length >= 3;   /* 3 swings inside 1.6s */
  const guardChance = spammy ? Math.min(1, brain.guardChance + 0.3) : brain.guardChance;
  const myReach = 2.25 + (brain.weapon === 'Spear' ? 0.75 : brain.weapon === 'Dagger' ? -0.75 : 0);

  /* ---- DEFEND. A guard raised inside the parry window is worth far more than a
   * static one, so it deliberately waits until the swing is nearly home. ---- */
  let guard = false;
  if (inDanger && brain.stanceFor !== fAtk) {
    brain.stanceFor = fAtk;
    const r = rng();
    brain.stance = r < guardChance * 0.5 ? 'hold' : r < guardChance ? 'parry' : 'eat';
  }
  if (inDanger && clock >= brain.reactAt) {
    const u = foe.stateDur > 0 ? foe.stateT / foe.stateDur : 1;
    const nearlyHome = foe.state === 'release' ? u > 0.15 : u > 0.55;
    if (brain.stance === 'hold') guard = true;
    else if (brain.stance === 'parry' && nearlyHome) guard = true;
    else if (brain.stance === 'eat' && nearlyHome && !self.busy && rng() < 0.55) {
      out.dodge = rng() < 0.5 ? -1 : 1;     /* footwork beats eating it */
      return out;
    }
  }

  /* ---- THE READ, for the directional styles ----
   * In a directional style the guard is worthless unless it is on the right side,
   * so the bot has to actually read the incoming cut. Its skill is its reaction
   * time: it knows which side after a fraction of that, and it gets it WRONG at a
   * rate that rises as it gets slower, which is exactly how a recruit feels. */
  let stanceOut = null;
  if (style && style.directional) {
    if (inDanger && brain.readFor !== fAtk) {
      brain.readFor = fAtk;
      const readSkill = Math.max(0.45, Math.min(0.97, 1.05 - brain.reaction * 1.1));
      brain.readRight = rng() < readSkill;
      brain.readAt = clock + brain.reaction * 0.5;
      const inc = zoneOf(foe.attack);
      const others = ['L', 'R', 'T'].filter((z) => z !== inc);
      brain.readZone = brain.readRight ? inc : others[Math.floor(rng() * others.length) % others.length];
    }
    if (inDanger && clock >= brain.readAt) stanceOut = brain.readZone;
    else stanceOut = brain.lastStance || 'T';
    if (brain.guard || guard) brain.lastStance = stanceOut;
  }
  if (!inDanger) { brain.stanceFor = null; brain.readFor = null; }
  if (stanceOut) out.stance = stanceOut;
  /* stay behind the guard for a beat after a block so the riposte window is usable */
  if (clock < self.riposteUntil) guard = false;          // drop it so the attack can fire
  if (self.guardLock > 0) guard = false;

  /* ---- COUNTER: their own rule. Block, then answer with the SAME type. ---- */
  if (clock < self.counterUntil && self.counterType && !self.busy && dist <= myReach + 0.2
      && (brain.usedCounterAt ?? -99) < self.counterUntil - 0.01) {
    const list = ATTACKS_BY_TYPE[self.counterType] || ['Slash'];
    const name = list[0];
    out.attack = name;
    out.alt = rng() < 0.5;
    brain.usedCounterAt = clock;      // remembered HERE, not by clearing the fighter's window
    brain.postureAfter = clock + 0.5; brain.posture = false;
    return out;
  }

  /* ---- RIPOSTE: any attack out of a block, their Riposte value replaces windup ---- */
  if (clock < self.riposteUntil && !self.busy && dist <= myReach + 0.2 && rng() < 0.85
      && (brain.usedRiposteAt ?? -99) < self.riposteUntil - 0.01) {
    out.attack = pick(rng, ['Slash', 'Overhead', 'Stab']);
    out.alt = rng() < 0.5;
    brain.usedRiposteAt = clock;
    brain.postureAfter = clock + 0.5; brain.posture = false;
    return out;
  }

  /* keep a guard up while in range and uncommitted, re-rolled on its own cadence
   * so it is a habit rather than a wall, and never while a parry is being set up */
  if (!inDanger && !self.busy && dist <= myReach + 0.4 && clock >= (brain.nextPosture || 0)) {
    brain.nextPosture = clock + 0.4 + rng() * 0.45;
    brain.posture = rng() < Math.min(0.92, (1 - brain.reaction) * guardChance * 1.15);
  }
  if (!inDanger && !self.busy && brain.posture && self.stam > 25
      && clock >= (brain.postureAfter || 0) && !(foe.guard && rng() < 0.7)) guard = true;

  /* DEFENCE WINS THE FRAME. Measured without this: block:0 parry:0 against a
   * spammer, because every new tactic below returned before the guard was set. */
  if (inDanger && !self.busy && clock >= brain.reactAt) {
    if (guard) {
      out.guard = true;
      if (stanceOut) out.stance = stanceOut;
      return out;
    }
    /* the read failed: give ground instead of trading into the blade */
    out.move = -1;
    out.guard = self.stam > 6;
    return out;
  }
  /* and never begin a swing while his is already live */
  if (inDanger && self.busy === 0 && foe.state === 'release') return out;

  /* ---- BREAK THE TURTLE. A held guard falls to exactly two things in their
   * game: a kick that rips it off him, or a feint he presses into. ---- */
  if (foe.guard) { if (!brain.foeGuardSince) brain.foeGuardSince = clock; }
  else brain.foeGuardSince = 0;
  if (foe.guard && !self.busy && dist <= myReach + 0.15) {
    const held = clock - (brain.foeGuardSince || clock);
    const skill = 1 - brain.reaction;
    if (held > 0.12 && clock >= (brain.nextKickAt || 0) && rng() < 0.1 + skill * 0.9) {
      brain.nextKickAt = clock + 0.6;
      out.attack = rng() < 0.6 ? 'KickLow' : 'Shove';
      out.guard = guard; if (stanceOut) out.stance = stanceOut; return out;
    }
    if (held > 0.3 && clock >= (brain.nextBaitAt || 0) && rng() < 0.6) {
      brain.nextBaitAt = clock + 1.1;
      out.attack = 'Overhead';
      out.alt = rng() < 0.5;
      brain.wantFeintAt = clock + 0.1 + rng() * 0.07;
      brain.feintedThis = false;
      out.guard = guard; if (stanceOut) out.stance = stanceOut; return out;
    }
  }

  /* ---- THE JAB. Their rule for a swing that is already coming: it interrupts it.
   * This is the answer to a man winding up in your face. ---- */
  const hasJab = !!ability(brain.weapon, 'Jab');
  if (hasJab && fAtk && foe.state === 'holding' && !self.busy && dist <= myReach
      && clock >= (brain.nextJabAt || 0) && rng() < 0.1 + (1 - brain.reaction) * 0.7) {
    out.attack = 'Jab';
    brain.nextJabAt = clock + 1.1;
    out.guard = guard; if (stanceOut) out.stance = stanceOut; return out;
  }

  /* ---- TEMPO. A man in recovery cannot defend, so the punish is to hit him
   * NOW. This is the single thing that makes an opponent feel dangerous. ---- */
  if ((foe.state === 'recovery' || foe.state === 'thwack') && !self.busy && dist <= myReach
      && foe.stateT < (foe.stateDur || 0) * 0.8 && clock >= (brain.nextPunish || 0)
      && rng() < 0.35 + (1 - brain.reaction) * 0.75) {
    brain.nextPunish = clock + 0.3;
    const r2 = rng();
    /* a man behind his shield gets KICKED, because a guard cannot stop a kick and
     * a slash is simply re-blocked the moment his recovery ends */
    out.attack = foe.guard ? 'KickLow'
      : (rng() < 0.15 + (1 - brain.reaction) * 0.5 ? (r2 < 0.5 ? 'OverheadHeavy' : 'SlashHeavy')
        : (r2 < 0.5 ? 'Slash' : r2 < 0.8 ? 'Overhead' : 'Stab'));
    out.alt = rng() < 0.5;
    out.guard = guard; if (stanceOut) out.stance = stanceOut; return out;
  }

  /* ---- the guard-break: if he is just sitting on his block, kick it off him ---- */
  if (foe.guard && clock - (foe.guardUpAt ?? 0) > 0.3 && !self.busy
      && dist <= myReach + 0.1 && rng() < brain.kickChance * dt * 4) {
    out.attack = 'KickLow';
    return out;
  }

  /* A CAMPING STANCE. Sometimes it just sits on the block and waits, which is the
   * thing the kick exists to punish. Without this the guard is only ever up while a
   * swing is already coming, so there is no moment where kicking it is possible -
   * measured 0 kicks in 160 bouts before this. */
  if (!inDanger && !self.busy && clock >= (brain.nextStance ?? 0)) {
    brain.nextStance = clock + 0.5 + rng() * 0.8;      // its own timer: sharing nextDecision
    if (rng() < 0.14) brain.campUntil = clock + 0.6 + rng() * 0.6;   // starved the attack roll
  }
  if (clock < (brain.campUntil ?? 0) && !self.busy) {
    out.guard = true;
    return out;
  }

  /* ---- ATTACK. Decided on a cadence, not every frame, so it commits. ---- */
  if (!self.busy && clock >= brain.nextDecision) {
    brain.nextDecision = clock + 0.18 + rng() * 0.35;
    const guardHeld = foe.guard && brain.foeGuardSince && clock - brain.foeGuardSince > 0.12;
    /* never swing into a man who is winding up or already live: that is a trade,
     * and a trade is a coin flip that a passive bot wins by simply not playing */
    const foeCanAnswer = foe.state === 'windup' || foe.state === 'release';
    if (dist <= myReach * 0.98 && rng() < 0.38 + brain.aggression * 0.45
        && !foeCanAnswer && !guardHeld) {
      const roll = rng();
      const openMan = !foe.guard && foe.state !== 'windup' && dist <= myReach * 0.82;
      const heavyBias = openMan ? 0.10 + (1 - brain.reaction) * 0.55 : 0.04;
      let name;
      if (roll < heavyBias) name = rng() < 0.5 ? 'SlashHeavy' : 'OverheadHeavy';
      else if (roll < heavyBias + 0.3) name = 'Slash';
      else if (roll < heavyBias + 0.52) name = 'Overhead';
      else if (roll < heavyBias + 0.76) name = 'Stab';
      else name = 'Special';
      out.attack = name;
      out.alt = rng() < 0.5;
      brain.lastAttackName = name;
      brain.feintedThis = false;
      if (self.stats && self.stats.hits > (brain.lastHitsSeen || 0)) { brain.lastHitsSeen = self.stats.hits; }
      if (clock - (brain.lastHitLandedAt || -9) < 0.4 && rng() < 1 - brain.reaction) {
        brain.nextDecision = clock;   /* follow the hit up before he resets */
      }
      /* a feint is a second input inside the chamber, which is how the game does it */
      if (rng() < brain.feintChance) brain.wantFeintAt = clock + 0.12 + rng() * 0.1;
    }
  }

  /* ---- feint the swing it already committed to ---- */
  if (brain.wantFeintAt && clock >= brain.wantFeintAt && self.attack && !brain.feintedThis) {
    out.feint = true;
    brain.feintedThis = true;
    brain.wantFeintAt = 0;
  }

  /* ---- footwork: close to reach, back off when hurt ---- */
  if (!inDanger && !self.busy) {
    if (dist > myReach * 0.85) out.move = 1;
    else if (dist < 1.15) out.move = -1;
  }

  out.guard = guard;
  return out;
}
