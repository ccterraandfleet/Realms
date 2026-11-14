/* ===========================================================================
 * STANCES — poses authored as HANDS AND BLADES IN SPACE, solved by IK
 * ===========================================================================
 * Mason on the first attempt: "arms are either behind the head, there's massive
 * clipping, or it just looks bad." He was right, and the cause was the authoring
 * method, not the individual numbers.
 *
 * V1 authored raw Euler triples per arm bone. That cannot work: the shoulder is a
 * ball joint written as three angles, so past about -1.6 rad the arm stops going
 * forward and goes OVER the head instead, and a large Y twist re-aims the X lift
 * into a different plane. Every pose was a guess about which way the numbers
 * would open, and the guesses compounded.
 *
 * V2, here: a pose states WHERE THE WRIST IS (in metres, in chest space) and
 * WHICH WAY THE BLADE POINTS. A two-bone IK solver turns that into the shoulder
 * and elbow rotations, so:
 *   - a hand can never end up behind his head unless I literally type a negative
 *     Z coordinate, and the verifier fails the build if I do;
 *   - the blade direction is authored, not inferred, so a cut travels where it is
 *     meant to travel;
 *   - chamber -> mid -> strike interpolates in TARGET SPACE, which means the hand
 *     follows a real arc through real space instead of lerping three angles.
 *
 * COORDINATES. Chest space: origin at the sternum (1.30 m up), +X his right,
 * +Y up, +Z the way he faces. The right shoulder sits at (0.196, 0.135, 0), the
 * left at (-0.196, 0.135, 0), and each arm reaches 0.535 m, so any target further
 * than that from its shoulder is clamped by the solver rather than silently
 * over-extending.
 * =========================================================================== */
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const T = (a, b, c) => [a, b, c];
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/* ------------------------------------------------------------------ TORSO
 * Everything that is NOT the arms is still authored as angles, because a spine
 * and a pair of legs genuinely are hinge stacks. Arms are the only ball joints. */
export const GUARD_BONES = {
  hips:      T(0.00,  0.00,  0.00),
  spine:     T(0.03,  0.08,  0.00),
  chest:     T(0.02,  0.04,  0.00),
  neck:      T(0.00,  0.00,  0.00),
  head:      T(-0.03, -0.12, 0.00),
  'clav.R':  T(0.00,  0.00,  0.04),
  'clav.L':  T(0.00,  0.00, -0.04),
  'thigh.L': T(-0.20,  0.04,  0.10),
  'shin.L':  T(0.30,  0.00,  0.00),
  'foot.L':  T(-0.10,  0.06,  0.00),
  'thigh.R': T(0.16, -0.04, -0.12),
  'shin.R':  T(0.24,  0.00,  0.00),
  'foot.R':  T(-0.08, -0.06,  0.00),
};
export const GUARD_HIPS = -0.035;

/* elbow hints: where the arm is allowed to bend toward. The right elbow points
 * outboard and down, the left likewise, which is how a human arm goes. */
const POLE_R = T(0.80, -0.45, -0.20);
const POLE_L = T(-0.80, -0.45, -0.20);

/* the blade's rest direction inside the hand's own frame, measured off the
 * geometry in soldier.js (grip at the hand's origin, blade along +Y with a
 * 0.22 rad forward and 0.20 rad outboard tilt) */
export const BLADE_LOCAL = new THREE.Vector3(0.194, 0.957, 0.218).normalize();
export const BLADE_LENGTH = 0.84;

/* the pose builder. Torso angles + two hand targets + two blade directions. */
function P(o = {}) {
  return {
    bones: Object.assign({}, GUARD_BONES, o.bones || {}),
    ik: {
      R: { hand: o.rHand, blade: o.rBlade, pole: o.rPole || POLE_R },
      L: { hand: o.lHand, blade: o.lBlade || T(0, 0.3, 0.95), pole: o.lPole || POLE_L },
    },
    hips: o.hips != null ? o.hips : GUARD_HIPS,
  };
}
/* helper: spread a total twist across spine and chest so no single joint wrings */
const twist = (t) => ({ spine: T(0.03, t * 0.6, 0), chest: T(0.02, t * 0.4, 0) });
/* helper: lean forward (positive) with a corresponding hip shift */
const lean = (l) => ({ spine: T(0.03 + l * 0.55, 0, 0), chest: T(0.02 + l * 0.45, 0, 0) });

/* ===========================================================================
 * GUARD — the home pose everything is a deviation from
 * =========================================================================== */
const GUARD = P({
  rHand: T(0.19, -0.18, 0.26), rBlade: T(0.12, 0.74, 0.66),
  lHand: T(-0.06, -0.14, 0.34),
  bones: Object.assign({}, twist(0.16), lean(0.02)),
});
export const GUARD_POSE = GUARD;

/* ===========================================================================
 * THE FOUR ATTACK LINES, three keys each, light and heavy
 * ===========================================================================
 * Chivalry's definition, obeyed literally: a LEFT attack is one whose blade
 * travels RIGHT TO LEFT, so the left cut chambers outboard on his right and
 * finishes across his body on the left.
 * =========================================================================== */
