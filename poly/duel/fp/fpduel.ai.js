/* Sparring AI. Each style is a set of numbers, not a script, so a style can be
 * tuned and re-measured. Perception is imperfect on purpose: the bot sees the
 * foe's committed attack only after a reaction delay, and it misreads the zone
 * with a probability, which is exactly the mistake a human makes. */
import { CFG } from './fpduel.core.js';

export const STYLES = {
  spammer:  { name: 'Flurry',   aggression: 0.95, feintRate: 0.00, parry: 0.00, reaction: 0.30, punish: 0.85, thrustRate: 0.05, thrustRate: 0.50, thrustRate: 0.10, thrustRate: 0.45, thrustRate: 0.08, thrustRate: 0.40, guardUp: 0.05, dodgeHeavy: 0.05, heavyRate: 0.10 },
  heaver:   { name: 'Breaker',  aggression: 0.80, feintRate: 0.05, parry: 0.20, reaction: 0.26, punish: 0.70, guardUp: 0.30, dodgeHeavy: 0.15, heavyRate: 0.75 },
  turtle:   { name: 'Warden',   aggression: 0.25, feintRate: 0.00, parry: 0.80, reaction: 0.20, punish: 0.80, guardUp: 0.85, dodgeHeavy: 0.20, heavyRate: 0.25 },
  feinter:  { name: 'Fencer',   aggression: 0.70, feintRate: 0.55, parry: 0.45, reaction: 0.24, punish: 0.80, guardUp: 0.35, dodgeHeavy: 0.25, heavyRate: 0.40 },
  blender:  { name: 'Blender',  aggression: 1.00, feintRate: 0.00, parry: 0.00, reaction: 0.40, punish: 1.00, guardUp: 0.00, dodgeHeavy: 0.00, heavyRate: 0.00 },
  /* REFERENCE DEFENDER. Near-perfect reads, used only as a measuring stick: if light
   * spam cannot beat this, defence is viable, and every other style's losses are its
   * own bad reads rather than a hole in the rules. */
  sentinel: { name: 'Sentinel', aggression: 0.40, feintRate: 0.20, parry: 1.00, reaction: 0.19, punish: 0.90, guardUp: 1.00, dodgeHeavy: 0.35, heavyRate: 0.30, thrustRate: 0.35 },
  duelist:  { name: 'Duelist',  aggression: 0.60, feintRate: 0.35, parry: 0.70, reaction: 0.21, punish: 0.85, guardUp: 0.50, dodgeHeavy: 0.30, heavyRate: 0.35 },
};

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/* A GUARD, ONCE RAISED, STAYS UP UNLESS A DECISION LOWERS IT. Without this the bot
 * built a fresh intent every tick, and the tick after the swing went from windup to
 * active carried no guard, so the guard was released on precisely the frame the
 * blade arrived: measured, 263 hits landed against 65 defences. Intent omission must
 * mean "keep doing what I was doing", never "stop". */
export function think(brain, me, foe, clock, dt, dist = 2.6) {
  const out = decide(brain, me, foe, clock, dt, dist);
  if (out.guard === undefined && me.guard) out.guard = me.guard;
  return out;
}

export function makeBrain(style, rng = Math.random) {
  return { style, rng, nextDecision: 0, feintRolled: false, targetZone: 'L', sawAttack: null, sawAt: 0 };
}

