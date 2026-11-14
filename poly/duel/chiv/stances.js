/* ===========================================================================
 * STANCES — one authored pose for every stance the combat rules can ask for
 * ===========================================================================
 * Mason: "Do a pose for them for like every stance you know what I mean."
 *
 * The rules (chiv.data.js) know 18 ability verbs, and each verb runs four phases.
 * Before this file only FOUR arcs existed (Left, Right, Down, T) with two keys
 * each, so every attack in the game looked like one of four swings. Here every
 * verb gets its own geometry, and the attacks that matter get three keys
 * (chamber, mid, strike) instead of two, because the midpoint is what makes an
 * arc READ: a two-key swing is a straight line between two poses and looks like
 * a hinge.
 *
 * BONE SIGN CONVENTIONS (measured, see verify_stances.mjs):
 *   The man faces +Z. Arms hang down each bone's -Y.
 *     arm.X negative   -> the whole arm lifts FORWARD
 *     arm.X very neg   -> overhead (-2.3 is straight up and slightly back)
 *     arm.Z positive   -> the hand swings OUTBOARD (his right, +X)
 *     arm.Z negative   -> the hand swings ACROSS the body (his left, -X)
 *     arm.Y            -> twist about the arm's own length (sets the blade plane)
 *     fore.X negative  -> the elbow BENDS
 *     thigh.X negative -> the leg swings forward; shin.X positive -> knee bends
 *   Chivalry's own rule: a LEFT attack is one whose blade travels RIGHT TO LEFT,
 *   so a left cut must CHAMBER on his right (+Z) and strike toward -X.
 *
 * A stance is a sparse map of bone -> [x,y,z] radians laid over GUARD, plus an
 * optional hips drop. Nothing here touches geometry, so a stance can never break
 * skinning, and applying one is a pure pose write.
 * =========================================================================== */
import * as THREE from 'three';

const mix = (a, b, t) => a + (b - a) * t;
const T = (a, b, c) => [a, b, c];
const lerp3 = (p, q, t) => [mix(p[0], q[0], t), mix(p[1], q[1], t), mix(p[2], q[2], t)];

/* ------------------------------------------------------------------ GUARD
 * The pose every other stance is a deviation from: weight on the back foot,
 * shield up, sword low and outboard, knees soft, both feet on the ground. */
export const GUARD_BONES = {
  hips:      T(0.00,  0.10,  0.00),
  spine:     T(0.03,  0.14,  0.00),
  chest:     T(0.02,  0.10,  0.00),
  neck:      T(0.00,  0.00,  0.00),
  head:      T(-0.03, -0.14, 0.00),
  'clav.R':  T(0.00,  0.00,  0.10),
  'arm.R':   T(-0.34,  0.22, -0.18),
  'fore.R':  T(-0.92,  0.00,  0.00),
  'hand.R':  T(0.00,  0.00,  0.00),
  'clav.L':  T(0.00,  0.00, -0.06),
  'arm.L':   T(-0.66,  0.06,  0.30),
  'fore.L':  T(-1.42,  0.00,  0.00),
  'hand.L':  T(0.00,  0.00,  0.00),
  'thigh.L': T(-0.20,  0.04,  0.10),
  'shin.L':  T(0.30,  0.00,  0.00),
  'foot.L':  T(-0.10,  0.06,  0.00),
  'thigh.R': T(0.16, -0.04, -0.12),
  'shin.R':  T(0.24,  0.00,  0.00),
  'foot.R':  T(-0.08, -0.06,  0.00),
};
export const GUARD_HIPS = -0.035;
export const GUARD_POSE = { bones: GUARD_BONES, hips: GUARD_HIPS };

/* merge a sparse override over GUARD */
function P(over = {}, hips = GUARD_HIPS) {
  return { bones: Object.assign({}, GUARD_BONES, over), hips };
}

/* ===========================================================================
 * THE FOUR ATTACK LINES, three keys each, light and heavy
 * ===========================================================================
 * chamber -> he has wound the blade back and AWAY from the line of travel
 * mid     -> the half-way key, which is what gives the arc its belly
 * strike  -> the blade has passed through the target; this is the hit pose
 * =========================================================================== */