const LINES = {
  Left: {
    light: {
      chamber: P({
        rHand: T(0.33, 0.09, 0.10), rBlade: T(0.62, 0.75, -0.22),
        lHand: T(-0.02, -0.10, 0.36),
        bones: Object.assign({}, twist(0.42), lean(0.0)),
      }),
      mid: P({
        rHand: T(0.26, 0.02, 0.40), rBlade: T(0.34, 0.62, 0.70),
        lHand: T(-0.06, -0.12, 0.36),
        bones: Object.assign({}, twist(0.10), lean(0.04)),
      }),
      strike: P({
        rHand: T(-0.10, -0.04, 0.36), rBlade: T(-0.72, 0.50, 0.48),
        lHand: T(-0.16, -0.16, 0.28),
        bones: Object.assign({}, twist(-0.34), lean(0.06), {
          'thigh.L': T(-0.34, 0.04, 0.10), 'shin.L': T(0.26, 0, 0),
        }),
        hips: -0.05,
      }),
    },
    heavy: {
      chamber: P({
        rHand: T(0.36, 0.16, 0.04), rBlade: T(0.66, 0.68, -0.32),
        lHand: T(0.00, -0.06, 0.34),
        bones: Object.assign({}, twist(0.58), lean(-0.04), {
          'thigh.R': T(0.10, -0.04, -0.16),
        }),
        hips: -0.055,
      }),
      mid: P({
        rHand: T(0.28, 0.06, 0.40), rBlade: T(0.36, 0.58, 0.73),
        lHand: T(-0.04, -0.10, 0.36),
        bones: Object.assign({}, twist(0.14), lean(0.06)),
        hips: -0.05,
      }),
      strike: P({
        rHand: T(-0.14, -0.08, 0.38), rBlade: T(-0.76, 0.40, 0.51),
        lHand: T(-0.18, -0.18, 0.26),
        bones: Object.assign({}, twist(-0.46), lean(0.10), {
          'thigh.L': T(-0.44, 0.04, 0.12), 'shin.L': T(0.30, 0, 0),
          'thigh.R': T(0.26, -0.04, -0.14),
        }),
        hips: -0.08,
      }),
    },
  },
  Right: {
    light: {
      chamber: P({
        rHand: T(-0.02, 0.06, 0.20), rBlade: T(-0.55, 0.78, 0.30),
        lHand: T(-0.18, -0.12, 0.28),
        bones: Object.assign({}, twist(-0.42), lean(0.0)),
      }),
      mid: P({
        rHand: T(0.16, 0.00, 0.42), rBlade: T(0.20, 0.58, 0.79),
        lHand: T(-0.10, -0.14, 0.30),
        bones: Object.assign({}, twist(0.06), lean(0.04)),
      }),
      strike: P({
        rHand: T(0.36, -0.02, 0.30), rBlade: T(0.80, 0.45, 0.40),
        lHand: T(0.02, -0.16, 0.28),
        bones: Object.assign({}, twist(0.44), lean(0.05), {
          'thigh.R': T(0.24, -0.04, -0.14), 'shin.R': T(0.28, 0, 0),
        }),
        hips: -0.05,
      }),
    },
    heavy: {
      chamber: P({
        rHand: T(-0.06, 0.12, 0.16), rBlade: T(-0.60, 0.72, 0.36),
        lHand: T(-0.20, -0.10, 0.26),
        bones: Object.assign({}, twist(-0.58), lean(-0.04), {
          'thigh.L': T(-0.14, 0.04, 0.14),
        }),
        hips: -0.055,
      }),
      mid: P({
        rHand: T(0.16, 0.02, 0.44), rBlade: T(0.22, 0.52, 0.82),
        lHand: T(-0.12, -0.12, 0.30),
        bones: Object.assign({}, twist(0.08), lean(0.06)),
        hips: -0.05,
      }),
      strike: P({
        rHand: T(0.38, -0.04, 0.28), rBlade: T(0.84, 0.36, 0.40),
        lHand: T(0.00, -0.18, 0.26),
        bones: Object.assign({}, twist(0.56), lean(0.09), {
          'thigh.R': T(0.32, -0.04, -0.16), 'shin.R': T(0.34, 0, 0),
          'thigh.L': T(-0.16, 0.04, 0.12),
        }),
        hips: -0.08,
      }),
    },
  },
  /* OVERHEAD: chamber with the hands up in front of the forehead and the blade
   * tipped BACK over the shoulder, then straight down the centre line. The hands
   * stay at positive Z throughout: that is the difference between a wind-up and
   * the "arm behind the head" mess. */
  Down: {
    light: {
      chamber: P({
        rHand: T(0.17, 0.38, 0.21), rBlade: T(0.06, 0.44, -0.90),
        lHand: T(-0.04, -0.04, 0.34),
        bones: Object.assign({}, twist(0.12), lean(-0.06)),
      }),
      mid: P({
        rHand: T(0.14, 0.16, 0.34), rBlade: T(0.04, -0.30, 0.95),
        lHand: T(-0.06, -0.10, 0.34),
        bones: Object.assign({}, twist(0.05), lean(0.06)),
      }),
      strike: P({
        rHand: T(0.16, -0.12, 0.44), rBlade: T(0.00, -0.62, 0.78),
        lHand: T(-0.10, -0.18, 0.28),
        bones: Object.assign({}, twist(-0.06), lean(0.14), {
          'thigh.L': T(-0.30, 0.04, 0.10), 'shin.L': T(0.26, 0, 0),
        }),
        hips: -0.06,
      }),
    },
    heavy: {
      chamber: P({
        rHand: T(0.15, 0.46, 0.18), rBlade: T(0.05, 0.38, -0.92),
        lHand: T(-0.02, 0.02, 0.32),
        bones: Object.assign({}, twist(0.14), lean(-0.14), {
          'thigh.R': T(0.22, -0.04, -0.12),
        }),
        hips: -0.04,
      }),
      mid: P({
        rHand: T(0.12, 0.18, 0.36), rBlade: T(0.03, -0.34, 0.94),
        lHand: T(-0.06, -0.08, 0.34),
        bones: Object.assign({}, twist(0.06), lean(0.06)),
        hips: -0.06,
      }),
      strike: P({
        rHand: T(0.18, -0.20, 0.42), rBlade: T(0.00, -0.70, 0.71),
        lHand: T(-0.12, -0.22, 0.26),
        bones: Object.assign({}, twist(-0.08), lean(0.22), {
          'thigh.L': T(-0.44, 0.04, 0.12), 'shin.L': T(0.32, 0, 0),
          'thigh.R': T(0.28, -0.04, -0.14),
        }),
        hips: -0.11,
      }),
    },
  },
  /* STAB: chamber drawn back at the ribs with the blade already pointing at him,
   * then straight forward along the chest line. */
  T: {
    light: {
      chamber: P({
        rHand: T(0.26, -0.06, -0.06), rBlade: T(0.03, 0.12, 0.99),
        lHand: T(-0.02, -0.10, 0.34),
        bones: Object.assign({}, twist(0.26), lean(-0.02), {
          'thigh.R': T(0.22, -0.04, -0.12),
        }),
      }),
      mid: P({
        rHand: T(0.22, -0.04, 0.18), rBlade: T(0.01, 0.08, 1.00),
        lHand: T(-0.06, -0.12, 0.32),
        bones: Object.assign({}, twist(0.10), lean(0.05)),
      }),
      strike: P({
        rHand: T(0.16, -0.02, 0.42), rBlade: T(0.00, 0.06, 1.00),
        lHand: T(-0.12, -0.16, 0.26),
        bones: Object.assign({}, twist(-0.14), lean(0.10), {
          'thigh.L': T(-0.34, 0.04, 0.10), 'shin.L': T(0.24, 0, 0),
          'thigh.R': T(0.26, -0.04, -0.12),
        }),
        hips: -0.05,
      }),
    },
    heavy: {
      chamber: P({
        rHand: T(0.28, -0.08, -0.10), rBlade: T(0.04, 0.16, 0.99),
        lHand: T(0.00, -0.08, 0.32),
        bones: Object.assign({}, twist(0.34), lean(-0.06), {
          'thigh.R': T(0.28, -0.04, -0.12),
        }),
        hips: -0.05,
      }),
      mid: P({
        rHand: T(0.22, -0.04, 0.18), rBlade: T(0.02, 0.10, 1.00),
        lHand: T(-0.06, -0.12, 0.30),
        bones: Object.assign({}, twist(0.12), lean(0.06)),
        hips: -0.05,
      }),
      strike: P({
        rHand: T(0.14, 0.00, 0.46), rBlade: T(0.00, 0.04, 1.00),
        lHand: T(-0.14, -0.18, 0.24),
        bones: Object.assign({}, twist(-0.20), lean(0.14), {
          'thigh.L': T(-0.44, 0.04, 0.10), 'shin.L': T(0.28, 0, 0),
          'thigh.R': T(0.34, -0.04, -0.14),
        }),
        hips: -0.085,
      }),
    },
  },
};

