/* ===========================================================================
 * THREE PVP STYLES, ONE CORE
 * ===========================================================================
 * Mason: "i want 3 different models, and 3 different pvp styles, 1 chiv
 * 2 for honor 3 a true mix of both."
 *
 * These are RULE SETS, not damage tweaks. Each one changes what the defender has
 * to do, and therefore what the fight is actually about:
 *
 *   CHIVALRY  - ONE front-facing block. Direction is irrelevant to defending;
 *               direction only matters for COUNTERS. Turtling is beaten by the
 *               kick, reading is beaten by the feint. The fight is about
 *               punishing a committed swing.
 *
 *   FOR HONOR - THREE stances. You must GUARD THE SIDE THE BLADE IS COMING FROM,
 *               so the fight is a read: he chambers right, you move right. There
 *               are no counters, a parry simply guarantees a punish, and heavy
 *               overheads are UNBLOCKABLE (red) so stance-matching alone is not
 *               enough. Turtling dies to the guard break.
 *
 *   THE MIX   - For Honor's read plus Chivalry's punish, welded together so they
 *               depend on each other rather than sitting side by side: a
 *               DIRECTIONAL guard, and the counter requires BOTH the stance match
 *               AND the same attack line coming back. So the read earns the
 *               opening and the correct line cashes it. Feints are back in,
 *               because with a directional guard a feint is what punishes someone
 *               who trusts their read too early, and the guard break punishes
 *               someone who does not commit at all.
 *
 * The directional flag is the spine of it. Everything else follows from whether
 * the defender has to choose a side.
 * =========================================================================== */

/* the three stances, and how an ability maps onto one */
export function zoneOf(a) {
  if (!a) return 'T';
  if (a.name === 'Stab' || a.name === 'StabHeavy') return 'T';   /* thrusts read as top */
  if (a.dir === 'Left') return 'L';
  if (a.dir === 'Right') return 'R';
  return 'T';
}

export const STYLES = {
  chiv: {
    id: 'chiv',
    name: 'CHIVALRY',
    blurb: 'one block · counter the same type · feint and kick',
    directional: false,      /* the block does not care which way the blade comes */
    parryWindow: 0.20,
    counterBy: 'type',       /* block, then the same attack TYPE counters */
    counterWindow: 0.90,
    riposteWindow: 1.00,
    riposteFromZone: false,  /* any attack is a riposte, from anywhere */
    feint: true,
    kickBreaksGuard: true,
    unblockable: [],         /* nothing is unblockable in Chivalry */
    blockStam: 0.30,
    stamScale: 1.00,
    guardSwitchCost: 0,      /* there is nothing to switch */
    parryPunish: 0,
    counterRefund: 0,
  },

  fh: {
    id: 'fh',
    name: 'FOR HONOR',
    blurb: 'three stances · match the side · parry to punish · heavies unblockable',
    directional: true,
    parryWindow: 0.15,       /* tighter: it is a read, not a reaction */
    counterBy: 'none',       /* there are no counters, only parries */
    counterWindow: 0,
    riposteWindow: 0.85,
    riposteFromZone: true,   /* your punish has to come from the side you blocked */
    feint: false,
    kickBreaksGuard: true,   /* his guard break */
    unblockable: ['OverheadHeavy', 'Special'],
    blockStam: 0.45,
    stamScale: 1.35,         /* everything costs more, so stamina is the clock */
    guardSwitchCost: 0.10,   /* switching stance is not free */
    parryPunish: 0.55,       /* a parry staggers him long enough to answer */
    counterRefund: 0,
  },

  mix: {
    id: 'mix',
    name: 'THE MIX',
    blurb: 'three stances · stance AND line to counter · feint beats the read',
    directional: true,
    parryWindow: 0.18,
    counterBy: 'line',       /* the counter needs the same LINE, not just the type */
    counterWindow: 0.85,
    riposteWindow: 0.95,
    riposteFromZone: true,
    feint: true,             /* the feint is what punishes an early read */
    kickBreaksGuard: true,
    unblockable: [],         /* the guard break is the answer to turtling instead */
    blockStam: 0.36,
    stamScale: 1.15,
    guardSwitchCost: 0.07,
    parryPunish: 0.25,
    counterRefund: 10,       /* a correct counter pays stamina back, like Chivalry */
  },
};

export const STYLE_ORDER = ['chiv', 'fh', 'mix'];

/* the line an ability comes from, for the mix's line-matching counter */
export function lineOf(a) {
  if (!a) return 'T';
  const n = a.name || '';
  if (n === 'Stab' || n === 'StabHeavy') return 'thrust';
  if (a.dir === 'Right') return 'R';
  if (a.dir === 'Left') return 'L';
  return 'T';
}

export function styleById(id) {
  return STYLES[id] || STYLES.chiv;
}

/* one honest sentence per style, for the HUD, so the difference is not hidden */
export function styleRule(style) {
  if (style.id === 'chiv') return 'BLOCK ANY SIDE · COUNTER SAME TYPE';
  if (style.id === 'fh') return 'GUARD THE SIDE HE CUTS · HEAVY IS UNBLOCKABLE';
  return 'GUARD THE SIDE, THEN ANSWER THE LINE';
}