const LINES = {
  /* LEFT: chamber outboard on his right (+Z), cross the body toward his left (-X) */
  Left: {
    light: {
      chamber: P({ 'arm.R': T(-0.42, 0.62, -0.30), 'fore.R': T(-1.34, 0, 0), chest: T(0.02, 0.42, 0.00), spine: T(0.03, 0.26, 0), head: T(-0.02, -0.30, 0) }),
      mid:     P({ 'arm.R': T(-1.18, 0.30, -0.18), 'fore.R': T(-0.62, 0, 0), chest: T(0.02, 0.16, 0.00), spine: T(0.03, 0.10, 0), head: T(-0.02, -0.10, 0) }),
      strike:  P({ 'arm.R': T(-1.34, -0.34, -1.02), 'fore.R': T(-0.26, 0, 0), chest: T(0.02, -0.34, 0.00), spine: T(0.03, -0.22, 0), head: T(-0.02, 0.24, 0), 'thigh.L': T(-0.34, 0.04, 0.10) }),
    },
    heavy: {
      chamber: P({ 'arm.R': T(-0.22, 0.78, -0.46), 'fore.R': T(-1.62, 0, 0), chest: T(0.00, 0.62, 0.00), spine: T(0.02, 0.38, 0), hips: T(0.00, 0.20, 0), head: T(-0.02, -0.44, 0), 'thigh.R': T(0.10, -0.04, -0.16) }, -0.055),
      mid:     P({ 'arm.R': T(-1.16, 0.36, -0.32), 'fore.R': T(-0.70, 0, 0), chest: T(0.01, 0.22, 0.00), spine: T(0.03, 0.14, 0), hips: T(0.00, 0.08, 0) }, -0.05),
      strike:  P({ 'arm.R': T(-1.40, -0.48, -1.16), 'fore.R': T(-0.20, 0, 0), chest: T(0.02, -0.50, 0.00), spine: T(0.03, -0.32, 0), hips: T(0.00, -0.16, 0), head: T(-0.02, 0.34, 0), 'thigh.L': T(-0.42, 0.04, 0.12) }, -0.075),
    },
  },
  /* RIGHT: chamber across the body on his left (-Z), cut outward to his right (+Z) */
  Right: {
    light: {
      chamber: P({ 'arm.R': T(-0.60, -0.52, -0.34), 'fore.R': T(-1.60, 0, 0), chest: T(0.02, -0.30, 0.00), spine: T(0.03, -0.20, 0), head: T(-0.02, 0.22, 0) }),
      mid:     P({ 'arm.R': T(-1.08, -0.20, 0.10), 'fore.R': T(-0.58, 0, 0), chest: T(0.02, -0.08, 0.00), spine: T(0.03, -0.04, 0) }),
      strike:  P({ 'arm.R': T(-1.18, 0.30, 0.94), 'fore.R': T(-0.24, 0, 0), chest: T(0.02, 0.30, 0.00), spine: T(0.03, 0.18, 0), head: T(-0.02, -0.20, 0), 'thigh.R': T(0.24, -0.04, -0.14) }),
    },
    heavy: {
      chamber: P({ 'arm.R': T(-0.48, -0.66, -0.54), 'fore.R': T(-1.78, 0, 0), chest: T(0.00, -0.48, 0.00), spine: T(0.02, -0.30, 0), hips: T(0.00, -0.16, 0), head: T(-0.02, 0.34, 0), 'thigh.L': T(-0.14, 0.04, 0.14) }, -0.055),
      mid:     P({ 'arm.R': T(-1.06, -0.22, 0.24), 'fore.R': T(-0.64, 0, 0), chest: T(0.01, -0.10, 0.00), spine: T(0.03, -0.05, 0) }, -0.05),
      strike:  P({ 'arm.R': T(-1.24, 0.42, 1.14), 'fore.R': T(-0.18, 0, 0), chest: T(0.02, 0.48, 0.00), spine: T(0.03, 0.30, 0), hips: T(0.00, 0.18, 0), head: T(-0.02, -0.32, 0), 'thigh.R': T(0.32, -0.04, -0.16) }, -0.075),
    },
  },
  /* DOWN: overhead. Chamber high and behind, strike straight down to the waist */
  Down: {
    light: {
      chamber: P({ 'arm.R': T(-2.24, 0.12, -0.10), 'fore.R': T(-1.24, 0, 0), chest: T(-0.08, 0.14, 0.00), spine: T(-0.06, 0.10, 0), head: T(0.04, -0.10, 0) }),
      mid:     P({ 'arm.R': T(-1.62, 0.06, -0.06), 'fore.R': T(-0.62, 0, 0), chest: T(0.02, 0.08, 0.00), spine: T(0.02, 0.06, 0) }),
      strike:  P({ 'arm.R': T(-0.52, -0.02, -0.04), 'fore.R': T(-0.14, 0, 0), chest: T(0.14, -0.08, 0.00), spine: T(0.12, -0.06, 0), head: T(-0.10, 0.08, 0), 'thigh.L': T(-0.30, 0.04, 0.10) }, -0.05),
    },
    heavy: {
      chamber: P({ 'arm.R': T(-2.54, 0.14, -0.12), 'fore.R': T(-1.50, 0, 0), chest: T(-0.16, 0.16, 0.00), spine: T(-0.12, 0.12, 0), head: T(0.08, -0.12, 0), 'thigh.R': T(0.22, -0.04, -0.12) }, -0.03),
      mid:     P({ 'arm.R': T(-1.70, 0.06, -0.06), 'fore.R': T(-0.68, 0, 0), chest: T(0.02, 0.08, 0.00), spine: T(0.02, 0.06, 0) }, -0.06),
      strike:  P({ 'arm.R': T(-0.30, -0.02, -0.04), 'fore.R': T(-0.10, 0, 0), chest: T(0.24, -0.10, 0.00), spine: T(0.22, -0.08, 0), head: T(-0.16, 0.10, 0), 'thigh.L': T(-0.44, 0.04, 0.12), 'thigh.R': T(0.28, -0.04, -0.14) }, -0.105),
    },
  },
  /* THRUST: straight forward. Chamber drawn back, strike extended */
  T: {
    light: {
      chamber: P({ 'arm.R': T(-0.86, 0.24, -0.24), 'fore.R': T(-1.86, 0, 0), chest: T(0.02, 0.18, 0.00), spine: T(0.03, 0.12, 0), head: T(-0.02, -0.14, 0), 'thigh.R': T(0.22, -0.04, -0.12) }),
      mid:     P({ 'arm.R': T(-1.16, 0.16, -0.14), 'fore.R': T(-1.10, 0, 0), chest: T(0.04, 0.08, 0.00), spine: T(0.05, 0.06, 0) }),
      strike:  P({ 'arm.R': T(-1.46, 0.04, -0.06), 'fore.R': T(-0.12, 0, 0), chest: T(0.08, -0.06, 0.00), spine: T(0.08, -0.04, 0), head: T(-0.06, 0.06, 0), 'thigh.L': T(-0.34, 0.04, 0.10), 'thigh.R': T(0.26, -0.04, -0.12) }, -0.05),
    },
    heavy: {
      chamber: P({ 'arm.R': T(-0.70, 0.32, -0.32), 'fore.R': T(-2.04, 0, 0), chest: T(0.00, 0.30, 0.00), spine: T(0.02, 0.20, 0), hips: T(0.00, 0.14, 0), head: T(-0.02, -0.24, 0), 'thigh.R': T(0.28, -0.04, -0.12) }, -0.05),
      mid:     P({ 'arm.R': T(-1.18, 0.18, -0.16), 'fore.R': T(-1.16, 0, 0), chest: T(0.05, 0.10, 0.00), spine: T(0.06, 0.08, 0) }, -0.05),
      strike:  P({ 'arm.R': T(-1.52, 0.02, -0.04), 'fore.R': T(-0.08, 0, 0), chest: T(0.12, -0.10, 0.00), spine: T(0.12, -0.06, 0), hips: T(0.00, -0.06, 0), head: T(-0.08, 0.08, 0), 'thigh.L': T(-0.44, 0.04, 0.10), 'thigh.R': T(0.34, -0.04, -0.14) }, -0.085),
    },
  },
};