/* ===========================================================================
 * THE OTHER ATTACK VERBS. Different body language, same authoring method.
 * =========================================================================== */
const VERBS = {
  Special: {
    label: 'Special (two-handed smash)', group: 'attack', line: 'Down',
    chamber: P({
      rHand: T(0.13, 0.42, 0.24), rBlade: T(0.04, 0.40, -0.91),
      lHand: T(0.02, 0.34, 0.26),
      bones: Object.assign({}, twist(0.08), lean(-0.18), {
        'thigh.R': T(0.20, -0.04, -0.12),
      }), hips: -0.03,
    }),
    mid: P({
      rHand: T(0.11, 0.20, 0.34), rBlade: T(0.02, -0.22, 0.98),
      lHand: T(-0.02, 0.16, 0.36),
      bones: Object.assign({}, twist(0.04), lean(0.06)), hips: -0.08,
    }),
    strike: P({
      rHand: T(0.12, -0.24, 0.44), rBlade: T(0.00, -0.78, 0.62),
      lHand: T(-0.04, -0.22, 0.42),
      bones: Object.assign({}, twist(-0.04), lean(0.24), {
        'thigh.L': T(-0.56, 0.04, 0.12), 'shin.L': T(0.34, 0, 0),
        'thigh.R': T(0.34, -0.04, -0.16),
      }), hips: -0.15,
    }),
  },
  Jab: {
    label: 'Jab (shield hand)', group: 'attack', line: 'T',
    chamber: P({
      rHand: T(0.20, -0.16, 0.24), rBlade: T(0.15, 0.72, 0.68),
      lHand: T(-0.14, -0.06, 0.16),
      bones: Object.assign({}, twist(0.18), lean(0.02)), hips: -0.04,
    }),
    mid: P({
      rHand: T(0.19, -0.15, 0.26), rBlade: T(0.14, 0.72, 0.68),
      lHand: T(-0.10, -0.06, 0.34),
      bones: Object.assign({}, twist(0.06), lean(0.05)), hips: -0.05,
    }),
    strike: P({
      rHand: T(0.18, -0.14, 0.28), rBlade: T(0.12, 0.72, 0.68),
      lHand: T(-0.08, -0.04, 0.46),
      bones: Object.assign({}, twist(-0.12), lean(0.08), {
        'thigh.L': T(-0.30, 0.04, 0.10), 'shin.L': T(0.24, 0, 0),
      }), hips: -0.06,
    }),
  },
  Shove: {
    label: 'Shove (both hands)', group: 'attack', line: 'T',
    chamber: P({
      rHand: T(0.16, -0.14, 0.22), rBlade: T(0.20, 0.70, 0.68),
      lHand: T(-0.10, -0.12, 0.26),
      bones: Object.assign({}, twist(0.10), lean(0.04)), hips: -0.07,
    }),
    mid: P({
      rHand: T(0.14, -0.10, 0.34), rBlade: T(0.16, 0.68, 0.72),
      lHand: T(-0.10, -0.08, 0.38),
      bones: Object.assign({}, twist(0.05), lean(0.10)), hips: -0.09,
    }),
    strike: P({
      rHand: T(0.12, -0.08, 0.44), rBlade: T(0.12, 0.66, 0.74),
      lHand: T(-0.10, -0.06, 0.48),
      bones: Object.assign({}, twist(-0.06), lean(0.18), {
        'thigh.L': T(-0.46, 0.04, 0.10), 'shin.L': T(0.28, 0, 0),
        'thigh.R': T(0.30, -0.04, -0.12),
      }), hips: -0.12,
    }),
  },
  KickLow: {
    label: 'KickLow (boot to the guard)', group: 'attack', line: 'T',
    chamber: P({
      rHand: T(0.20, -0.16, 0.24), rBlade: T(0.14, 0.72, 0.68),
      lHand: T(-0.06, -0.12, 0.32),
      bones: Object.assign({}, twist(0.10), lean(-0.06), {
        'thigh.R': T(-0.96, -0.06, -0.10), 'shin.R': T(1.34, 0, 0), 'foot.R': T(-0.24, 0, 0),
      }), hips: -0.03,
    }),
    mid: P({
      rHand: T(0.20, -0.16, 0.24), rBlade: T(0.14, 0.72, 0.68),
      lHand: T(-0.06, -0.12, 0.32),
      bones: Object.assign({}, twist(0.08), lean(-0.10), {
        'thigh.R': T(-0.78, -0.06, -0.08), 'shin.R': T(0.62, 0, 0), 'foot.R': T(-0.30, 0, 0),
      }), hips: -0.03,
    }),
    strike: P({
      rHand: T(0.20, -0.16, 0.24), rBlade: T(0.14, 0.72, 0.68),
      lHand: T(-0.06, -0.12, 0.32),
      bones: Object.assign({}, twist(0.06), lean(-0.14), {
        'thigh.R': T(-0.62, -0.06, -0.06), 'shin.R': T(0.10, 0, 0), 'foot.R': T(-0.38, 0, 0),
        'thigh.L': T(-0.10, 0.04, 0.10),
      }), hips: -0.02,
    }),
  },
  Headbutt: {
    label: 'Headbutt', group: 'attack', line: 'T',
    chamber: P({
      rHand: T(0.20, -0.16, 0.24), rBlade: T(0.14, 0.72, 0.68),
      lHand: T(-0.08, -0.12, 0.30),
      bones: Object.assign({}, twist(0.14), lean(-0.08), {
        neck: T(0.22, 0, 0), head: T(0.16, -0.10, 0),
      }), hips: -0.02,
    }),
    mid: P({
      rHand: T(0.20, -0.16, 0.26), rBlade: T(0.14, 0.72, 0.68),
      lHand: T(-0.08, -0.12, 0.32),
      bones: Object.assign({}, twist(0.08), lean(0.08), {
        neck: T(-0.10, 0, 0), head: T(-0.04, 0.04, 0),
      }), hips: -0.04,
    }),
    strike: P({
      rHand: T(0.20, -0.16, 0.28), rBlade: T(0.14, 0.72, 0.68),
      lHand: T(-0.08, -0.12, 0.34),
      bones: Object.assign({}, twist(-0.10), lean(0.20), {
        neck: T(-0.34, 0, 0), head: T(-0.22, 0.10, 0),
        'thigh.L': T(-0.34, 0.04, 0.10), 'shin.L': T(0.24, 0, 0),
      }), hips: -0.07,
    }),
  },
  Throw: {
    label: 'Throw', group: 'attack', line: 'T',
    chamber: P({
      rHand: T(0.27, 0.24, 0.10), rBlade: T(0.14, 0.62, -0.77),
      lHand: T(-0.10, -0.10, 0.26),
      bones: Object.assign({}, twist(0.34), lean(-0.06), {
        'thigh.R': T(0.24, -0.04, -0.12),
      }), hips: -0.04,
    }),
    mid: P({
      rHand: T(0.20, 0.18, 0.20), rBlade: T(0.06, 0.30, 0.95),
      lHand: T(-0.10, -0.10, 0.30),
      bones: Object.assign({}, twist(0.16), lean(0.02)), hips: -0.05,
    }),
    strike: P({
      rHand: T(0.14, 0.06, 0.42), rBlade: T(0.02, -0.06, 1.00),
      lHand: T(-0.12, -0.14, 0.26),
      bones: Object.assign({}, twist(-0.14), lean(0.12), {
        'thigh.L': T(-0.36, 0.04, 0.10), 'shin.L': T(0.24, 0, 0),
      }), hips: -0.06,
    }),
  },
  SprintAttack: {
    label: 'SprintAttack (running cut)', group: 'attack', line: 'Left',
    chamber: P({
      rHand: T(0.34, 0.16, 0.06), rBlade: T(0.60, 0.72, -0.35),
      lHand: T(-0.02, -0.06, 0.30),
      bones: Object.assign({}, twist(0.50), lean(0.10), {
        'thigh.L': T(-0.72, 0.04, 0.10), 'shin.L': T(0.42, 0, 0),
        'thigh.R': T(0.44, -0.04, -0.12), 'shin.R': T(0.34, 0, 0),
      }), hips: -0.075,
    }),
    mid: P({
      rHand: T(0.28, 0.04, 0.38), rBlade: T(0.35, 0.55, 0.76),
      lHand: T(-0.06, -0.10, 0.30),
      bones: Object.assign({}, twist(0.12), lean(0.16), {
        'thigh.L': T(-0.86, 0.04, 0.10), 'shin.L': T(0.30, 0, 0),
        'thigh.R': T(0.56, -0.04, -0.12), 'shin.R': T(0.52, 0, 0),
      }), hips: -0.10,
    }),
    strike: P({
      rHand: T(-0.10, -0.06, 0.36), rBlade: T(-0.70, 0.42, 0.58),
      lHand: T(-0.16, -0.18, 0.24),
      bones: Object.assign({}, twist(-0.42), lean(0.22), {
        'thigh.L': T(-1.02, 0.04, 0.12), 'shin.L': T(0.26, 0, 0), 'foot.L': T(-0.16, 0.06, 0),
        'thigh.R': T(0.62, -0.04, -0.14), 'shin.R': T(0.66, 0, 0),
      }), hips: -0.145,
    }),
  },
  SprintShove: {
    label: 'SprintShove (body check)', group: 'attack', line: 'T',
    chamber: P({
      rHand: T(0.18, -0.10, 0.24), rBlade: T(0.20, 0.68, 0.70),
      lHand: T(-0.10, -0.08, 0.28),
      bones: Object.assign({}, twist(0.12), lean(0.16), {
        'thigh.L': T(-0.66, 0.04, 0.10), 'shin.L': T(0.38, 0, 0),
      }), hips: -0.07,
    }),
    mid: P({
      rHand: T(0.16, -0.08, 0.34), rBlade: T(0.16, 0.66, 0.74),
      lHand: T(-0.10, -0.06, 0.38),
      bones: Object.assign({}, twist(0.06), lean(0.30), {
        'thigh.L': T(-0.90, 0.04, 0.10), 'shin.L': T(0.30, 0, 0),
        'thigh.R': T(0.50, -0.04, -0.12),
      }), hips: -0.11,
    }),
    strike: P({
      rHand: T(0.14, -0.06, 0.44), rBlade: T(0.12, 0.64, 0.76),
      lHand: T(-0.10, -0.04, 0.48),
      bones: Object.assign({}, twist(-0.04), lean(0.42), {
        'thigh.L': T(-1.06, 0.04, 0.12), 'shin.L': T(0.24, 0, 0), 'foot.L': T(-0.16, 0.06, 0),
        'thigh.R': T(0.60, -0.04, -0.14), 'shin.R': T(0.60, 0, 0),
      }), hips: -0.155,
    }),
  },
};

