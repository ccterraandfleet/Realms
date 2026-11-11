/* ===========================================================================
 * RIGPOSE — drive a humanoid's weapon arm from the RULES, not from a clip
 * ===========================================================================
 * WHY THIS EXISTS. The page used to play a prebaked melee clip and squeeze it
 * through the phase machine: frozen at the chamber for the windup, then whipped
 * through the rest of the clip in about a fifth of a second. Two things made
 * that unsalvageable:
 *
 *   1. Chivalry's own numbers are 350ms holding / 225ms windup / 475ms release /
 *      800ms recovery. No 1.07s clip can be cut into those and still look like a
 *      body: the arm stops, then teleports.
 *   2. There is ONE horizontal melee clip on the rig. Our ability data needs a
 *      SLASH whose Direction is Left and whose AltDirection is Right, which are
 *      two different motions that chamber on OPPOSITE sides. One clip cannot be
 *      both, and mirroring a right-handed swordsman looks wrong.
 *
 * SO: the clips keep the feet, the idle, the hit reactions and the deaths, and
 * this module takes over the SWORD ARM for the swing itself. The hand is placed
 * where the swing needs it, and a two-bone IK solver puts the arm there. That
 * means the arc is exactly the arc the data describes, at exactly the data's
 * timing, on ANY humanoid rig.
 *
 * IT DOES NOT CARE WHICH RIG IT IS. Bone axes differ between rigs, so nothing
 * here assumes an axis: at bind time it measures, for every bone, the LOCAL
 * direction that points at its own child, and aims by that. Two rigs are mapped
 * out of the box (the KayKit-style knight we have, and the Mixamo skeleton that
 * every free realistic character uses), and anything else that follows either
 * convention binds automatically.
 * =========================================================================== */

import * as THREE from 'three';

/* ------------------------------------------------------------------ rig maps */
export const RIG_MAPS = {
  kaykit: {
    spine: 'spine', chest: 'chest', head: 'head',
    armR: { upper: 'upperarm.r', lower: 'lowerarm.r', hand: 'hand.r' },
    armL: { upper: 'upperarm.l', lower: 'lowerarm.l', hand: 'hand.l' },
  },
  mixamo: {
    spine: 'mixamorig:Spine', chest: 'mixamorig:Spine2', head: 'mixamorig:Head',
    armR: { upper: 'mixamorig:RightArm', lower: 'mixamorig:RightForeArm', hand: 'mixamorig:RightHand' },
    armL: { upper: 'mixamorig:LeftArm', lower: 'mixamorig:LeftForeArm', hand: 'mixamorig:LeftHand' },
  },
};

/* THREE'S GLTF LOADER REWRITES BONE NAMES. PropertyBinding.sanitizeNodeName strips
 * the reserved characters [ ] . : /, so the knight's 'upperarm.r' arrives as
 * 'upperarmr' and a Mixamo rig's 'mixamorig:Hips' as 'mixamorigHips'. Matching the
 * raw names found nothing at all on any of the three rigs, so every bone lookup
 * here goes through this normaliser instead. */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const _v = () => new THREE.Vector3();
const _q = () => new THREE.Quaternion();

function indexBones(root) {
  const idx = new Map();
  root.traverse((o) => {
    if (!o.name) return;
    const k = norm(o.name);
    if (!idx.has(k)) idx.set(k, o);
  });
  return idx;
}

export function detectRigKind(root) {
  const idx = indexBones(root);
  for (const key of Object.keys(RIG_MAPS)) {
    const m = RIG_MAPS[key];
    if (idx.has(norm(m.armR.upper)) && idx.has(norm(m.armR.lower)) && idx.has(norm(m.armR.hand))) return key;
  }
  return null;
}

function findBone(idx, name) {
  return idx.get(norm(name)) || null;
}

/* capture the local direction from each bone to its own child, so aiming works
 * on any rig without assuming which way the bone's local axis points */
function localChildAxis(bone, child) {
  if (!bone || !child) return null;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const b = bone.getWorldPosition(_v());
  const c = child.getWorldPosition(_v());
  const dirWorld = c.sub(b).normalize();
  const inv = bone.getWorldQuaternion(_q()).invert();
  return dirWorld.applyQuaternion(inv).normalize();
}