/* ===========================================================================
 * THE REST OF THE VERBS. These are attacks whose body language is nothing like
 * a sword cut, so each is authored by hand rather than derived.
 * =========================================================================== */
const VERBS = {
  /* SPECIAL: the two-handed overhead smash. Biggest wind, biggest landing. */
  Special: {
    label: 'Special (two-handed smash)', group: 'attack', line: 'Down',
    chamber: P({ 'arm.R': T(-2.70, 0.20, -0.16), 'fore.R': T(-1.70, 0, 0), 'arm.L': T(-2.20, -0.20, 0.30), 'fore.L': T(-1.30, 0, 0), chest: T(-0.22, 0.10, 0.00), spine: T(-0.16, 0.08, 0), head: T(0.12, -0.08, 0) }, -0.02),
    mid:     P({ 'arm.R': T(-1.60, 0.06, -0.08), 'fore.R': T(-0.60, 0, 0), 'arm.L': T(-1.40, -0.10, 0.24), 'fore.L': T(-0.70, 0, 0), chest: T(0.06, 0.05, 0.00), spine: T(0.06, 0.04, 0) }, -0.08),
    strike:  P({ 'arm.R': T(-0.14, -0.02, -0.04), 'fore.R': T(-0.08, 0, 0), 'arm.L': T(-0.30, -0.04, 0.22), 'fore.L': T(-0.20, 0, 0), chest: T(0.34, -0.06, 0.00), spine: T(0.30, -0.04, 0), head: T(-0.22, 0.06, 0), 'thigh.L': T(-0.56, 0.04, 0.12), 'thigh.R': T(0.34, -0.04, -0.16) }, -0.155),
  },
  /* JAB: the free (shield) hand snaps out. Small damage, fast. */
  Jab: {
    label: 'Jab', group: 'attack', line: 'T', limb: 'L',
    chamber: P({ 'arm.L': T(-0.80, 0.10, 0.44), 'fore.L': T(-1.72, 0, 0), chest: T(0.02, 0.22, 0.00), spine: T(0.03, 0.14, 0) }),
    mid:     P({ 'arm.L': T(-1.24, 0.04, 0.24), 'fore.L': T(-0.72, 0, 0), chest: T(0.03, 0.08, 0.00), spine: T(0.04, 0.06, 0) }),
    strike:  P({ 'arm.L': T(-1.62, -0.02, 0.12), 'fore.L': T(-0.12, 0, 0), chest: T(0.05, -0.14, 0.00), spine: T(0.06, -0.10, 0), head: T(-0.04, 0.10, 0), 'thigh.L': T(-0.30, 0.04, 0.10) }, -0.04),
  },
  /* SHOVE: both arms drive forward, shield leading, hips behind it. */
  Shove: {
    label: 'Shove', group: 'attack', line: 'T', limb: 'LR',
    chamber: P({ 'arm.L': T(-0.72, 0.06, 0.34), 'fore.L': T(-1.60, 0, 0), 'arm.R': T(-0.46, 0.18, -0.22), 'fore.R': T(-1.20, 0, 0), chest: T(0.04, 0.12, 0.00), spine: T(0.06, 0.08, 0) }, -0.06),
    mid:     P({ 'arm.L': T(-1.20, 0.04, 0.20), 'fore.L': T(-0.86, 0, 0), 'arm.R': T(-0.90, 0.10, -0.14), 'fore.R': T(-0.80, 0, 0), chest: T(0.10, 0.04, 0.00), spine: T(0.10, 0.02, 0) }, -0.08),
    strike:  P({ 'arm.L': T(-1.52, 0.00, 0.14), 'fore.L': T(-0.24, 0, 0), 'arm.R': T(-1.24, 0.02, -0.06), 'fore.R': T(-0.34, 0, 0), chest: T(0.22, -0.06, 0.00), spine: T(0.20, -0.04, 0), head: T(-0.14, 0.04, 0), 'thigh.L': T(-0.46, 0.04, 0.10), 'thigh.R': T(0.30, -0.04, -0.12) }, -0.115),
  },
  /* KICKLOW: right leg drives forward under a braced torso. Breaks a held guard. */
  KickLow: {
    label: 'KickLow', group: 'attack', line: 'T', limb: 'R',
    chamber: P({ 'thigh.R': T(-0.96, -0.06, -0.10), 'shin.R': T(1.34, 0, 0), 'foot.R': T(-0.24, 0, 0), chest: T(-0.04, 0.06, 0.00), spine: T(-0.08, 0.04, 0), hips: T(-0.06, 0.04, 0.00), head: T(0.04, -0.04, 0), 'arm.L': T(-0.80, 0.10, 0.40), 'fore.L': T(-1.50, 0, 0) }, -0.03),
    mid:     P({ 'thigh.R': T(-0.78, -0.06, -0.08), 'shin.R': T(0.62, 0, 0), 'foot.R': T(-0.30, 0, 0), chest: T(-0.10, 0.04, 0.00), spine: T(-0.14, 0.02, 0), hips: T(-0.10, 0.02, 0.00) }, -0.03),
    strike:  P({ 'thigh.R': T(-0.62, -0.06, -0.06), 'shin.R': T(0.10, 0, 0), 'foot.R': T(-0.38, 0, 0), chest: T(-0.16, 0.02, 0.00), spine: T(-0.20, 0.02, 0), hips: T(-0.14, 0.00, 0.00), 'arm.L': T(-0.86, 0.10, 0.42), 'fore.L': T(-1.44, 0, 0), 'thigh.L': T(-0.10, 0.04, 0.10) }, -0.02),
  },
  /* HEADBUTT: short, ugly, all in the neck and chest. */
  Headbutt: {
    label: 'Headbutt', group: 'attack', line: 'T',
    chamber: P({ neck: T(0.22, 0, 0), head: T(0.16, -0.10, 0), chest: T(-0.10, 0.16, 0.00), spine: T(-0.08, 0.10, 0) }, -0.02),
    mid:     P({ neck: T(-0.10, 0, 0), head: T(-0.04, 0.04, 0), chest: T(0.10, 0.02, 0.00), spine: T(0.08, 0.02, 0) }, -0.04),
    strike:  P({ neck: T(-0.34, 0, 0), head: T(-0.22, 0.10, 0), chest: T(0.26, -0.08, 0.00), spine: T(0.22, -0.06, 0), 'thigh.L': T(-0.34, 0.04, 0.10) }, -0.07),
  },
  /* THROW: the weapon leaves the hand. Cocked over the shoulder, released forward. */
  Throw: {
    label: 'Throw', group: 'attack', line: 'T',
    chamber: P({ 'arm.R': T(-1.96, 0.30, 0.10), 'fore.R': T(-1.66, 0, 0), chest: T(-0.10, 0.32, 0.00), spine: T(-0.06, 0.20, 0), hips: T(0.00, 0.12, 0), head: T(0.06, -0.20, 0), 'thigh.R': T(0.24, -0.04, -0.12) }),
    mid:     P({ 'arm.R': T(-1.52, 0.16, 0.02), 'fore.R': T(-0.90, 0, 0), chest: T(0.02, 0.14, 0.00), spine: T(0.02, 0.08, 0) }),
    strike:  P({ 'arm.R': T(-1.30, 0.00, -0.06), 'fore.R': T(-0.10, 0, 0), chest: T(0.16, -0.14, 0.00), spine: T(0.14, -0.10, 0), head: T(-0.10, 0.12, 0), 'thigh.L': T(-0.36, 0.04, 0.10) }, -0.05),
  },
  /* SPRINTATTACK: a running diagonal cut that ends in a lunge. */
  SprintAttack: {
    label: 'SprintAttack', group: 'attack', line: 'Left',
    chamber: P({ 'arm.R': T(-1.10, 0.70, -0.26), 'fore.R': T(-1.50, 0, 0), chest: T(0.02, 0.52, 0.06), spine: T(0.10, 0.32, 0.04), hips: T(0.02, 0.22, 0.00), head: T(-0.06, -0.36, 0), 'thigh.L': T(-0.72, 0.04, 0.10), 'shin.L': T(0.42, 0, 0), 'thigh.R': T(0.44, -0.04, -0.12), 'shin.R': T(0.34, 0, 0) }, -0.075),
    mid:     P({ 'arm.R': T(-1.52, 0.28, -0.20), 'fore.R': T(-0.70, 0, 0), chest: T(0.10, 0.18, 0.02), spine: T(0.16, 0.12, 0), 'thigh.L': T(-0.86, 0.04, 0.10), 'shin.L': T(0.30, 0, 0), 'thigh.R': T(0.56, -0.04, -0.12), 'shin.R': T(0.52, 0, 0) }, -0.10),
    strike:  P({ 'arm.R': T(-1.46, -0.40, -1.08), 'fore.R': T(-0.22, 0, 0), chest: T(0.16, -0.40, -0.04), spine: T(0.22, -0.26, -0.02), hips: T(0.04, -0.16, 0.00), head: T(-0.10, 0.28, 0), 'thigh.L': T(-1.02, 0.04, 0.12), 'shin.L': T(0.26, 0, 0), 'foot.L': T(-0.16, 0.06, 0), 'thigh.R': T(0.62, -0.04, -0.14), 'shin.R': T(0.66, 0, 0) }, -0.145),
  },
  /* SPRINT SHOVE: shoulder down, both arms tucked, a body check. */
  SprintShove: {
    label: 'SprintShove', group: 'attack', line: 'T',
    chamber: P({ 'arm.L': T(-0.90, 0.06, 0.30), 'fore.L': T(-1.70, 0, 0), 'arm.R': T(-0.40, 0.20, -0.16), 'fore.R': T(-1.10, 0, 0), chest: T(0.16, 0.14, 0.00), spine: T(0.20, 0.10, 0), head: T(-0.12, -0.10, 0), 'thigh.L': T(-0.66, 0.04, 0.10), 'shin.L': T(0.38, 0, 0) }, -0.07),
    mid:     P({ 'arm.L': T(-1.34, 0.02, 0.20), 'fore.L': T(-0.90, 0, 0), 'arm.R': T(-0.92, 0.10, -0.10), 'fore.R': T(-0.70, 0, 0), chest: T(0.28, 0.06, 0.00), spine: T(0.32, 0.04, 0), head: T(-0.20, -0.04, 0), 'thigh.L': T(-0.90, 0.04, 0.10), 'shin.L': T(0.30, 0, 0), 'thigh.R': T(0.50, -0.04, -0.12) }, -0.11),
    strike:  P({ 'arm.L': T(-1.56, 0.00, 0.14), 'fore.L': T(-0.30, 0, 0), 'arm.R': T(-1.20, 0.02, -0.06), 'fore.R': T(-0.40, 0, 0), chest: T(0.40, -0.04, 0.00), spine: T(0.42, -0.02, 0), head: T(-0.26, 0.02, 0), 'thigh.L': T(-1.06, 0.04, 0.12), 'shin.L': T(0.24, 0, 0), 'thigh.R': T(0.60, -0.04, -0.14), 'shin.R': T(0.60, 0, 0) }, -0.155),
  },
};