/* ===========================================================================
 * STATES — the poses that are not attacks
 * =========================================================================== */
const STATES = {
  Guard: {
    label: 'Guard (block)',
    pose: P({
      rHand: T(0.20, -0.12, 0.26), rBlade: T(0.14, 0.76, 0.64),
      lHand: T(-0.08, -0.02, 0.34),
      bones: Object.assign({}, twist(0.18), lean(0.02), {
        'thigh.L': T(-0.26, 0.04, 0.10), 'shin.L': T(0.36, 0, 0),
      }), hips: -0.075,
    }),
  },
  BlockImpact: {
    label: 'Block impact',
    pose: P({
      rHand: T(0.22, -0.06, 0.20), rBlade: T(0.16, 0.74, 0.66),
      lHand: T(-0.02, 0.02, 0.20),
      bones: Object.assign({}, twist(0.30), lean(-0.16), {
        neck: T(0.12, 0, 0), head: T(0.14, -0.20, 0),
        'thigh.L': T(-0.16, 0.04, 0.10), 'shin.L': T(0.44, 0, 0),
        'thigh.R': T(0.26, -0.04, -0.12), 'shin.R': T(0.34, 0, 0),
      }), hips: -0.095,
    }),
  },
  Riposte: {
    label: 'Riposte',
    pose: P({
      rHand: T(0.30, 0.10, 0.14), rBlade: T(0.55, 0.78, -0.20),
      lHand: T(-0.16, 0.04, 0.32),
      bones: Object.assign({}, twist(0.38), lean(0.02)), hips: -0.06,
    }),
  },
  Counter: {
    label: 'Counter',
    pose: P({
      rHand: T(0.14, 0.06, 0.30), rBlade: T(0.10, 0.74, 0.66),
      lHand: T(-0.10, 0.00, 0.32),
      bones: Object.assign({}, twist(0.26), lean(0.04)), hips: -0.065,
    }),
  },
  Feint: {
    label: 'Feint (broken chamber)',
    pose: P({
      rHand: T(0.28, 0.10, 0.26), rBlade: T(0.55, 0.60, 0.58),
      lHand: T(-0.10, -0.08, 0.32),
      bones: Object.assign({}, twist(0.30), lean(0.02)), hips: -0.05,
    }),
  },
  Parry: {
    label: 'Parry',
    pose: P({
      rHand: T(0.10, 0.14, 0.34), rBlade: T(-0.30, 0.86, 0.42),
      lHand: T(-0.12, 0.02, 0.30),
      bones: Object.assign({}, twist(0.30), lean(0.0)), hips: -0.07,
    }),
  },
  Stagger: {
    label: 'Stagger (hit reaction)',
    pose: P({
      rHand: T(0.34, -0.02, 0.10), rBlade: T(0.40, 0.60, -0.60),
      lHand: T(-0.26, 0.02, 0.16),
      bones: Object.assign({}, twist(-0.18), lean(-0.20), {
        neck: T(0.18, 0, 0), head: T(0.24, -0.20, 0),
        'thigh.L': T(0.20, 0.04, 0.12), 'shin.L': T(0.18, 0, 0),
        'thigh.R': T(0.34, -0.04, -0.14), 'shin.R': T(0.42, 0, 0), 'foot.R': T(-0.16, -0.06, 0),
      }), hips: -0.10,
    }),
  },
  Dodge: {
    label: 'Dodge (step off the line)',
    pose: P({
      rHand: T(0.18, -0.20, 0.24), rBlade: T(0.20, 0.70, 0.68),
      lHand: T(-0.10, -0.18, 0.30),
      bones: Object.assign({}, twist(0.12), lean(0.08), {
        'thigh.L': T(-0.50, 0.04, 0.26), 'shin.L': T(0.62, 0, 0),
        'thigh.R': T(0.30, -0.04, -0.24), 'shin.R': T(0.54, 0, 0),
      }), hips: -0.14,
    }),
  },
  Taunt: {
    label: 'Taunt',
    pose: P({
      rHand: T(0.16, 0.46, 0.14), rBlade: T(0.06, 0.96, 0.28),
      lHand: T(-0.28, -0.06, 0.24),
      bones: Object.assign({}, twist(0.06), lean(-0.12), {
        neck: T(-0.10, 0, 0), head: T(-0.18, -0.10, 0),
      }), hips: -0.01,
    }),
  },
  Fatigue: {
    label: 'Weapon low (fatigue)',
    pose: P({
      rHand: T(0.22, -0.32, 0.16), rBlade: T(0.12, 0.62, 0.78),
      lHand: T(-0.12, -0.28, 0.24),
      bones: Object.assign({}, twist(0.08), lean(0.12)), hips: -0.06,
    }),
  },
  Death: {
    label: 'Death (collapsed)',
    pose: P({
      rHand: T(0.30, -0.30, 0.20), rBlade: T(0.60, 0.35, 0.72),
      lHand: T(-0.24, -0.26, 0.18),
      bones: Object.assign({}, twist(-0.10), lean(0.24), {
        neck: T(0.30, 0, 0), head: T(0.36, 0.26, 0),
        'thigh.L': T(-0.50, 0.04, 0.16), 'shin.L': T(1.30, 0, 0),
        'thigh.R': T(-0.16, -0.04, -0.16), 'shin.R': T(1.10, 0, 0),
      }), hips: -0.76,
    }),
  },
};