/* A SKINNED MESH'S BOUNDING BOX IS NOT ITS POSE. Box3.setFromObject measures the
 * geometry in the mesh's own space, which ignores whatever scale the skeleton or
 * armature carries, so the realistic Soldier came out 0.368 units "tall" and got
 * multiplied by 5, leaving a body with 1.16m upper arms. Height is measured off
 * the SKELETON instead: head bone to foot bone, in world space. */
export function skeletonHeight(root) {
  const idx = indexBones(root);
  const head = idx.get('head') || idx.get('mixamorighead') || null;
  const footCandidates = ['footl', 'toesl', 'footr', 'mixamorigleftfoot', 'mixamoriglefttoe',
                          'mixamorigrightfoot', 'mixamorigrighttoe', 'leftfoot', 'rightfoot'];
  let foot = null;
  for (const k of footCandidates) { const b = idx.get(k); if (b) { foot = b; break; } }
  if (!head || !foot) return null;
  root.updateWorldMatrix(true, true);
  const hy = head.getWorldPosition(_v()).y;
  const fy = foot.getWorldPosition(_v()).y;
  const h = Math.abs(hy - fy);
  if (!isFinite(h) || h <= 1e-6) return null;
  /* the head bone sits at the skull base, so add the crown back on */
  return h * 1.12;
}

export function scaleToHeight(root, targetHeight = 1.86) {
  const h = skeletonHeight(root);
  if (!h) return null;
  const k = targetHeight / h;
  root.scale.multiplyScalar(k);
  root.updateWorldMatrix(true, true);
  return k;
}

/* WHICH WAY DOES THIS BODY FACE? Mixamo characters face +Z and the KayKit knight
 * faces -Z, so authoring "forward" as -Z put every swing BEHIND the realistic
 * rigs and the arm could not reach at all. It is measured, not assumed: the toes
 * sit in front of the ankle, so the sign of that offset IS forward. */
export function forwardSign(root) {
  const idx = indexBones(root);
  const pairs = [['footl','toesl'],['footr','toesr'],
                 ['mixamorigleftfoot','mixamoriglefttoe'],['mixamorigrightfoot','mixamorigrighttoe'],
                 ['leftfoot','lefttoe'],['rightfoot','righttoe']];
  for (const [f,t] of pairs) {
    const fb = idx.get(f), tb = idx.get(t);
    if (fb && tb) {
      root.updateWorldMatrix(true, true);
      const fz = fb.getWorldPosition(_v()).z;
      const tz = tb.getWorldPosition(_v()).z;
      if (Math.abs(tz - fz) > 1e-4) return Math.sign(tz - fz);
    }
  }
  return -1;
}

/* ONE AUTO-SCALE THAT SUITS BOTH KINDS OF ASSET. A limb-proportion sanity check
 * picks between the two available measurements: the skeleton says how tall the
 * BODY is, the mesh box says how tall the ART is, and they disagree by 2x on the
 * knight because its skinned mesh carries its own scale. A real human's
 * shoulder-to-wrist reach is about 0.29 of their height, so if the skeleton scale
 * produces a reach ratio above 0.42 the body is being over-stretched and the art
 * measurement is used instead. */
export function autoFit(root, targetHeight = 1.86) {
  const s0 = root.scale.x || 1;
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const h0 = box.max.y - box.min.y;
  const boxK = h0 > 1e-6 ? s0 * (targetHeight / h0) : s0;

  /* try the skeleton fit first, and only keep it if the resulting body has
   * believable limb proportions (a human's shoulder-to-wrist is ~0.29 of height) */
  root.scale.setScalar(s0);
  root.updateWorldMatrix(true, true);
  const skelK = scaleToHeight(root, targetHeight);
  if (skelK) {
    const probe = bindRig(root);
    const ratio = probe && probe.reach ? probe.reach / targetHeight : 0;
    if (ratio >= 0.18 && ratio <= 0.42) return { scale: skelK, mode: 'skeleton', ratio: +ratio.toFixed(3) };
  }
  root.scale.setScalar(boxK);
  root.updateWorldMatrix(true, true);
  const probe2 = bindRig(root);
  return { scale: boxK, mode: 'meshbox', ratio: probe2 && probe2.reach ? +(probe2.reach / targetHeight).toFixed(3) : 0 };
}