/* ===========================================================================
 * STATES: the poses that are not attacks. Guarding, being hit, dying, and the
 * things a body does when it is not fighting at all.
 * =========================================================================== */
const STATES = {
  Guard: { label: 'Guard (block)', bones: P({ 'arm.L': T(-1.16, 0.10, 0.26), 'fore.L': T(-1.90, 0, 0), 'hand.L': T(0, 0, 0.30), 'arm.R': T(-0.30, 0.30, -0.26), 'fore.R': T(-1.10, 0, 0), chest: T(0.04, 0.24, 0.00), spine: T(0.06, 0.16, 0), head: T(-0.04, -0.18, 0), 'thigh.L': T(-0.26, 0.04, 0.10), 'shin.L': T(0.36, 0, 0) }, -0.075) },
  BlockImpact: { label: 'Block impact', bones: P({ 'arm.L': T(-1.34, 0.16, 0.10), 'fore.L': T(-2.16, 0, 0), 'arm.R': T(-0.18, 0.34, -0.30), 'fore.R': T(-0.90, 0, 0), chest: T(-0.20, 0.34, 0.06), spine: T(-0.16, 0.22, 0.04), hips: T(-0.08, 0.18, 0.00), head: T(0.14, -0.26, 0), 'thigh.L': T(-0.16, 0.04, 0.10), 'shin.L': T(0.44, 0, 0), 'thigh.R': T(0.26, -0.04, -0.12), 'shin.R': T(0.34, 0, 0) }, -0.095) },
  Riposte: { label: 'Riposte', bones: P({ 'arm.L': T(-1.26, 0.22, 0.02), 'fore.L': T(-1.96, 0, 0), 'arm.R': T(-0.46, 0.56, -0.34), 'fore.R': T(-1.40, 0, 0), chest: T(0.02, 0.44, 0.00), spine: T(0.04, 0.28, 0), head: T(-0.02, -0.30, 0) }, -0.06) },
  Counter: { label: 'Counter', bones: P({ 'arm.L': T(-1.20, 0.18, 0.16), 'fore.L': T(-1.86, 0, 0), 'arm.R': T(-1.28, 0.24, -0.20), 'fore.R': T(-1.16, 0, 0), chest: T(0.06, 0.30, 0.00), spine: T(0.06, 0.20, 0), head: T(-0.04, -0.22, 0) }, -0.065) },
  Feint: { label: 'Feint (broken chamber)', bones: P({ 'arm.R': T(-1.02, 0.52, -0.52), 'fore.R': T(-0.72, 0, 0), 'arm.L': T(-0.80, 0.10, 0.30), 'fore.L': T(-1.34, 0, 0), chest: T(0.00, 0.30, -0.04), spine: T(0.02, 0.20, 0), head: T(-0.02, -0.20, 0) }, -0.05) },
  Parry: { label: 'Parry', bones: P({ 'arm.R': T(-1.34, 0.40, -0.16), 'fore.R': T(-1.42, 0, 0), 'arm.L': T(-1.10, 0.14, 0.22), 'fore.L': T(-1.74, 0, 0), chest: T(0.04, 0.34, 0.00), spine: T(0.04, 0.22, 0), head: T(-0.04, -0.24, 0) }, -0.07) },
  Stagger: { label: 'Stagger (hit reaction)', bones: P({ 'arm.R': T(0.28, 0.20, -0.34), 'fore.R': T(-0.42, 0, 0), 'arm.L': T(0.20, 0.04, 0.40), 'fore.L': T(-0.56, 0, 0), chest: T(-0.22, -0.16, 0.08), spine: T(-0.18, -0.12, 0.06), hips: T(-0.10, -0.10, 0.04), neck: T(0.18, 0, 0), head: T(0.24, -0.20, 0), 'thigh.L': T(0.20, 0.04, 0.12), 'shin.L': T(0.18, 0, 0), 'thigh.R': T(0.34, -0.04, -0.14), 'shin.R': T(0.42, 0, 0), 'foot.R': T(-0.16, -0.06, 0) }, -0.10) },
  Dodge: { label: 'Dodge (step off the line)', bones: P({ 'arm.R': T(-0.20, 0.26, -0.30), 'fore.R': T(-1.30, 0, 0), 'arm.L': T(-0.94, 0.08, 0.34), 'fore.L': T(-1.60, 0, 0), chest: T(0.06, 0.14, -0.16), spine: T(0.08, 0.10, -0.12), hips: T(0.04, 0.06, -0.10), head: T(-0.04, -0.10, 0.06), 'thigh.L': T(-0.50, 0.04, 0.26), 'shin.L': T(0.62, 0, 0), 'thigh.R': T(0.30, -0.04, -0.24), 'shin.R': T(0.54, 0, 0) }, -0.14) },
  Taunt: { label: 'Taunt', bones: P({ 'arm.R': T(-2.60, 0.10, -0.16), 'fore.R': T(-0.62, 0, 0), 'arm.L': T(-0.34, 0.06, 0.70), 'fore.L': T(-0.90, 0, 0), chest: T(-0.16, 0.06, 0.00), spine: T(-0.12, 0.04, 0), neck: T(-0.10, 0, 0), head: T(-0.18, -0.10, 0) }, -0.01) },
  Fatigue: { label: 'Weapon low (fatigue)', bones: P({ 'arm.R': T(0.10, 0.24, -0.30), 'fore.R': T(-0.50, 0, 0), 'arm.L': T(-0.44, 0.10, 0.36), 'fore.L': T(-1.10, 0, 0), chest: T(0.10, 0.10, 0.00), spine: T(0.14, 0.08, 0), head: T(-0.10, -0.08, 0) }, -0.06) },
  Death: { label: 'Death (collapsed)', bones: P({ 'arm.L': T(0.46, 0.10, 0.62), 'fore.L': T(-0.40, 0, 0), 'arm.R': T(0.30, -0.10, -0.72), 'fore.R': T(-0.30, 0, 0), chest: T(0.18, -0.10, 0.10), spine: T(0.24, -0.06, 0.08), neck: T(0.30, 0, 0), head: T(0.36, 0.26, 0), 'thigh.L': T(-0.50, 0.04, 0.16), 'shin.L': T(1.30, 0, 0), 'thigh.R': T(-0.16, -0.04, -0.16), 'shin.R': T(1.10, 0, 0) }, -0.76) },
};