/* ===========================================================================
 * TWO-BONE IK. Given a wrist target and a blade direction in CHEST space,
 * solve the shoulder and elbow so the hand lands there, then aim the wrist so
 * the blade points where it was told to.
 * =========================================================================== */
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const REST = new Map();

function restOf(rig, side) {
  if (REST.has(side)) return REST.get(side);
  const B = rig.byName;
  const arm = B.get('arm.' + side), fore = B.get('fore.' + side), hand = B.get('hand.' + side);
  if (!arm || !fore || !hand) return null;
  const a = arm.userData.abs, f = fore.userData.abs, h = hand.userData.abs;
  const uArm = new THREE.Vector3(f.x - a.x, f.y - a.y, f.z - a.z);
  const uFore = new THREE.Vector3(h.x - f.x, h.y - f.y, h.z - f.z);
  const L1 = uArm.length(), L2 = uFore.length();
  const r = { uArm: uArm.normalize(), uFore: uFore.normalize(), L1, L2 };
  REST.set(side, r);
  return r;
}

export function solveArm(rig, side, spec) {
  const B = rig.byName;
  const arm = B.get('arm.' + side), fore = B.get('fore.' + side), hand = B.get('hand.' + side);
  const chest = B.get('chest');
  const rest = restOf(rig, side);
  if (!arm || !fore || !hand || !chest || !rest || !spec || !spec.hand) return;

  rig.root.updateMatrixWorld(true);
  const cm = chest.matrixWorld;

  /* shoulder and target, in world space */
  const S = arm.getWorldPosition(new THREE.Vector3());
  const Tw = V3(spec.hand).applyMatrix4(cm);
  const poleW = V3(spec.pole || (side === 'R' ? POLE_R : POLE_L)).transformDirection(cm);

  /* clamp to what the arm can actually reach, so an over-ambitious target
   * straightens the arm instead of tearing the elbow */
  const d = Tw.clone().sub(S);
  let dist = d.length();
  const minD = Math.abs(rest.L1 - rest.L2) + 0.02;
  const maxD = rest.L1 + rest.L2 - 0.012;
  if (dist < 1e-5) return;
  dist = clamp(dist, minD, maxD);
  const dir = d.clone().normalize();

  /* elbow sits at `dist` along the line, rotated toward the pole hint */
  const toPole = poleW.clone().sub(dir.clone().multiplyScalar(poleW.dot(dir)));
  if (toPole.lengthSq() < 1e-6) toPole.set(0, 1, 0);
  toPole.normalize();
  const cosA = clamp((rest.L1 * rest.L1 + dist * dist - rest.L2 * rest.L2) / (2 * rest.L1 * dist), -1, 1);
  const A = Math.acos(cosA);
  const elbowDir = dir.clone().multiplyScalar(Math.cos(A)).add(toPole.clone().multiplyScalar(Math.sin(A)));
  const E = S.clone().add(elbowDir.multiplyScalar(rest.L1));

  /* shoulder: put the bone's own child direction onto S->E */
  const qParent = arm.parent.getWorldQuaternion(new THREE.Quaternion());
  const armLocal = E.clone().sub(S).normalize().applyQuaternion(qParent.clone().invert());
  arm.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(rest.uArm, armLocal));
  arm.updateMatrixWorld(true);

  /* elbow: same trick one joint down */
  const qArm = arm.getWorldQuaternion(new THREE.Quaternion());
  const foreLocal = Tw.clone().sub(E).normalize().applyQuaternion(qArm.clone().invert());
  fore.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(rest.uFore, foreLocal));
  fore.updateMatrixWorld(true);

  /* wrist: aim the blade. setFromUnitVectors gives the shortest arc, which is
   * exactly what a wrist does when it is not being asked to do anything clever */
  if (spec.blade) {
    const qFore = fore.getWorldQuaternion(new THREE.Quaternion());
    const bladeW = V3(spec.blade).transformDirection(cm).normalize();
    const bladeLocal = bladeW.applyQuaternion(qFore.clone().invert());
    hand.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(BLADE_LOCAL, bladeLocal));
    hand.updateMatrixWorld(true);
  }
}