export function bindRig(root) {
  const kind = detectRigKind(root);
  if (!kind) return null;
  const m = RIG_MAPS[kind];
  const idx = indexBones(root);
  const rig = {
    kind,
    spine: findBone(idx, m.spine),
    chest: findBone(idx, m.chest),
    head: findBone(idx, m.head),
    armR: { upper: findBone(idx, m.armR.upper), lower: findBone(idx, m.armR.lower), hand: findBone(idx, m.armR.hand) },
    armL: { upper: findBone(idx, m.armL.upper), lower: findBone(idx, m.armL.lower), hand: findBone(idx, m.armL.hand) },
    bones: idx,
    root,
  };
  rig.ok = !!(rig.armR.upper && rig.armR.lower && rig.armR.hand);
  if (!rig.ok) return rig;
  rig.axis = {
    upperR: localChildAxis(rig.armR.upper, rig.armR.lower),
    lowerR: localChildAxis(rig.armR.lower, rig.armR.hand),
    upperL: localChildAxis(rig.armL.upper, rig.armL.lower),
    lowerL: localChildAxis(rig.armL.lower, rig.armL.hand),
  };
  rig.rest = {};
  for (const b of [rig.armR.upper, rig.armR.lower, rig.armR.hand, rig.spine, rig.chest]) {
    if (b) rig.rest[b.uuid] = b.quaternion.clone();
  }
  /* bone lengths, measured once, so IK is in the body's own proportions */
  const A = rig.armR.upper.getWorldPosition(_v());
  const B = rig.armR.lower.getWorldPosition(_v());
  const C = rig.armR.hand.getWorldPosition(_v());
  rig.len = { upper: A.distanceTo(B), lower: B.distanceTo(C) };
  rig.reach = rig.len.upper + rig.len.lower;
  rig.forward = forwardSign(root);
  /* the swing targets are authored for a reference body; here is where THIS
   * body's shoulder actually is, in its own frame */
  const shoulderLocal = root.worldToLocal(rig.armR.upper.getWorldPosition(_v()).clone());
  rig.shoulderLocal = shoulderLocal;
  rig.restOk = true;
  return rig;
}

export function resetRig(rig) {
  if (!rig || !rig.ok || !rig.restOk) return;
  for (const b of [rig.armR.upper, rig.armR.lower, rig.armR.hand, rig.spine, rig.chest]) {
    if (b && rig.rest[b.uuid]) b.quaternion.copy(rig.rest[b.uuid]);
  }
  rig.root.updateMatrixWorld(true);
}

/* ------------------------------------------------------------------ two-bone IK
 * Rotate a bone so the vector to its own child points at a world target, without
 * ever assuming which local axis that is: the rotation is the shortest arc from
 * where the child IS to where it should be, applied in world space and converted
 * back into the parent's frame. */
function aimBoneAt(bone, child, targetWorld) {
  if (!bone || !child) return;
  const bp = bone.getWorldPosition(_v());
  const cp = child.getWorldPosition(_v());
  const from = cp.clone().sub(bp);
  const to = targetWorld.clone().sub(bp);
  if (from.lengthSq() < 1e-9 || to.lengthSq() < 1e-9) return;
  const rot = _q().setFromUnitVectors(from.normalize(), to.normalize());
  const wq = bone.getWorldQuaternion(_q());
  const nw = rot.multiply(wq);
  const pq = bone.parent.getWorldQuaternion(_q());
  bone.quaternion.copy(pq.invert().multiply(nw));
  bone.updateMatrixWorld(true);
}

/* place the hand at a world position by solving the shoulder and elbow */
export function solveArm(rig, targetWorld, poleWorld) {
  if (!rig || !rig.ok) return false;
  const { upper, lower, hand } = rig.armR;
  const A = upper.getWorldPosition(_v());
  const T = targetWorld.clone();
  const l1 = rig.len.upper, l2 = rig.len.lower;

  let d = A.distanceTo(T);
  const maxD = (l1 + l2) * 0.995;
  const minD = Math.abs(l1 - l2) * 1.02 + 1e-4;
  if (d > maxD) { T.sub(A).setLength(maxD).add(A); d = maxD; }
  if (d < minD) { T.sub(A).setLength(minD).add(A); d = minD; }

  const at = T.clone().sub(A).normalize();
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const alpha = Math.acos(cosA);

  /* the elbow swings around the shoulder-to-target axis, so the pole decides
   * which way it points. Fall back to straight down-and-out if no pole given. */
  const pole = (poleWorld ? poleWorld.clone().sub(A) : new THREE.Vector3(0, -1, -0.35)).normalize();
  let axis = _v().crossVectors(at, pole);
  if (axis.lengthSq() < 1e-8) axis = _v().crossVectors(at, new THREE.Vector3(0, 0, 1));
  axis.normalize();

  const elbowDir = at.clone().applyAxisAngle(axis, alpha).normalize();
  const elbow = A.clone().addScaledVector(elbowDir, l1);

  /* two passes: rotating the upper bone moves the elbow, which changes where the
   * lower bone has to aim from, so one pass leaves a few centimetres on the table */
  for (let i = 0; i < 2; i++) {
    aimBoneAt(upper, lower, elbow);
    aimBoneAt(lower, hand, T);
  }
  return true;
}

