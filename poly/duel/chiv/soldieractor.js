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

let ATLAS = null;
export async function initActors(loader) {
  if (!ATLAS) ATLAS = await new Atlas(loader).ready();
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
    const parts = buildSoldier(this.rig, this.mats, {
      kind: opts.kind || 'sword',
      helm: opts.helm || 'nasal',
      shield: opts.shield || 'kite',
    });
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

  update(dt, f, moving = 0) {
    if (!f) return;
    this.t += dt;
    const dead = f.alive === false || f.state === 'dead';
    const busy = !!f.attack;
    const mode = dead ? 'dead' : busy ? 'stand' : (moving > 0.05 ? 'walk' : 'idle');
    animate(this.rig, this.t, mode);

    if (dead) return;

    /* the arm rotations animate() just wrote are the base the swing blends FROM */
    const base = {};
    for (const n of ['arm.R', 'fore.R', 'chest', 'arm.L', 'fore.L']) {
      const b = this.bone(n);
      base[n] = b ? [b.rotation.x, b.rotation.y, b.rotation.z] : [0, 0, 0];
    }

    /* GUARD: bring the shield across the body. */
    if (f.guard && !busy) {
      this._blend('arm.L', base['arm.L'], [-0.95, 0.10, 0.34], 0.85);
      this._blend('fore.L', base['fore.L'], [-1.25, 0, 0], 0.85);
      this._blend('chest', base['chest'], [0, 0.16, 0], 0.5);
    }

    /* SWING: the arm rides the core's own phase clock. */
    if (busy) {
      const S = LINE[lineOf(f.attack)];
      const { phase, u } = f.phaseInfo ? f.phaseInfo() : { phase: 'release', u: 0 };
      let target = S.chamber, w = 1;
      if (phase === 'holding') { target = S.chamber; w = clamp01(u / 0.5); }
      else if (phase === 'windup') { target = S.chamber; w = 1; }
      else if (phase === 'release') {
        const e = u * u * (3 - 2 * u);            /* smoothstep: readable midpoint */
        target = {
          arm: [lerp(S.chamber.arm[0], S.strike.arm[0], e), lerp(S.chamber.arm[1], S.strike.arm[1], e), lerp(S.chamber.arm[2], S.strike.arm[2], e)],
          fore: [lerp(S.chamber.fore[0], S.strike.fore[0], e), 0, 0],
          chest: lerp(S.chamber.chest, S.strike.chest, e),
        };
        w = 1;
      } else if (phase === 'recovery') { target = S.strike; w = 1 - u; }
      else { target = S.strike; w = 0.15; }

      const pre = (v, b) => [lerp(b[0], v[0], w), lerp(b[1], v[1], w), lerp(b[2], v[2], w)];
      this._set('arm.R', pre(target.arm, base['arm.R']));
      this._set('fore.R', pre(target.fore, base['fore.R']));
      const c = pre([0, target.chest, 0], base['chest']);
      this._set('chest', c);
    }

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