/* ===========================================================================
 * THE SHIELD, WHICH IS THE THING THAT ACTUALLY CLIPS
 * ===========================================================================
 * The shield is a rigid plate skinned to fore.L at a fixed bind offset (roughly
 * 0.30 m below the elbow and 0.335 m forward of it), so wherever that forearm
 * goes, the plate goes: point the forearm across the chest and a corner of the
 * shield ends up inside the ribs. That is the "massive clipping" Mason saw.
 *
 * The fix is the one a real shield-bearer uses: ROLL THE FOREARM. Twisting the
 * forearm about its own long axis swings the plate around the arm without moving
 * the hand, so when a pose's default twist would bury it, the pose is searched
 * for the roll that puts the shield furthest from the body and that roll is kept.
 * =========================================================================== */
const SHIELD_PTS = [
  [-0.160, 1.16, 0.335], [-0.160, 0.56, 0.335], [-0.345, 0.86, 0.335],
  [0.020, 0.86, 0.335], [-0.160, 0.86, 0.360], [-0.300, 1.10, 0.335], [0.000, 0.60, 0.335],
];
export function shieldPoints(rig) {
  const fl = rig.byName.get('fore.L');
  if (!fl) return [];
  const a = fl.userData.abs;
  const rest = new THREE.Matrix4().makeTranslation(a.x, a.y, a.z);
  const delta = fl.matrixWorld.clone().multiply(rest.invert());
  return SHIELD_PTS.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(delta));
}
/* how far the shield's lowest-clearance corner is from the body's centre line,
 * counting only the part at chest height (a shield below the belt is harmless) */
export function shieldClearance(rig) {
  let m = Infinity;
  for (const p of shieldPoints(rig)) {
    if (p.y > 0.98 && p.y < 1.74) m = Math.min(m, Math.hypot(p.x, p.z));
  }
  return m === Infinity ? 9 : m;
}
/* rotate a bone about the axis running from itself to its child */
function twistBone(rig, boneName, childName, angle) {
  const bone = rig.byName.get(boneName), child = rig.byName.get(childName);
  if (!bone || !child) return;
  bone.updateMatrixWorld(true);
  const p = bone.getWorldPosition(new THREE.Vector3());
  const c = child.getWorldPosition(new THREE.Vector3());
  const axis = c.sub(p).normalize();
  const qw = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const qt = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  bone.quaternion.copy(parentQ.invert().multiply(qt).multiply(qw));
  bone.updateMatrixWorld(true);
}
/* find the forearm roll that keeps the shield out of the chest */
export function rollShieldClear(rig) {
  const fl = rig.byName.get('fore.L');
  if (!fl) return 0;
  const base = fl.quaternion.clone();
  let bestQ = base.clone();
  let best = shieldClearance(rig);
  if (best >= 0.18) return 0;                 /* already clear: leave the wrist alone */
  for (let i = 1; i < 16; i++) {
    const th = (i / 16) * Math.PI * 2;
    fl.quaternion.copy(base);
    twistBone(rig, 'fore.L', 'hand.L', th);
    const c = shieldClearance(rig);
    if (c > best + 1e-4) { best = c; bestQ = fl.quaternion.clone(); }
  }
  fl.quaternion.copy(bestQ);
  fl.updateMatrixWorld(true);
  return best;
}