/* ===========================================================================
 * GROUND LOCK. A pose that drops the feet below the floor is a bug you only see
 * once the man stands on something, so measure it rather than eyeball it: the
 * sole sits 30mm under the toe bone, so if the lowest toe is below that the whole
 * figure gets lifted by exactly the difference. Death is included on purpose,
 * because a corpse that sinks through the floor is the worst version of this.
 * =========================================================================== */
const _gv = new THREE.Vector3();
export function lowestPoint(rig) {
  let low = Infinity;
  for (const n of ['toe.L', 'toe.R', 'foot.L', 'foot.R']) {
    const b = rig.byName.get(n);
    if (!b) continue;
    b.getWorldPosition(_gv);
    if (_gv.y < low) low = _gv.y;
  }
  return low === Infinity ? 0 : low;
}
export const SOLE_OFFSET = 0.030;
export function groundFix(rig, group) {
  /* the group must be zeroed and updated BEFORE measuring, or the previous
   * stance's lift is still baked into the world matrices and the correction is
   * applied twice (which reads as a man slowly sinking through the floor) */
  const g = group || rig.root;
  g.position.y = 0;
  g.updateMatrixWorld(true);
  const lift = Math.max(0, SOLE_OFFSET - lowestPoint(rig));
  g.position.y = lift;
  g.updateMatrixWorld(true);
  return lift;
}

