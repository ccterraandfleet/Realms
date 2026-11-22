/* ===========================================================================
 * MOCAP RETARGET — free human motion, driving our soldier
 * ===========================================================================
 * Source: Ubisoft's open LAFAN1 mocap set (77 BVH clips: fight, walk, run,
 * sprint, aiming, fall, dance). Free to download, no suit and no subscription.
 * The BVH is converted offline into a canonical body space by mocap/prep.py:
 * +Y up, +Z the way the actor faces, +X his right, hips at y 0.98 m, no root
 * translation. This module does the retarget at run time.
 *
 * HOW IT RETARGETS, and why this way. Copying joint rotations from another
 * skeleton is a trap: bone axes and lengths differ, so a straight copy folds the
 * body in half. Instead every bone is AIMED at the direction its counterpart runs
 * in the source clip, keeping OUR bone lengths and OUR rest pose. Roll comes from
 * a shared "right" reference so limbs do not twist arbitrarily. The result is our
 * soldier performing their motion, not their skeleton wearing our mesh.
 *
 * The sword is not in the mocap, so it is aimed to continue the forearm line,
 * which is what a hand holding a blade actually does through a cut.
 * =========================================================================== */
import * as THREE from 'three';
import { BLADE_LOCAL } from './stances.js?v=world-20261122-residents1';

/* our bone -> [source start joint, source end joint] */
const MAP = [
  ['hips',     'Hips',       'Spine1'],
  ['spine',    'Spine',      'Spine1'],
  ['chest',    'Spine1',     'Spine2'],
  ['neck',     'Spine2',     'Neck'],
  ['clav.R',   'RightShoulder', 'RightArm'],
  ['arm.R',    'RightArm', 'RightForeArm'],
  ['fore.R',   'RightForeArm', 'RightHand'],
  ['clav.L',   'LeftShoulder', 'LeftArm'],
  ['arm.L',    'LeftArm', 'LeftForeArm'],
  ['fore.L',   'LeftArm',    'LeftForeArm'],
  ['thigh.R',  'RightUpLeg', 'RightLeg'],
  ['shin.R',   'RightLeg',   'RightFoot'],
  ['foot.R',   'RightFoot',  'RightToe'],
  ['thigh.L',  'LeftUpLeg',  'LeftLeg'],
  ['shin.L',   'LeftLeg',    'LeftFoot'],
  ['foot.L',   'LeftFoot',   'LeftToe'],
];

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/* AIM. The trap here is that our bones do not all point the same way at rest:
 * the torso bones run UP to their child, the arms and legs run DOWN. Orient a
 * bone by building a basis around +Y and every limb ends up pointing backwards,
 * which is exactly the bug that put the head under the hips. So each bone is
 * rotated its OWN rest direction onto the source direction (shortest arc), then
 * rolled about its own axis until its rest right-side faces the roll reference.
 */
const CHILD = {
  hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', head: null,
  'clav.R': 'arm.R', 'arm.R': 'fore.R', 'fore.R': 'hand.R',
  'clav.L': 'arm.L', 'arm.L': 'fore.L', 'fore.L': 'hand.L',
  'thigh.R': 'shin.R', 'shin.R': 'foot.R', 'foot.R': 'toe.R',
  'thigh.L': 'shin.L', 'shin.L': 'foot.L', 'foot.L': 'toe.L',
};

function aim(rig, boneName, desiredWorldDir, rightWorld) {
  const b = rig.byName.get(boneName);
  if (!b || desiredWorldDir.lengthSq() < 1e-10) return;
  const childName = CHILD[boneName];
  const child = childName ? rig.byName.get(childName) : null;
  /* the bone's own rest direction, in its own local space */
  const u0 = new THREE.Vector3(0, 1, 0);
  if (child) {
    const a = b.userData.abs, c = child.userData.abs;
    u0.set(c.x - a.x, c.y - a.y, c.z - a.z);
    if (u0.lengthSq() < 1e-9) u0.set(0, 1, 0);
  }
  u0.normalize();

  const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const dirLocal = desiredWorldDir.clone().normalize().applyQuaternion(pq);
  const qAim = new THREE.Quaternion().setFromUnitVectors(u0, dirLocal);

  /* roll: where does the bone's rest right-side end up, versus where it should be */
  const r0 = new THREE.Vector3(1, 0, 0).applyQuaternion(qAim);
  const wantR = rightWorld.clone().normalize().applyQuaternion(pq);
  const proj = (v) => v.clone().addScaledVector(dirLocal, -v.dot(dirLocal));
  const a1 = proj(r0), a2 = proj(wantR);
  let angle = 0;
  if (a1.lengthSq() > 1e-6 && a2.lengthSq() > 1e-6) {
    a1.normalize(); a2.normalize();
    angle = Math.atan2(new THREE.Vector3().crossVectors(a1, a2).dot(dirLocal), a1.dot(a2));
  }
  b.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(dirLocal, angle).multiply(qAim));
  b.updateMatrixWorld(true);
}