/* ===========================================================================
 * THE PUBLIC TABLE
 * =========================================================================== */
export const STANCES = [];
const add = (s) => (STANCES.push(s), s);

const LINE_LABEL = { Left: 'left cut', Right: 'right cut (alt)', Down: 'overhead', T: 'thrust' };
const VERB_OF = { Left: 'Slash', Right: 'Slash', Down: 'Overhead', T: 'Stab' };

for (const line of ['Left', 'Right', 'Down', 'T']) {
  for (const amp of ['light', 'heavy']) {
    const verb = VERB_OF[line] + (amp === 'heavy' ? 'Heavy' : '');
    const L = LINES[line][amp];
    add({
      id: verb + ':' + line,
      label: verb + ' · ' + LINE_LABEL[line],
      group: 'attack', verb, line, amp,
      poses: { chamber: L.chamber, mid: L.mid, strike: L.strike },
    });
  }
}
for (const [name, v] of Object.entries(VERBS)) {
  add({
    id: name, label: v.label, group: 'attack', verb: name, line: v.line, amp: 'light',
    poses: { chamber: v.chamber, mid: v.mid, strike: v.strike },
  });
}
for (const [name, s] of Object.entries(STATES)) {
  add({ id: name, label: s.label, group: 'state', verb: name, poses: { hold: s.pose } });
}

export const LOCOMOTION = [
  { id: 'idle', label: 'Idle' }, { id: 'walk', label: 'Walk' },
  { id: 'march', label: 'March' }, { id: 'charge', label: 'Charge' },
];

export const stanceById = (id) => STANCES.find((s) => s.id === id);

/* ===========================================================================
 * APPLY
 * =========================================================================== */
const MOVED = ['arm.R', 'fore.R', 'hand.R', 'arm.L', 'fore.L', 'hand.L'];

export function applyPose(rig, pose, w = 1) {
  if (!rig || !pose) return rig;
  const B = rig.byName;
  const base = new Map();
  for (const n of MOVED) { const b = B.get(n); if (b) base.set(n, b.quaternion.clone()); }

  for (const [name, v] of Object.entries(pose.bones || {})) {
    const b = B.get(name);
    if (!b) continue;
    b.rotation.set(v[0], v[1], v[2]);
  }
  const hips = B.get('hips');
  if (hips && pose.hips != null) hips.position.y = hips.userData.abs.y + pose.hips;

  rig.root.updateMatrixWorld(true);
  if (pose.ik) {
    for (const side of ['R', 'L']) if (pose.ik[side] && pose.ik[side].hand) solveArm(rig, side, pose.ik[side]);
  }
  rig.root.updateMatrixWorld(true);
  /* the shield is carried, not posed: whatever the arm did, roll the forearm until
   * the plate is not inside him */
  rollShieldClear(rig);

  if (w < 0.999) {
    for (const [n, q] of base) {
      const b = B.get(n);
      if (!b) continue;
      const target = b.quaternion.clone();
      b.quaternion.copy(q).slerp(target, w);
    }
    rig.root.updateMatrixWorld(true);
  }
  return rig;
}

/* ===========================================================================
 * GROUND LOCK. The sole sits 30 mm under the toe bone, so a pose whose lowest
 * toe falls below that gets the whole figure lifted by the difference. Death is
 * included on purpose: a corpse sinking through the floor is the worst version.
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
  const g = group || rig.root;
  g.position.y = 0;
  g.updateMatrixWorld(true);
  const lift = Math.max(0, SOLE_OFFSET - lowestPoint(rig));
  g.position.y = lift;
  g.updateMatrixWorld(true);
  return lift;
}

/* ===========================================================================
 * BLENDING AND PHASE LOOKUP
 * =========================================================================== */
export function blendPose(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  const bones = {};
  for (const n of new Set([...Object.keys(a.bones || {}), ...Object.keys(b.bones || {})])) {
    const pa = (a.bones[n] || [0, 0, 0]), pb = (b.bones[n] || [0, 0, 0]);
    bones[n] = [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t), lerp(pa[2], pb[2], t)];
  }
  const ik = {};
  for (const side of ['R', 'L']) {
    const ka = (a.ik || {})[side], kb = (b.ik || {})[side];
    if (!ka || !kb) { ik[side] = kb || ka; continue; }
    const mixv = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
    ik[side] = {
      hand: mixv(ka.hand, kb.hand),
      pole: mixv(ka.pole, kb.pole),
      blade: mixv(ka.blade, kb.blade),
    };
  }
  return { bones, ik, hips: lerp(a.hips || 0, b.hips || 0, t) };
}

/* ===========================================================================
 * ARCS, NOT KEYS. This is the part that makes a swing stop looking mechanical.
 * ===========================================================================
 * Three poses lerped in a straight line is what a 1998 game did. Every modern
 * engine (Unreal's motion matching included) instead treats motion as a CURVE
 * through pose space and evaluates it continuously. So:
 *
 *   - the hand, the elbow pole and every torso angle follow a Catmull-Rom spline
 *     through chamber -> mid -> strike, which means the MID key genuinely bends
 *     the path instead of just halving two straight lines;
 *   - the BLADE TIP gets its own spline, and the blade direction at any instant
 *     is derived from it. That is how you author a readable arc: you draw the
 *     path the tip travels, not three wrist rotations that hopefully pass near it;
 *   - the release is eased (accelerates off the chamber, decelerates through the
 *     follow-through) and the recovery rides the same arc back rather than
 *     teleporting to a guard pose.
 * =========================================================================== */
const clamp01 = (v) => clamp(v, 0, 1);
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const easeOut = (u) => 1 - (1 - u) * (1 - u);