/* ===========================================================================
 * THE PUBLIC TABLE
 * =========================================================================== */
export const STANCES = [];
function add(s) { STANCES.push(s); return s; }

const LINE_LABEL = { Left: 'left cut', Right: 'right cut', Down: 'overhead', T: 'thrust' };
const VERB_OF = { Left: 'Slash', Right: 'Slash', Down: 'Overhead', T: 'Stab' };

for (const line of ['Left', 'Right', 'Down', 'T']) {
  for (const amp of ['light', 'heavy']) {
    const verb = VERB_OF[line] + (amp === 'heavy' ? 'Heavy' : '');
    const L = LINES[line][amp];
    add({
      id: verb + ':' + line,
      label: verb + ' · ' + LINE_LABEL[line] + (line === 'Right' ? ' (alt)' : ''),
      group: 'attack', verb, line, amp,
      poses: { chamber: L.chamber, mid: L.mid, strike: L.strike },
    });
  }
}
for (const [name, v] of Object.entries(VERBS)) {
  add({
    id: name, label: v.label, group: 'attack', verb: name,
    line: v.line, limb: v.limb || 'R', amp: 'light',
    poses: { chamber: v.chamber, mid: v.mid, strike: v.strike },
  });
}
for (const [name, s] of Object.entries(STATES)) {
  add({ id: name, label: s.label, group: 'state', verb: name, poses: { hold: s.bones } });
}