/* ------------------------------------------------------- the authored swings
 * HAND POSITIONS in the body's own frame, in metres, for a ~1.85m swordsman
 * holding the sword in the RIGHT hand. Forward is -Z, his right is +X.
 *
 * These are the chambers. The rule they obey is the one the arc probe caught me
 * getting wrong before: a cut that TRAVELS LEFT must CHAMBER ON THE RIGHT. So
 * line 'L' starts high and out to his right and ends low across to his left; 'R'
 * is the mirror, chambered across his own face. Overhead and thrust have no side.
 *
 * Phase mapping is exact, because it comes from the ability's own durations:
 *   holding + windup -> the hand travels to the chamber and HOLDS there (the
 *                       telegraph you are supposed to be able to read)
 *   release          -> chamber to contact, then contact to follow-through
 *   recovery         -> follow-through back to guard
 */
/* POSES ARE DIRECTIONS AT A FRACTION OF THE ARM'S REACH, never absolute metres.
 * Authoring absolute positions was the last failure: my contact pose put the hand
 * 0.90m in front of the shoulder, and a realistic arm only reaches 0.55m, so the
 * solver clamped and the hand missed by 200mm on every realistic rig. A unit
 * direction times a fraction of reach can never over-extend on any body, and the
 * ARC is preserved because the direction is what carries it.
 *
 * The one rule they obey, which the arc probe taught me the hard way: a cut that
 * TRAVELS LEFT must CHAMBER ON THE RIGHT. So 'L' starts high and out to his right
 * and finishes low across to his left; 'R' is its mirror; overhead and thrust have
 * no side. Fractions are of the shoulder's reach, so 1.00 is a fully extended arm. */
export const SWINGS = {
  L: {
    chamber: { dir: [0.74, 0.58, -0.34], f: 0.94 },   /* high, out to his right */
    contact: { dir: [-0.16, -0.10, -0.98], f: 1.00 }, /* crossing the centre line */
    follow:  { dir: [-0.66, -0.46, -0.60], f: 0.90 },
    twist: [-0.30, 0.26],
    poleR: [0.86, 1.30, 0.30],
  },
  R: {
    chamber: { dir: [-0.70, 0.58, -0.42], f: 0.94 },  /* across his own face */
    contact: { dir: [0.18, -0.10, -0.98], f: 1.00 },
    follow:  { dir: [0.68, -0.44, -0.58], f: 0.90 },
    twist: [0.28, -0.26],
    poleR: [0.90, 1.26, 0.34],
  },
  T: {
    chamber: { dir: [0.04, 0.97, -0.24], f: 0.94 },   /* above the head */
    contact: { dir: [0.02, -0.12, -0.99], f: 1.00 },
    follow:  { dir: [0.02, -0.64, -0.77], f: 0.86 },
    twist: [-0.06, 0.10],
    poleR: [0.92, 1.40, 0.22],
  },
  thrust: {
    chamber: { dir: [0.34, 0.10, 0.94], f: 0.70 },    /* drawn back to the hip */
    contact: { dir: [0.05, -0.02, -1.00], f: 1.00 },  /* driven straight out */
    follow:  { dir: [0.04, -0.04, -1.00], f: 0.98 },
    twist: [0.22, -0.16],
    poleR: [0.94, 1.16, 0.26],
  },
  guard: {
    chamber: { dir: [0.32, -0.14, -0.94], f: 0.68 },
    contact: { dir: [0.32, -0.14, -0.94], f: 0.68 },
    follow:  { dir: [0.32, -0.14, -0.94], f: 0.68 },
    twist: [0, 0],
    poleR: [0.90, 1.20, 0.26],
  },
};

