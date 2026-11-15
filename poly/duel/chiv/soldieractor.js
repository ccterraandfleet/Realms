/* ===========================================================================
 * SOLDIER ACTOR — the purpose-built soldier standing in for the GLB rigs
 * ===========================================================================
 * The KayKit knight is one draw call but only until it is dressed: the forge kit
 * merges to ~34 draws on top, so a dressed man costs ~35. This soldier is 12 draws
 * and 6.5k triangles for a BETTER-looking figure, which is why it goes in the game
 * rather than staying a showroom page.
 *
 * Two things the GLB path had that this does not, and how they are covered:
 *  - no clips at all, so locomotion is generated from a phase number by animate();
 *  - no rigpose, so the sword arm is posed here straight from the core's own
 *    phaseInfo(), which is the same holding/windup/release/recovery clock the rules
 *    resolve hits on. The arm cannot drift out of step with the hitbox because both
 *    read the same phase.
 * =========================================================================== */
import * as THREE from 'three';
import { Atlas } from './forge.js';
import { buildSkeleton, buildSoldier, assemble, soldierMaterials, animate } from './soldier.js';
import { stanceForAttack, poseAt, applyPose, GUARD_POSE, stanceById } from './stances.js?v=20261114-ik2';
import { applyMocapFrame, Locomotion } from './mocap.js?v=20261115-mc6';

let ATLAS = null;
let LOCO = null;
let locoLoading = false;
/* CAPTURED STRIKES, cut out of the LAFAN1 fight capture: real people throwing real
 * punches and hooks. The arms were the last thing I was still authoring by hand, and
 * that is precisely what made our swings read as mechanical next to Chivalry's. */
let SWINGS = null;
let swingLoading = false;
export function loadSwings() {
  if (SWINGS || swingLoading || typeof fetch !== 'function') return;
  swingLoading = true;
  fetch('./mocap/swings.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !j.clips) return;
      const by = {};
      for (const c of j.clips) { const k = c.kind + ':' + c.hand; if (!by[k]) by[k] = c; }
      SWINGS = by;
      if (typeof window !== 'undefined') window.__swingKeys = Object.keys(by);
    })
    .catch((e) => { if (typeof window !== 'undefined') window.__swingErr = String(e); })
    .finally(() => { swingLoading = false; });
}
if (typeof window !== 'undefined') {
  window.__swingState = () => ({ loaded: !!SWINGS, keys: window.__swingKeys || null, uses: window.__swingUses || 0 });
}

/* CONTACT SITS AT 56.7% OF EVERY CLIP: the bake cut each window from 0.55 s before the
 * fastest hand speed to 0.42 s after it. Phase progress maps onto that anchor. */
const CLIP_CONTACT = 0.567;
const UPPER_MASK = ['spine', 'chest', 'neck', 'head', 'clav.R', 'arm.R', 'fore.R', 'hand.R',
                    'clav.L', 'arm.L', 'fore.L', 'hand.L'];

function clipTimeFor(phase, u) {
  let a, b;
  if (phase === 'holding') { a = 0.10; b = 0.34; }
  else if (phase === 'windup') { a = 0.34; b = CLIP_CONTACT - 0.04; }
  else if (phase === 'release') { a = CLIP_CONTACT - 0.04; b = CLIP_CONTACT + 0.20; }
  else { a = CLIP_CONTACT + 0.20; b = 1.0; }
  const p = phase === 'release' ? Math.pow(u, 0.72) : u;
  return Math.max(0, Math.min(0.999, a + (b - a) * p));
}