export const LOCOMOTION = [
  { id: 'idle', label: 'Idle' }, { id: 'walk', label: 'Walk' },
  { id: 'march', label: 'March' }, { id: 'charge', label: 'Charge' },
];

export const stanceById = (id) => STANCES.find((s) => s.id === id);

/* ===========================================================================
 * APPLY. Writes a stance onto a rig. `w` blends from whatever animate() left
 * (the locomotion base) into the stance, so a walking man can guard.
 * =========================================================================== */
export function applyPose(rig, pose, w = 1) {
  if (!rig || !pose) return rig;
  const B = rig.byName;
  for (const [name, v] of Object.entries(pose.bones || {})) {
    const b = B.get(name);
    if (!b) continue;
    if (w >= 0.999) b.rotation.set(v[0], v[1], v[2]);
    else b.rotation.set(
      mix(b.rotation.x, v[0], w), mix(b.rotation.y, v[1], w), mix(b.rotation.z, v[2], w),
    );
  }
  const hips = B.get('hips');
  if (hips && pose.hips) hips.position.y = hips.userData.abs.y + pose.hips * w;
  return rig;
}

/* blend between two authored poses, used for chamber -> mid -> strike */
export function blendPose(a, b, t) {
  if (!a) return b; if (!b) return a;
  const bones = {};
  const names = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)]);
  for (const n of names) {
    const pa = a.bones[n] || GUARD_BONES[n] || [0, 0, 0];
    const pb = b.bones[n] || GUARD_BONES[n] || [0, 0, 0];
    bones[n] = lerp3(pa, pb, t);
  }
  return { bones, hips: mix(a.hips || 0, b.hips || 0, t) };
}