/* a public way to point one bone somewhere, for the passes that need to correct a pose
 * after the capture has had its say */
export function aimBone(rig, boneName, worldDir, rightWorld) {
  const b = rig.byName.get(boneName);
  if (!b || !worldDir || worldDir.lengthSq() < 1e-9) return;
  rig.root.updateMatrixWorld(true);
  aim(rig, boneName, worldDir.clone().normalize(), (rightWorld || new THREE.Vector3(1, 0, 0)).clone());
  b.updateMatrixWorld(true);
}

export function applyMocapFrame(rig, joints, opts = {}) {
  if (!rig || !joints) return rig;
  rig.root.updateWorldMatrix(true, true);
  const rootQ = rig.root.getWorldQuaternion(new THREE.Quaternion());
  const RIGHT = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ);
  /* a mask lets mocap own the legs while the stance library owns the arms */
  const mask = opts.mask ? new Set(opts.mask) : null;
  const allow = (n) => !mask || mask.has(n);

  /* hips ride at whatever height the actor's hips were at */
  const hips = rig.byName.get('hips');
  if (hips && joints.Hips && allow('hips')) {
    hips.position.y = Math.max(0.32, joints.Hips[1]);
    hips.position.x = 0;
    hips.position.z = 0;
  }
  rig.root.updateMatrixWorld(true);

  // Real toes are retained by the corrected parser. Degenerate input still gets a safe fallback.
  const FWD = new THREE.Vector3(0, -0.12, 1).normalize();
  for (const [our, a, b] of MAP) {
    if (!allow(our)) continue;
    const ja = joints[a], jb = joints[b];
    if (!ja || !jb) continue;
    let dir = V(jb).sub(V(ja)).applyQuaternion(rootQ);
    if (dir.lengthSq() < 1e-8) {
      dir = rootQ ? FWD.clone().applyQuaternion(rootQ) : FWD.clone();
    }
    aim(rig, our, dir, RIGHT);
  }

  /* Captured/adapted weapon direction is explicit; older datasets can use the forearm. */
  const fore = rig.byName.get('fore.R'), hand = rig.byName.get('hand.R');
  if (fore && hand && allow('hand.R') && allow('fore.R')) {
    const fa = joints.RightForeArm, ha = joints.RightHand;
    if (fa && ha) {
      const dir = (joints.BladeDirection ? V(joints.BladeDirection) : V(ha).sub(V(fa))).normalize().applyQuaternion(rootQ);
      fore.updateMatrixWorld(true);
      if(joints.AimTarget && joints.AimWeight>0){
        const target=rig.root.localToWorld(V(joints.AimTarget));
        const actualHand=hand.getWorldPosition(new THREE.Vector3());
        dir.lerp(target.sub(actualHand).normalize(),joints.AimWeight).normalize();
      }
      const fq = fore.getWorldQuaternion(new THREE.Quaternion());
      const localDir = dir.clone().applyQuaternion(fq.clone().invert());
      hand.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(BLADE_LOCAL, localDir));
      hand.updateMatrixWorld(true);
    }
  }
  return rig;
}

/* ground the figure: lowest toe onto the floor, so a jump or a fall does not sink */
export function groundMocap(rig, group) {
  const g = group || rig.root;
  g.position.y = 0;
  g.updateMatrixWorld(true);
  let low = Infinity;
  const v = new THREE.Vector3();
  for (const n of ['toe.L', 'toe.R', 'foot.L', 'foot.R']) {
    const b = rig.byName.get(n);
    if (!b) continue;
    b.getWorldPosition(v);
    if (v.y < low) low = v.y;
  }
  const lift = low === Infinity ? 0 : Math.max(0, 0.03 - low);
  g.position.y = lift;
  g.updateMatrixWorld(true);
  return lift;
}