/* Returns an intent object for this fighter this tick. */
function decide(brain, me, foe, clock, dt, dist = 2.6) {
  const S = brain.style, rng = brain.rng;
  const out = {};

  /* Can't do anything while committed to a swing, staggered, dodging or spent. */
  /* DISTANCE IS A DECISION. Too far to strike means the only correct intent is to
   * walk in; too tired to trade means back off and breathe. */
  const reach = CFG.ATTACKS.light.reach;
  const lowStam = me.stam < 26;

  if (me.state === 'windup') {
    /* FENCING: cancel a windup to bait the parry. Only ever after the swing is
     * already committed and readable, which is what a feint is. */
    /* FEINT LATE, NOT EARLY. A cancel that lands before the defender has committed
     * his parry catches nothing: measured against a reader who presses 190ms into a
     * 340ms windup, an early cancel spent 8 stamina for zero effect and the
     * feint-heavy style won only 17%. A cancel past the halfway point arrives after
     * their press and takes their guard with it. */
    const wu = CFG.ATTACKS[me.attack?.kind ?? 'light'].windup;
    if (!brain.feintRolled && me.attack && me.attack.t > Math.max(CFG.FEINT_EARLIEST + 0.02, wu * 0.55)) {
      if (rng() < S.feintRate) out.feint = true;
      brain.feintRolled = true;
    }
    return out;
  }
  if (me.state !== 'idle') {
    /* still hold the guard we chose if one is up */
    if (me.guard) out.guard = me.guard;
    return out;
  }
  brain.feintRolled = false;

  /* READ THE FOE. The bot's knowledge of a committed attack is stamped with a
   * reaction delay: it only "notices" once that much time has passed. */
  /* PERCEPTION KEYS OFF THE SWING'S IDENTITY, not its elapsed time. Comparing a
   * timer that moves every tick meant the bot re-noticed the same attack 120 times
   * a second and never let its own reaction delay elapse, so it never defended at
   * all; measured, that was why light spam looked unbeatable. */
  if (foe.state === 'windup' && foe.attack) {
    if (!brain.sawAttack || brain.sawAttack.id !== foe.attack.id) {
      brain.sawAttack = { id: foe.attack.id, seenAt: clock + S.reaction,
        t0: foe.attack.t, kind: foe.attack.kind, zone: foe.attack.zone };
    }
  } else if (foe.state !== 'windup') {
    brain.sawAttack = null;
  }
  const seen = brain.sawAttack && clock >= brain.sawAttack.seenAt ? brain.sawAttack : null;
  const foeCommitted = foe.state === 'windup' || foe.state === 'active';

  /* YOU CAN SEE A SWING BEFORE YOU KNOW WHERE IT IS GOING. Zone identification is
   * gated by reaction time, but the simple fact of "he is attacking" is not. Without
   * this split the bot kept starting its own swings inside the reaction window and
   * ate the incoming hit mid-swing: measured, that alone was most of the damage that
   * made light spam look unbeatable. */
  if (foeCommitted && !seen) return out;

  if (foeCommitted && seen) {
    /* A heavy is worth dodging; a light is too fast to dodge on reaction. */
    if (seen.kind === 'heavy' && rng() < S.dodgeHeavy) {
      out.dodge = rng() < 0.5 ? 'L' : 'R';
      return out;
    }
    if (rng() < S.parry) {
      /* ONE READ PER SWING. The bot used to re-pick a zone every tick while the
       * enemy wound up, so the guard kept crossing to a new zone and was mid-travel
       * at impact: measured, a dedicated parrier recorded ZERO parries against light
       * spam and lost 85% of bouts. A commitment is made once per attack id now and
       * held until that swing resolves. */
      if (!brain.guardChoice || brain.guardChoice.id !== seen.id) {
        const correct = rng() < 0.72 + S.parry * 0.25;
        brain.guardChoice = { id: seen.id, zone: correct ? seen.zone : pick(rng, CFG.ZONES), pressed: false };
      }
      out.guard = brain.guardChoice.zone;
      /* PRESS AS SOON AS YOU REACT and let the mechanics grade it: a fast press
       * settles inside the parry window and deflects, a slower one settles early and
       * eats the swing on the guard. One timing, whole skill gradient. */
      const impactIn = CFG.ATTACKS[seen.kind].windup - brain.sawAttack.t0;
      if (!brain.guardChoice.pressed && impactIn > 0.02) { out.press = true; brain.guardChoice.pressed = true; }
      return out;
    }
    if (rng() < S.guardUp) { out.guard = rng() < 0.72 ? seen.zone : pick(rng, CFG.ZONES); out.press = true; return out; }
  }

  if (clock < brain.nextDecision) {
    if (me.guard && foeCommitted) out.guard = me.guard;
    return out;
  }

  /* PUNISH A WHIFF OR A RECOVERY. This is where a patient player earns their keep. */
  if (foe.state === 'recover' && rng() < S.punish) {
    out.guard = null;
    out.attack = rng() < 0.35 ? 'heavy' : 'light';
    out.zone = pick(rng, CFG.ZONES);
    brain.nextDecision = clock + 0.35 + rng() * 0.3;
    return out;
  }

  if (foe.state === 'stagger' && rng() < 0.85) {
    out.guard = null;
    /* the free hit. Heavy if there is time, light otherwise. */
    out.attack = 'heavy';
    out.zone = pick(rng, CFG.ZONES);
    brain.nextDecision = clock + 0.4;
    return out;
  }

  if (lowStam && rng() < 0.6) { out.move = -1; brain.nextDecision = clock + 0.25; return out; }

  /* AGAINST A RAISED GUARD, A FLAT SWING IS A GIFT. A thrust breaks a held block,
   * which is the answer to a wall that only wants to be hit. */
  if (foe.guard && rng() < (S.thrustRate ?? 0.15)) {
    out.guard = null;
    if (dist > reach * 1.05) { out.move = 1; brain.nextDecision = clock + 0.1; return out; }
    out.attack = 'thrust';
    out.zone = 'T';
    brain.nextDecision = clock + 0.35;
    return out;
  }

  if (rng() < S.aggression) {
    if (dist > reach * 0.98) { out.move = 1; brain.nextDecision = clock + 0.1; return out; }
    out.guard = null;
    out.attack = rng() < S.heavyRate ? 'heavy' : 'light';
    out.zone = pick(rng, CFG.ZONES);
    brain.nextDecision = clock + 0.3 + rng() * 0.35;
    return out;
  }

  if (rng() < S.guardUp) {
    out.guard = pick(rng, CFG.ZONES);
    out.press = true;
    brain.nextDecision = clock + 0.2 + rng() * 0.25;
    return out;
  }
  if (dist > reach * 1.15) { out.move = 1; brain.nextDecision = clock + 0.12; return out; }

  /* reset the guard so a held block does not starve the bot's own stamina */
  brain.nextDecision = clock + 0.18;
  return out;
}