/* The pose a stance shows at a normalised point in one of its phases. This is
 * the single lookup that the third-person body and the review sheet share. */
export function poseAt(stance, phase, u = 1) {
  if (!stance) return null;
  const ps = stance.poses;
  if (ps.hold) return ps.hold;
  if (phase === 'holding' || phase === 'hold') return ps.chamber;
  if (phase === 'windup' || phase === 'wind' || phase === 'chamber') return ps.chamber;
  if (phase === 'release' || phase === 'rel') {
    return u < 0.5 ? blendPose(ps.chamber, ps.mid, u / 0.5) : blendPose(ps.mid, ps.strike, (u - 0.5) / 0.5);
  }
  if (phase === 'recovery' || phase === 'rec') {
    /* settle back toward guard, never all the way: he is still committed */
    return blendPose(ps.strike, GUARD_POSE, Math.min(1, u) * 0.85);
  }
  return ps.strike || ps.hold || ps.chamber;
}

/* which stance a core Fighter's current attack maps to. The core names the
 * ability (Slash/Overhead/Stab/...) and flags Direction/AltDirection; the stance
 * table is keyed by both, so this is a pure lookup and never guesses. */
export function stanceForAttack(att) {
  if (!att) return stanceById('Guard');
  const name = att.name || 'Slash';
  const dir = att.dir || 'None';
  const heavy = name.endsWith('Heavy');
  const base = name.replace(/Heavy$/, '');
  if (base === 'Slash') {
    const line = dir === 'Right' ? 'Right' : 'Left';
    return stanceById((heavy ? 'SlashHeavy' : 'Slash') + ':' + line);
  }
  if (base === 'Overhead') return stanceById((heavy ? 'OverheadHeavy' : 'Overhead') + ':Down');
  if (base === 'Stab') return stanceById((heavy ? 'StabHeavy' : 'Stab') + ':T');
  if (base === 'Throw') return stanceById('Throw');
  if (base === 'Special') return stanceById('Special');
  if (base === 'Jab' || base === 'Headbutt') return stanceById(base);
  if (base === 'Shove') return stanceById('Shove');
  if (base === 'KickLow') return stanceById('KickLow');
  if (base === 'SprintAttack') return stanceById('SprintAttack');
  if (base === 'SprintShove') return stanceById('SprintShove');
  if (base === 'SprintCharge') return stanceById('SprintShove');
  if (base === 'InitiativeAttack') return stanceById('Slash:Left');
  return stanceById('Slash:Left');
}