/* ===========================================================================
 * LOCOMOTION PLAYER — the baked walk / run / sprint loops from real capture.
 * Loops seamlessly because the window was cut at a matching frame, and the hips
 * keep their vertical bounce, which is most of what makes a march read.
 * =========================================================================== */
export class Locomotion {
  constructor(data) { this.d = data || {}; }
  names() { return Object.keys(this.d); }
  stats() { const o = {}; for (const k of Object.keys(this.d)) o[k] = { frames: this.d[k].frames.length, seconds: this.d[k].seconds, stride: this.d[k].stride }; return o; }
  /* THE CLIP'S OWN GROUND SPEED. Root motion is stripped in the bake, so in place the
   * planted foot slides backward at exactly the speed the ground must move for the foot
   * to stick. Rate-matching against anything else is what makes feet skate. */
  naturalSpeed(name) {
    const c = this.d[name];
    if (c && Number.isFinite(c.speed) && c.speed > 0) return c.speed;
    if (!c || !c.frames || c.frames.length < 4) return 1;
    const fr = c.frames, dt = 1 / (c.fps || 30);
    const feets = ['LeftToe', 'RightToe', 'LeftFoot', 'RightFoot'].filter((k) => fr[0][k]);
    /* the floor of this clip, from its lowest foot sample: a run has a FLIGHT phase
     * where both feet are off the ground and the lower one is still travelling fast.
     * Counting those frames reported a run at 6.4 m/s and made the whole ladder wrong. */
    let floorY = 9;
    for (const f of fr) for (const k of feets) floorY = Math.min(floorY, f[k][1]);
    const v = [];
    for (let i = 1; i < fr.length; i++) {
      const a = fr[i - 1], b = fr[i];
      let low = null, lowY = 9;
      for (const k of feets) { const y = Math.min(a[k][1], b[k][1]); if (y < lowY) { lowY = y; low = k; } }
      if (!low) continue;
      if (lowY > floorY + 0.06) continue;        /* airborne: says nothing about ground speed */
      const dz = (b[low][2] - a[low][2]) - (b.Hips[2] - a.Hips[2]);
      const dx = (b[low][0] - a[low][0]) - (b.Hips[0] - a.Hips[0]);
      const sp = Math.sqrt(dx * dx + dz * dz) / dt;
      if (sp > 0.05) v.push(sp);
    }
    if (!v.length) return 1;
    /* MEDIAN of the stance foot's backward speed. A high percentile was pulling in
     * frames where the foot is whipping through and reporting a run at 9 m/s. */
    v.sort((x, y) => x - y);
    if (typeof window !== 'undefined') { window.__natDbg = window.__natDbg || {}; window.__natDbg[name] = v.map((x) => +x.toFixed(2)); }
    return Math.max(0.25, v[Math.floor(v.length * 0.5)]);
  }
  /* the gait ladder: walk -> run -> sprint, each with the speed it really moves at */
  tiers() {
    if (!this._tiers) {
      this._nat = this._nat || {};
      const order = ['walk', 'run', 'sprint'];
      this._tiers = this.names()
        .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
        .map((name) => ({ name, speed: (this._nat[name] = this._nat[name] || this.naturalSpeed(name)) }));
      /* THE LADDER MUST CLIMB. Measured speeds come from a capture where a sprint's
       * stance is briefer than a run's, which can report sprint slower than run. A gait
       * ladder that goes downhill would play the run cycle for a sprint, so enforce it. */
      for (let i = 1; i < this._tiers.length; i++) {
        if (this._tiers[i].speed <= this._tiers[i - 1].speed * 1.08) {
          this._tiers[i].speed = this._tiers[i - 1].speed * 1.45;
        }
      }
    }
    return this._tiers;
  }
  sample(name, t) {
    const c = this.d[name];
    if (!c || !c.frames || !c.frames.length) return null;
    const P = c.frames.length;
    const f = (((t * (c.seconds>0?P/c.seconds:(c.fps||30))) % P) + P) % P;
    const i0 = Math.floor(f), i1 = (i0 + 1) % P, u = f - i0;
    const a = c.frames[i0], b = c.frames[i1], out = {};
    for (const j of Object.keys(a)) {
      const p = a[j], q = b[j] || p;
      out[j] = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
    }
    return out;
  }
}