function swingFrameAt(clip, u) {
  if (!clip || !clip.frames || !clip.frames.length) return null;
  const f = u * (clip.frames.length - 1);
  const i0 = Math.floor(f), i1 = Math.min(clip.frames.length - 1, i0 + 1), t = f - i0;
  const A = clip.frames[i0], B = clip.frames[i1];
  const out = {};
  for (const k of Object.keys(A)) {
    const p = A[k], q = B[k] || p;
    out[k] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return out;
}

/* which captured strike answers a given stance: read off its own id */
function swingFor(stance) {
  if (!SWINGS) return null;
  const id = String((stance && stance.id) || 'Slash:Left');
  const line = /Overhead/i.test(id) ? 'overhead' : /Stab/i.test(id) ? 'stab' : 'slash';
  const hand = /Left/i.test(id) ? 'L' : 'R';
  return SWINGS[line + ':' + hand] || SWINGS['slash:' + hand] || SWINGS['slash:R'] || null;
}
export function loadLocomotion() {
  if (LOCO || locoLoading || typeof fetch !== 'function') return;
  locoLoading = true;
  fetch('./mocap/locomotion.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) { LOCO = new Locomotion(j); if (typeof window !== 'undefined') { window.__locoKeys = Object.keys(j); window.__locoTiersData = LOCO.tiers(); } } else if (typeof window !== 'undefined') window.__locoErr = 'fetch not ok'; })
    .catch((e) => { if (typeof window !== 'undefined') window.__locoErr = String(e); })
    .finally(() => { locoLoading = false; });
}
if (typeof window !== 'undefined') window.__locoState = () => ({ loco: !!LOCO, calls: window.__locoCalls || 0, keys: window.__locoKeys || null });
export const locomotion = () => LOCO;


export async function initActors(loader) {
  if (!ATLAS) ATLAS = await new Atlas(loader).ready();
  if (!LOCO) {
    try {
      const r = await fetch('./mocap/locomotion.json');
      if (r.ok) LOCO = new Locomotion(await r.json());
    } catch (e) { LOCO = null; if (typeof window !== 'undefined') window.__locoErr = String(e); }
  }
  return ATLAS;
}
export const actorsReady = () => !!ATLAS;

/* Chamber and strike are authored per attack LINE. arm.R is [x,y,z] in radians,
 * fore.R is the elbow bend. A LEFT cut must chamber on his RIGHT and cross the body,
 * because a left attack is one where the blade travels right to left. */
const LINE = {
  Left: {
    chamber: { arm: [-0.30, 0.52, -1.00], fore: [-1.32, 0, 0], chest: 0.34 },
    strike:  { arm: [-0.95, -0.55, 0.82], fore: [-0.24, 0, 0], chest: -0.36 },
  },
  Right: {
    chamber: { arm: [-0.66, -0.58, -0.28], fore: [-1.62, 0, 0], chest: -0.32 },
    strike:  { arm: [-0.60, 0.58, 0.52], fore: [-0.24, 0, 0], chest: 0.36 },
  },
  Down: {
    chamber: { arm: [-2.30, 0.10, -0.12], fore: [-1.30, 0, 0], chest: 0.14 },
    strike:  { arm: [0.58, -0.05, -0.05], fore: [-0.12, 0, 0], chest: -0.14 },
  },
  T: {
    chamber: { arm: [-0.84, 0.18, -0.26], fore: [-1.88, 0, 0], chest: 0.16 },
    strike:  { arm: [-1.44, -0.10, -0.10], fore: [-0.10, 0, 0], chest: -0.12 },
  },
};

export function lineOf(a) {
  if (!a) return 'Left';
  const t = String(a.type || '').toLowerCase();
  const d = String(a.dir || '').toLowerCase();
  if (t === 'overhead' || d === 'down') return 'Down';
  if (t === 'stab' || t === 'thrust' || d === 't') return 'T';
  if (d === 'right') return 'Right';
  return 'Left';
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Actor {
  constructor(opts = {}) {
    this.rig = buildSkeleton();
    this.mats = soldierMaterials(ATLAS.m, opts.tint ?? 0x2f6ea6);
    let parts = buildSoldier(this.rig, this.mats, {
      kind: opts.kind || 'sword',
      helm: opts.helm || 'nasal',
      shield: opts.shield || 'kite',
    });
    /* A BODY FOR THE PLAYER'S OWN EYES: the head, neck and arms are omitted rather than
     * hidden, because a skinned part cannot be switched off after assemble() has merged
     * it by material. Parts carry the bone they bind to, so filtering here is exact -
     * and dropping hand.R drops the sword with it. */
    if (opts.omitBones && opts.omitBones.length) {
      const drop = new Set(opts.omitBones);
      parts = parts.filter((q) => !drop.has(q.bone));
    }
    const built = assemble(this.rig, parts);
    this.built = built;
    this.root = built.root;
    /* a skinned mesh's bounding box is not its pose, so culling by it makes men
     * disappear the moment they swing. Same trap as the autoFit measurement. */
    this.root.traverse((n) => { if (n.isSkinnedMesh || n.isMesh) n.frustumCulled = false; });
    this.t = Math.random() * 6;
    this.setShadows(opts.shadows ?? false);
    this._v = new THREE.Vector3();
  }

  setShadows(on) {
    this.root.traverse((n) => {
      if (n.isMesh || n.isSkinnedMesh) { n.castShadow = on; n.receiveShadow = false; }
    });
  }

  bone(name) {
    const b = this.rig.byName.get(name);
    return b || null;
  }

  /* set a bone's rotation from an authored triple */
  _set(name, v) {
    const b = this.bone(name);
    if (!b) return;
    b.rotation.set(v[0], v[1], v[2]);
  }

  _blend(name, base, target, w) {
    const b = this.bone(name);
    if (!b) return;
    b.rotation.set(
      lerp(base[0], target[0], w),
      lerp(base[1], target[1], w),
      lerp(base[2], target[2], w),
    );
  }

  /* UPPER BODY MASK. The legs, hips and feet belong to locomotion; the torso and
   * arms belong to the stance. Every engine layers a melee attack over a walk
   * cycle exactly this way, and without it a swinging man stops walking. */
  static LOWER = ['hips', 'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R'];

  update(dt, f, moving = 0) {
    if (!f) return;
    this.t += dt;
    const dead = f.alive === false || f.state === 'dead';
    const busy = !!f.attack;
    const mode = dead ? 'dead' : busy ? 'stand' : (moving > 0.05 ? 'walk' : 'idle');
    animate(this.rig, this.t, mode);
    if (dead) return;
    this.root.updateMatrixWorld(true);

    /* The pose comes from the SAME stance library the review page shows, so the
     * swings in the game are the IK-authored, spline-interpolated ones rather
     * than a second set of numbers that drift. */
    let pose = null, w = 0;
    if (busy) {
      const st = stanceForAttack(f.attack) || stanceById('Slash:Left');
      const { phase, u } = f.phaseInfo ? f.phaseInfo() : { phase: 'release', u: 0 };
      if (!SWINGS) loadSwings();
      const clip = swingFor(st);
      const fr = clip ? swingFrameAt(clip, clipTimeFor(phase, u)) : null;
      if (fr) {
        /* the strike is the whole upper body, so the stance library adds nothing */
        applyMocapFrame(this.rig, fr, { mask: UPPER_MASK });
        this.root.updateMatrixWorld(true);
        if (typeof window !== 'undefined') window.__swingUses = (window.__swingUses || 0) + 1;
        pose = null;
        w = 0;
      } else {
        pose = poseAt(st, phase, u) || st.poses.chamber || GUARD_POSE;
        w = 1;
        if (phase === 'holding') w = clamp01(u / 0.5);
        else if (phase === 'recovery') w = clamp01(1 - u * 0.85);
      }
    } else {
      pose = GUARD_POSE;
      /* he carries a guard rather than standing with his arms down, but the
       * weight drops while walking so the stride still reads */
      w = (f.guard ? 0.85 : 0.5) * (moving > 0.05 ? 0.7 : 1);
    }
    /* LOCOMOTION comes from captured motion, legs only: the walk you see is a
     * real person's walk, not my sine waves. It is masked to the lower body so
     * the stance library still owns the torso and arms above it. */
    /* the speed comes from the body itself, so this works for the squad, the
     * opponent and anything else that owns an Actor without extra plumbing */
    const wp = this.root.getWorldPosition(this._wp || (this._wp = new THREE.Vector3()));
    if (!this._lastWp) this._lastWp = wp.clone();
    const worldSpd = this._lastWp.distanceTo(wp) / Math.max(dt, 1e-4);
    this._lastWp.copy(wp);
    this._lastPos = this._lastPos || this.root.position.clone();
    const localSpd = this._lastPos.distanceTo(this.root.position) / Math.max(dt, 1e-4);
    this._lastPos.copy(this.root.position);
    const spd = Math.max(localSpd, worldSpd);
    if (!LOCO) loadLocomotion();
    if (LOCO && (moving > 0.05 || spd > 0.25)) {
      if (typeof window !== 'undefined') window.__locoCalls = (window.__locoCalls || 0) + 1;
      const tier = LOCO.tiers();                    /* [{name, speed}] sorted slow to fast */
      /* pick the pair that brackets the ground speed, blend between them, and play
       * each at speed/natural so a planted foot does not skate */
      let lo = tier[0], hi = tier[tier.length - 1];
      for (let i = 0; i < tier.length - 1; i++) {
        if (spd >= tier[i].speed && spd <= tier[i + 1].speed) { lo = tier[i]; hi = tier[i + 1]; break; }
      }
      if (spd > hi.speed) lo = hi;
      if (spd < lo.speed) hi = lo;
      const span = Math.max(0.15, hi.speed - lo.speed);
      const blend = lo === hi ? 0 : Math.max(0, Math.min(1, (spd - lo.speed) / span));
      const rateLo = Math.max(0.55, Math.min(1.75, spd / lo.speed));
      const rateHi = Math.max(0.55, Math.min(1.75, spd / hi.speed));
      this._phLo = (this._phLo === undefined ? Math.random() : this._phLo) + dt * rateLo;
      this._phHi = (this._phHi === undefined ? this._phLo : this._phHi) + dt * rateHi;
      let jt = null;
      try {
        const a1 = LOCO.sample(lo.name, this._phLo);
        const a2 = lo === hi ? a1 : LOCO.sample(hi.name, this._phHi);
        if (a1 && a2 && blend > 0.001) {
          jt = {};
          for (const k of Object.keys(a1)) {
            const a = a1[k], b2 = a2[k] || a;
            jt[k] = [a[0] + (b2[0] - a[0]) * blend, a[1] + (b2[1] - a[1]) * blend, a[2] + (b2[2] - a[2]) * blend];
          }
        } else jt = a1;
      } catch (e) { if (typeof window !== 'undefined') window.__locoErr = String(e); LOCO = null; }
      if (jt) {
        applyMocapFrame(this.rig, jt, { mask: Actor.LOWER });
        this._loco = { spd: +spd.toFixed(2), clip: lo === hi ? lo.name : lo.name + '+' + hi.name,
          blend: +blend.toFixed(2), rate: +rateLo.toFixed(2), natural: +lo.speed.toFixed(2) };
        if (typeof window !== 'undefined') window.__loco = this._loco;
      }
    }
    if (pose) applyPose(this.rig, pose, w, { skip: Actor.LOWER });
    this.root.updateMatrixWorld(true);
  }

  /* used by the tests: where is the sword hand, and did it actually travel */
  handWorld(out = new THREE.Vector3()) {
    const h = this.bone('hand.R');
    if (!h) return null;
    this.root.updateMatrixWorld(true);
    return h.getWorldPosition(out);
  }
}

export function makeActor(opts) {
  return new Actor(opts);
}