/* blend two authored poses: directions stay unit-length, reach interpolates */
function blendPose(a, b, t) {
  const d = [a.dir[0] + (b.dir[0] - a.dir[0]) * t,
             a.dir[1] + (b.dir[1] - a.dir[1]) * t,
             a.dir[2] + (b.dir[2] - a.dir[2]) * t];
  const m = Math.hypot(d[0], d[1], d[2]) || 1;
  return { dir: [d[0] / m, d[1] / m, d[2] / m], f: a.f + (b.f - a.f) * t };
}

export function fitTarget(rig, pose) {
  const sh = rig && rig.shoulderLocal;
  if (!sh || !rig.reach) return [0, 0, 0];
  const r = rig.reach * (pose.f ?? 1) * 0.995;      /* never asked to over-reach */
  return [sh.x + pose.dir[0] * r, sh.y + pose.dir[1] * r, sh.z + pose.dir[2] * r];
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/* which authored line an ability plays, from the DIRECTION in their table */
export function lineFor(attack) {
  if (!attack) return 'T';
  const n = attack.name || '';
  if (n === 'Stab' || n === 'StabHeavy' || n === 'Throw') return 'thrust';
  if (n === 'KickLow' || n === 'Shove' || n === 'Jab') return 'T';
  if (attack.dir === 'Right') return 'R';
  if (attack.dir === 'Left') return 'L';
  return 'T';
}

/* local hand position for a point in the swing's own progress.
 * uChamber runs 0..1 over holding+windup, uRelease 0..1 over the release. */
export function handTarget(line, uRelease) {
  const S = SWINGS[line] || SWINGS.T;
  const u = clamp01(uRelease);
  if (u < 0.62) return blendPose(S.chamber, S.contact, smooth(u / 0.62));
  return blendPose(S.contact, S.follow, smooth((u - 0.62) / 0.38));
}

/* Apply the whole thing to a rig for a fighter's current phase. Call this AFTER
 * the animation mixer has run this frame, so the clips keep the body and this
 * takes the sword arm. */
export function applySwing(rig, fighter, opts = {}) {
  if (!rig || !rig.ok || !rig.restOk || !fighter) return null;
  const faceSign = opts.faceSign ?? 1;       /* which way the body's -Z faces */
  const atk = fighter.attack;

  /* torso twist is what makes a cut read as a body action rather than a hand wave */
  const setTwist = (amount) => {
    if (!rig.chest || !rig.rest[rig.chest.uuid]) return;
    rig.chest.quaternion.copy(rig.rest[rig.chest.uuid]);
    const axis = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, amount);
    rig.chest.quaternion.multiply(q);
    rig.chest.updateMatrixWorld(true);
  };

  const toWorld = (p) => {
    const fitted = fitTarget(rig, p);
    /* the pose is authored facing -Z; a +Z rig gets its depth mirrored so the
     * swing happens in front of the chest instead of behind the back */
    const v = new THREE.Vector3(fitted[0] * faceSign, fitted[1], fitted[2] * (rig.forward || -1) * -1);
    return rig.root.localToWorld(v);
  };

  /* no swing: guard if guarding, otherwise leave the clips alone */
  if (!atk) {
    if (fighter.guard) {
      setTwist(0.10);
      const S = SWINGS.guard;
      const tgt = toWorld(S.chamber);
      solveArm(rig, tgt, rig.root.localToWorld(new THREE.Vector3(...S.poleR)));
      return { line: 'guard', u: 0 };
    }
    resetRig(rig);
    return null;
  }

  const line = lineFor(atk);
  const S = SWINGS[line] || SWINGS.T;
  const dur = fighter.stateDur || 0.001;
  const u = clamp01((fighter.stateT || 0) / dur);

  let pose;
  if (fighter.state === 'holding' || fighter.state === 'windup') {
    /* ease INTO the chamber across both phases, so the telegraph is readable */
    pose = blendPose(S.contact, S.chamber, smooth(u));
    setTwist(S.twist[0] * smooth(u));
  } else if (fighter.state === 'release') {
    pose = handTarget(line, u);
    const t = u < 0.62 ? smooth(u / 0.62) : 1;
    setTwist(S.twist[0] + (S.twist[1] - S.twist[0]) * t);
  } else {
    /* recovery / thwack: come back to guard */
    pose = blendPose(S.follow, SWINGS.guard.chamber, smooth(u));
    setTwist(S.twist[1] * (1 - smooth(u)));
  }
  const tgt = pose;

  const world = toWorld(tgt);
  solveArm(rig, world, rig.root.localToWorld(new THREE.Vector3(...S.poleR)));
  return { line, u, hand: world };
}