/* Catmull-Rom between p1 and p2, with p0/p3 as the neighbouring keys */
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
/* three keys, s in [0,1] from A through B to C */
function cr3(A, B, C, s) {
  return s <= 0.5 ? cr(2 * A - B, A, B, C, s * 2) : cr(A, B, C, 2 * C - B, (s - 0.5) * 2);
}
const norm3 = (v) => {
  const L = Math.hypot(v[0], v[1], v[2]);
  return L < 1e-6 ? [0, 0, 0] : [v[0] / L, v[1] / L, v[2] / L];
};
function tipOfPose(P, side) {
  const k = P && P.ik ? P.ik[side] : null;
  if (!k) return [0, 0, 0];
  const b = norm3(k.blade);
  return [
    k.hand[0] + b[0] * BLADE_LENGTH,
    k.hand[1] + b[1] * BLADE_LENGTH,
    k.hand[2] + b[2] * BLADE_LENGTH,
  ];
}
export { tipOfPose };

/* a continuous pose anywhere along the swing, s = 0 chamber ... 1 strike */
export function attackPoseAt(stance, s) {
  const A = stance.poses.chamber, B = stance.poses.mid, C = stance.poses.strike;
  if (!A || !B || !C) return stance.poses.strike || stance.poses.chamber || GUARD_POSE;
  const pose = { bones: {}, ik: {}, hips: cr3(A.hips || 0, B.hips || 0, C.hips || 0, s) };
  const names = new Set([...Object.keys(A.bones || {}), ...Object.keys(B.bones || {}), ...Object.keys(C.bones || {})]);
  for (const n of names) {
    const a = (A.bones || {})[n] || [0, 0, 0];
    const b = (B.bones || {})[n] || a;
    const c = (C.bones || {})[n] || b;
    pose.bones[n] = [cr3(a[0], b[0], c[0], s), cr3(a[1], b[1], c[1], s), cr3(a[2], b[2], c[2], s)];
  }
  for (const side of ['R', 'L']) {
    const ka = A.ik && A.ik[side], kb = B.ik && B.ik[side], kc = C.ik && C.ik[side];
    if (!ka || !kb || !kc) { pose.ik[side] = kc || kb || ka; continue; }
    const mix = (key) => [0, 1, 2].map((i) => cr3(ka[key][i], kb[key][i], kc[key][i], s));
    const hand = mix('hand');
    const pole = mix('pole');
    /* the tip is the curve that matters, so it is what gets interpolated */
    const tA = tipOfPose(A, side), tB = tipOfPose(B, side), tC = tipOfPose(C, side);
    const tip = [0, 1, 2].map((i) => cr3(tA[i], tB[i], tC[i], s));
    const dir = norm3([tip[0] - hand[0], tip[1] - hand[1], tip[2] - hand[2]]);
    pose.ik[side] = { hand, pole, blade: dir[0] || dir[1] || dir[2] ? dir : kc.blade };
  }
  return pose;
}

export function poseAt(stance, phase, u = 1) {
  if (!stance) return null;
  const ps = stance.poses;
  if (ps.hold) return ps.hold;
  if (phase === 'holding' || phase === 'hold' || phase === 'windup' || phase === 'wind' || phase === 'chamber') return ps.chamber;
  if (phase === 'release' || phase === 'rel') return attackPoseAt(stance, easeInOut(clamp01(u)));
  if (phase === 'recovery' || phase === 'rec') return attackPoseAt(stance, 1 - easeOut(clamp01(u)) * 0.92);
  return ps.strike || ps.hold || ps.chamber;
}

/* ===========================================================================
 * THE MOTION DATABASE. Unreal's motion matching is, at bottom, this: sample a
 * library into frames, describe each frame with a small feature vector, and at
 * run time pick the frame whose features are nearest what you want and blend to
 * it. We have no mocap, so the library is our authored stances sampled along
 * their arcs, but the mechanism is the same one the engine uses.
 * =========================================================================== */
export const MOTION_DB = [];
export function poseFeatures(pose) {
  const R = pose.ik && pose.ik.R, L = pose.ik && pose.ik.L;
  if (!R) return null;
  const tip = tipOfPose(pose, 'R');
  const b = norm3(R.blade);
  return [
    R.hand[0], R.hand[1], R.hand[2],
    tip[0], tip[1], tip[2],
    b[0], b[1], b[2],
    L ? L.hand[0] : 0, L ? L.hand[1] : 0, L ? L.hand[2] : 0,
    pose.hips || 0,
    (pose.bones && pose.bones.chest) ? pose.bones.chest[1] : 0,
  ];
}
export function buildMotionDB(step = 0.1) {
  MOTION_DB.length = 0;
  for (const st of STANCES) {
    if (st.poses.hold) {
      MOTION_DB.push({ stance: st.id, u: 0, phase: 'hold', pose: st.poses.hold, feat: poseFeatures(st.poses.hold) });
      continue;
    }
    for (let i = 0; i <= Math.round(1 / step); i++) {
      const s = +(i * step).toFixed(3);
      const pose = attackPoseAt(st, s);
      MOTION_DB.push({ stance: st.id, u: s, phase: s === 0 ? 'chamber' : s === 1 ? 'strike' : 'release', pose, feat: poseFeatures(pose) });
    }
  }
  return MOTION_DB;
}
/* nearest frame in pose space; `only` restricts the search to one stance */
export function matchMotion(target, only) {
  if (!MOTION_DB.length) buildMotionDB();
  let best = null, bd = Infinity;
  for (const e of MOTION_DB) {
    if (only && e.stance !== only) continue;
    if (!e.feat) continue;
    let d = 0;
    for (let i = 0; i < target.length; i++) { const k = target[i] - e.feat[i]; d += k * k; }
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function stanceForAttack(att) {
  if (!att) return stanceById('Guard');
  const name = att.name || 'Slash';
  const dir = att.dir || 'None';
  const heavy = name.endsWith('Heavy');
  const base = name.replace(/Heavy$/, '');
  if (base === 'Slash') return stanceById((heavy ? 'SlashHeavy' : 'Slash') + ':' + (dir === 'Right' ? 'Right' : 'Left'));
  if (base === 'Overhead') return stanceById((heavy ? 'OverheadHeavy' : 'Overhead') + ':Down');
  if (base === 'Stab') return stanceById((heavy ? 'StabHeavy' : 'Stab') + ':T');
  if (base === 'SprintCharge') return stanceById('SprintShove');
  if (base === 'InitiativeAttack') return stanceById('Slash:Left');
  return stanceById(base) || stanceById('Slash:Left');
}
