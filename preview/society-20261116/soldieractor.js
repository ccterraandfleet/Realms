import{gaitSpeed}from'./gait-speed.js?v=world-20261122-residents1';
/* Realms actor: captured combat layered after captured locomotion, plus grip and foot IK.
 * Retarget vectors use the actor frame, not global axes. End-site offsets must never
 * replace joint offsets. No head-height clamp: legitimate overhead guards remain valid.
 */
import * as THREE from 'three';
import { Atlas } from './forge.js?v=world-20261122-residents1';
import {loadAnatomy} from './anatomy.js?v=world-20261122-residents1';
import { buildSkeleton, buildSoldier, assemble, soldierMaterials, animate } from './soldier.js?v=world-20261122-residents1';
import { stanceForAttack, poseAt, applyPose, GUARD_POSE, stanceById, solveArm, rollShieldClear } from './stances.js?v=world-20261122-residents1';
import { applyMocapFrame, aimBone, Locomotion } from './mocap.js?v=world-20261122-residents1';

let ATLAS = null;
let LOCO = null;
let locoLoading = false;
/* Combat motion: CMU subject 02 swordplay. Locomotion: CMU-only capture, corrected lateral-axis conversion. */
let SWINGS = null;
let swingLoading = false;
export function loadSwings() {
  if (SWINGS || swingLoading || typeof fetch !== 'function') return;
  swingLoading = true;
  fetch('./mocap/swings.json?v=action-v1')
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

// Captured vectors are actor-local. Retarget into world space once, parent-first.
const UPPER_MASK = ['spine','chest','neck','clav.R','arm.R','fore.R','hand.R'];
const smooth = (u) => {u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
function clipTimeFor(phase,u) {
  if(phase==='holding') return 0.08*smooth(u);
  if(phase==='windup') return 0.08+0.22*u;
  if(phase==='release') return 0.30+0.58*u;
  return 0.88+0.12*u;
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
  if(!SWINGS || !stance) return null;
  const id=stance.id || '';
  const kind=/Overhead/.test(id)?'overhead':/Stab/.test(id)?'stab':/Slash/.test(id)?'slash':null;
  if(!kind) return null; // Kicks, jabs, and reactions must not masquerade as slashes.
  return SWINGS[kind+':'+(kind==='slash' && /Left/.test(id)?'L':'R')] || null;
}
export function capturedMotion(attack,phase,u) {
  if(!SWINGS) {loadSwings();return null;}
  const clip=swingFor(stanceForAttack(attack)); if(!clip)return null;
  let weight=1;
  if(phase==='holding')weight=smooth(u);
  if(phase==='windup' && attack.hold===0)weight=smooth(u/.35);
  if(phase==='recovery')weight=1-smooth((u-.15)/.85);
  let time=clipTimeFor(phase,u);
  if(phase==='recovery' && attack.contactU!==undefined){const start=.30+.58*attack.contactU;time=start+Math.min(.08,1-start)*smooth(u/.25);}
  const frame=swingFrameAt(clip,time);
  const kind=/Stab/.test(attack.name)?'stab':/Overhead/.test(attack.name)?'overhead':'slash';
  let w=kind==='stab'?1:phase==='release'?(kind==='overhead'?smooth(u/.3):Math.sin(Math.PI*u)**2):0;
  if(phase==='recovery')w=kind==='stab'||kind==='overhead'?1:attack.contactU!==undefined?Math.sin(Math.PI*attack.contactU)**2:0;
  frame.AimTarget=[0,kind==='overhead' && (phase==='release'||phase==='recovery')?1.65-1.10*(phase==='release'?u:attack.contactU??1):1.30,1.45];
  frame.AimWeight=w;
  return {frame,weight,clip:clip.name};
}
export function loadLocomotion() {
  if (LOCO || locoLoading || typeof fetch !== 'function') return;
  locoLoading = true;
  fetch('./mocap/locomotion.json?v=action-v1')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) { LOCO = new Locomotion(j); if (typeof window !== 'undefined') { window.__locoKeys = Object.keys(j); window.__locoTiersData = LOCO.tiers(); } } else if (typeof window !== 'undefined') window.__locoErr = 'fetch not ok'; })
    .catch((e) => { if (typeof window !== 'undefined') window.__locoErr = String(e); })
    .finally(() => { locoLoading = false; });
}
if (typeof window !== 'undefined') window.__locoState = () => ({ loco: !!LOCO, calls: window.__locoCalls || 0, keys: window.__locoKeys || null });
export const locomotion = () => LOCO;


export async function initActors(loader) {
  await loadAnatomy();
  if (!ATLAS) ATLAS = await new Atlas(loader).ready();
  if (!LOCO) {
    try {
      const r = await fetch('./mocap/locomotion.json?v=action-v1');
      if (r.ok) LOCO = new Locomotion(await r.json());
    } catch (e) { LOCO = null; if (typeof window !== 'undefined') window.__locoErr = String(e); }
  }
  loadSwings();
  return ATLAS;
}
export const actorsReady = () => !!ATLAS;

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

// Analytic two-bone leg IK: fix planted feet without stretching the skeleton.
function placeFoot(rig,side,target,footWorldQ,poleHint=null) {
  const thigh=rig.byName.get('thigh.'+side),shin=rig.byName.get('shin.'+side),foot=rig.byName.get('foot.'+side);
  const S=thigh.getWorldPosition(new THREE.Vector3());
  const L1=shin.position.length(),L2=foot.position.length();
  const dir=target.clone().sub(S);const distance=Math.max(Math.abs(L1-L2)+.001,Math.min(L1+L2-.001,dir.length()));dir.normalize();
  const pole=(poleHint?.clone()||new THREE.Vector3(side==='R'?.08:-.08,0,1)).applyQuaternion(rig.root.getWorldQuaternion(new THREE.Quaternion()));pole.addScaledVector(dir,-pole.dot(dir));
  if(pole.lengthSq()<1e-8)pole.set(1,0,0);pole.normalize();
  const along=(L1*L1+distance*distance-L2*L2)/(2*distance);
  const E=S.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,L1*L1-along*along)));
  const goal=S.clone().addScaledVector(dir,distance);
  const pq=thigh.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  thigh.quaternion.setFromUnitVectors(shin.position.clone().normalize(),E.clone().sub(S).normalize().applyQuaternion(pq));thigh.updateMatrixWorld(true);
  const tq=thigh.getWorldQuaternion(new THREE.Quaternion()).invert();
  shin.quaternion.setFromUnitVectors(foot.position.clone().normalize(),goal.sub(E).normalize().applyQuaternion(tq));shin.updateMatrixWorld(true);
  foot.quaternion.copy(shin.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(footWorldQ));foot.updateMatrixWorld(true);
}

export class Actor {
  constructor(opts = {}) {
    this.rig = buildSkeleton();this.civilian=!!opts.civilian;this.firstPerson=!!opts.omitBones?.includes('head');this.riding=!!opts.riding;
    this.mats = soldierMaterials(ATLAS.m, opts.tint ?? 0x2f6ea6);
    let parts = buildSoldier(this.rig, this.mats, {
      kind: opts.kind || 'sword',riding:!!opts.riding,
      dress:opts.dress,helm: opts.helm || (opts.civilian?'coif':'nasal'),skinStyle:opts.skinStyle||'weathered',
      shield: opts.shield || 'kite',civilian:!!opts.civilian,layers:opts.civilian?['flesh','wool','surcoat']:undefined,
    });
    /* A BODY FOR THE PLAYER'S OWN EYES: the head, neck and arms are omitted rather than
     * hidden, because a skinned part cannot be switched off after assemble() has merged
     * it by material. Parts carry the bone they bind to, so filtering here is exact -
     * and dropping hand.R drops the sword with it. */
    if (opts.omitBones && opts.omitBones.length) {
      const drop = new Set(opts.omitBones);
      parts = parts.filter((q) => !drop.has(q.bone));
    }
    const shieldParts=parts.filter(p=>p.equipment==='shield');
    parts=parts.filter(p=>p.equipment!=='shield');
    this.rig.externalShield=true;
    const built = assemble(this.rig, parts);
    this.built = built;
    this.root = built.root;
    if(shieldParts.length){
      this.shield=new THREE.Group();
      const center=new THREE.Vector3(-.160, opts.shield==='round'?1:.86, .335);
      for(const p of shieldParts){const mesh=new THREE.Mesh(p.geo.clone().translate(-center.x,-center.y,-center.z),p.mat);this.shield.add(mesh);}
      this.root.add(this.shield);
    }
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

  resetPose(){
    this.t=0;this._lastWp=null;this._previousWp=null;this._previous=null;this._gait=0;
    this._movingBlend=0;this._motionLower=null;this._footLocks={};this._footRelease={};this._previousToeZ={};
  }
  reinGrip(side){return this.bone('hand.'+side).localToWorld(new THREE.Vector3(side==='R'?.042:-.042,0,.004));}
  updateRider(dt,seat){
    this.t+=dt;animate(this.rig,this.t,'stand');this._lastWp=null;this._footLocks={};this._movingBlend=0;
    const q=seat.getWorldQuaternion(new THREE.Quaternion()),p=seat.getWorldPosition(new THREE.Vector3());this.root.quaternion.copy(q);this.root.position.copy(p).sub(new THREE.Vector3(0,.98,0).applyQuaternion(q));this.bone('hips').position.y=.98;this.root.updateMatrixWorld(true);
    for(const side of ['L','R']){const sign=side==='R'?1:-1,target=seat.localToWorld(new THREE.Vector3(sign*.46,-.68,.10));placeFoot(this.rig,side,target,q,new THREE.Vector3(sign*1.7,0,1));this.root.updateMatrixWorld(true);const hand=seat.localToWorld(new THREE.Vector3(sign*.13,.25,.34));const chest=this.bone('chest');solveArm(this.rig,side,{hand:chest.worldToLocal(hand).toArray(),pole:[sign*.35,-1,-.2]});const wrist=this.bone('hand.'+side);wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));wrist.updateMatrixWorld(true);}
    if(this.shield)this.shield.visible=false;this.root.updateMatrixWorld(true);this.built.skeleton.update();
  }
  update(dt, f, moving = 0, terrain = null) {
    if(!f)return;
    this.t+=dt;
    this.root.updateWorldMatrix(true,true);
    const wp=this.root.getWorldPosition(new THREE.Vector3());
    const speed=gaitSpeed(this._lastWp,wp,dt);
    this._lastWp=wp.clone();
    const dead=f.alive===false || f.state==='dead';
    animate(this.rig,this.t,dead?'dead':'stand');
    if(dead){this._previous=null;this._footLocks={};if(this.shield){this.shield.position.set(-.28,.04,.30);this.shield.rotation.set(-Math.PI/2,0,.12);}return;}
    // Base stance and locomotion are resolved BEFORE the upper-body capture.
    applyPose(this.rig,GUARD_POSE,1);
    if(!LOCO)loadLocomotion();
    const lowerBase=new Map(Actor.LOWER.map(n=>[n,this.bone(n).quaternion.clone()]));
    const baseHipY=this.bone('hips').position.y;
    this._movingBlend=lerp(this._movingBlend||0,speed>.08?1:0,1-Math.exp(-dt*12));
    this._contactFlags={L:false,R:false};
    if(LOCO && speed>.08) {
      const tiers=LOCO.tiers();let lo=tiers[0],hi=lo;
      for(let i=1;i<tiers.length;i++){hi=tiers[i];if(speed<=hi.speed)break;lo=hi;}
      const blend=lo===hi?0:clamp01((speed-lo.speed)/(hi.speed-lo.speed));
      const strideLo=LOCO.d[lo.name].stride, strideHi=LOCO.d[hi.name].stride;
      const stride=lerp(strideLo,strideHi,blend);
      this._gait=(this._gait || 0)+dt*speed/Math.max(.1,stride);
      const a=LOCO.sample(lo.name,this._gait*LOCO.d[lo.name].seconds);
      const b=LOCO.sample(hi.name,this._gait*LOCO.d[hi.name].seconds);
      const jt={};
      for(const k of Object.keys(a))jt[k]=a[k].map((v,i)=>lerp(v,(b[k] || a[k])[i],blend));
      const contacts={};this._previousToeZ=this._previousToeZ || {};
      for(const side of ['L','R']){
        const key=side==='L'?'LeftToe':'RightToe',z=jt[key][2];
        contacts[side]=jt[key][1]<.065 && this._previousToeZ[side]!==undefined && z<this._previousToeZ[side]-1e-5;
        this._previousToeZ[side]=z;
      }
      // Stepping follows movement relative to facing, including backpedals and strafes.
      const velocity=wp.clone().sub(this._previousWp || wp);
      const facing=this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      velocity.applyQuaternion(facing);
      const travelAngle=Math.atan2(velocity.x,velocity.z);
      if(velocity.lengthSq()>1e-8) {
        const c=Math.cos(travelAngle),s=Math.sin(travelAngle);
        for(const k of Object.keys(jt))if(/Leg|Foot|Toe/.test(k)){
          const v=jt[k],hx=jt.Hips[0],hz=jt.Hips[2];
          const x=v[0]-hx,z=v[2]-hz;
          // Keep hip spacing anatomical; rotate stride excursion, not the entire legs.
          const restX=k.startsWith('Right')?.10:-.10;
          v[0]=hx+restX+(x-restX)*c+z*s;v[2]=hz+z*c-(x-restX)*s;
        }
      }
      this._capturedBody=jt;applyMocapFrame(this.rig,jt,{mask:Actor.LOWER});
      this._contactFlags=contacts;
      this._motionLower=new Map(Actor.LOWER.map(n=>[n,this.bone(n).quaternion.clone()]));
      this._motionHipY=this.bone('hips').position.y;
      this._loco={spd:speed,clip:lo.name+'+'+hi.name,blend};
      if(typeof window!=='undefined'){window.__loco=this._loco;window.__locoCalls=(window.__locoCalls||0)+1;}
    }
    if(this._motionLower) {
      for(const [n,q] of lowerBase)this.bone(n).quaternion.copy(q).slerp(this._motionLower.get(n),this._movingBlend);
      this.bone('hips').position.y=lerp(baseHipY,this._motionHipY,this._movingBlend);
    }
    this.root.updateWorldMatrix(true,true);
    this._previousWp=wp.clone();
    // Guard is a stable base for transitions, not an unrelated idle arm pose.
    applyPose(this.rig,GUARD_POSE,1,{skip:Actor.LOWER});
    const base=new Map(UPPER_MASK.map(n=>[n,this.bone(n).quaternion.clone()]));
    let motion=null;
    if(f.attack){
      const info=f.phaseInfo?f.phaseInfo():{phase:'release',u:0};
      motion=capturedMotion(f.attack,info.phase,info.u);
      if(motion){
        applyMocapFrame(this.rig,motion.frame,{mask:UPPER_MASK});
        for(const [n,q] of base){const bone=this.bone(n),target=bone.quaternion.clone();bone.quaternion.copy(q).slerp(target,motion.weight);}
        this.root.updateWorldMatrix(true,true);
        if(typeof window!=='undefined')window.__swingUses=(window.__swingUses||0)+1;
      } else {
        const st=stanceForAttack(f.attack);if(st)applyPose(this.rig,poseAt(st,info.phase,info.u),1,{skip:Actor.LOWER});
      }
    } else if(f.state==='stagger' || f.state==='exhausted'){
      const st=stanceById(f.state==='stagger'?'Stagger':'Fatigue');
      if(st)applyPose(this.rig,poseAt(st,'hold',0),1,{skip:Actor.LOWER});
    }
    if(this.civilian&&!f.attack&&!f.guard&&f.state==='idle'){const frame=this._capturedBody||LOCO?.d?.walk?.frames?.[0];if(frame){applyMocapFrame(this.rig,frame,{mask:UPPER_MASK});if(typeof window!=='undefined')window.__civilianMotionUses=(window.__civilianMotionUses||0)+1;}}
    // The off-hand carries a shield. It must not perform the source performer's two-hand sword grip.
    if(this.shield){solveArm(this.rig,'L',GUARD_POSE.ik.L);rollShieldClear(this.rig);}
    // Frame-rate-independent transition damping, including interrupts and feints.
    const alpha=1-Math.exp(-Math.max(0,dt)*32);
    if(this._previous && !this.noSmoothing && !f.attack)for(const b of this.rig.bones){
      if(Actor.LOWER.includes(b.name) || b.name==='root')continue;
      const prev=this._previous.get(b.name);if(prev){const target=b.quaternion.clone();b.quaternion.copy(prev).slerp(target,alpha);}
    }
    this._previous=new Map(this.rig.bones.map(b=>[b.name,b.quaternion.clone()]));
    this.root.updateWorldMatrix(true,true);
    // Preserve flight phases, but never let a sole penetrate the ground.
    const toePoints=['toe.L','toe.R'].map(n=>this.bone(n).getWorldPosition(new THREE.Vector3()));
    const ground=this.root.getWorldPosition(new THREE.Vector3()).y;
    const floorAt=(x,z)=>terrain?terrain(x,z):ground;
    const inContact=this._contactFlags.L || this._contactFlags.R;
    const correction=Math.max(...toePoints.map(p=>floorAt(p.x,p.z)+.032-p.y));
    this.bone('hips').position.y+=Math.max(inContact?-.10:0,Math.min(.12,correction));
    this.root.updateWorldMatrix(true,true);
    this._footLocks=this._footLocks || {};
    for(const side of ['L','R']) {
      const foot=this.bone('foot.'+side),toe=this.bone('toe.'+side),shin=this.bone('shin.'+side);
      const F=foot.getWorldPosition(new THREE.Vector3()),T=toe.getWorldPosition(new THREE.Vector3());
      const fq=foot.getWorldQuaternion(new THREE.Quaternion());
      if(terrain&&(speed<.08||this._contactFlags[side])){const e=.15,n=new THREE.Vector3(-(floorAt(F.x+e,F.z)-floorAt(F.x-e,F.z))/(2*e),1,-(floorAt(F.x,F.z+e)-floorAt(F.x,F.z-e))/(2*e)).normalize(),up=new THREE.Vector3(0,1,0).applyQuaternion(fq);fq.premultiply(new THREE.Quaternion().setFromUnitVectors(up,n));}
      const contact=speed>.08 && this._movingBlend>.95 && this._contactFlags[side];
      this._footRelease=this._footRelease || {};
      if(!contact){
        if(this._footLocks[side])this._footRelease[side]=this._footLocks[side].clone().sub(T);
        delete this._footLocks[side];
      }
      else if(!this._footLocks[side])this._footLocks[side]=T.clone().setY(floorAt(T.x,T.z)+.032);
      const lock=this._footLocks[side];
      const ankle=lock?lock.clone().add(F.clone().sub(T)):F;
      if(!lock && this._footRelease[side]){this._footRelease[side].multiplyScalar(Math.exp(-dt*24));ankle.add(this._footRelease[side]);}
      if(lock)delete this._footRelease[side];
      // Keep knees bending forward during strafes/backpedals too.
      // Contact follows the actual boot sole, not the toe marker alone.
      let soleOffset=Infinity,groundUnderSole=-Infinity;
      for(let i=0;i<20;i++){const angle=i*Math.PI*2/20,point=new THREE.Vector3(.047*Math.cos(angle),-.071,.056+.122*Math.sin(angle)).applyQuaternion(fq);soleOffset=Math.min(soleOffset,point.y);groundUnderSole=Math.max(groundUnderSole,floorAt(ankle.x+point.x,ankle.z+point.z)-point.y);}
      const soleLift=Math.max(0,groundUnderSole+.007-ankle.y);ankle.y+=soleLift;
      if(speed>.08||soleLift>1e-6)placeFoot(this.rig,side,ankle,fq);
    }
    this.root.updateWorldMatrix(true,true);
    const finalLift=Math.max(...['toe.L','toe.R'].map(n=>{const p=this.bone(n).getWorldPosition(new THREE.Vector3());return floorAt(p.x,p.z)+.032-p.y;}));
    this.bone('hips').position.y+=Math.max(0,finalLift);
    this.root.updateWorldMatrix(true,true);
    if(this.shield){
      const wrist=this.root.worldToLocal(this.bone('hand.L').getWorldPosition(new THREE.Vector3()));
      const elbow=this.root.worldToLocal(this.bone('fore.L').getWorldPosition(new THREE.Vector3()));
      this.shield.position.copy(wrist).lerp(elbow,.35).add(new THREE.Vector3(-.015,-.10,.105));
      this.shield.rotation.set(-.05,-.16,.04);
    }
    this.built.skeleton.update();
  }

  /* used by the tests: where is the sword hand, and did it actually travel */
  handWorld(out = new THREE.Vector3()) {
    const h = this.bone('hand.R');
    if (!h) return null;
    this.root.updateMatrixWorld(true);
    return h.getWorldPosition(out);
  }
}

/* ===========================================================================
 * SWEEP A STRIKE FRAME BY FRAME AND WATCH WHERE THE ARMS ACTUALLY GO.
 * Sampling a man during play proves nothing: he may never have swung in the window.
 * This applies every frame of a clip to a throwaway actor and reports, for each hand,
 * how far ABOVE THE HEAD it gets, plus how hard the clavicle is being twisted - a
 * clavicle driven by the capture's shoulder position will carry the whole arm up and
 * over the head even though the hand itself is only at chest height.
 * =========================================================================== */
/* WHERE DOES HE HOLD HIS ARMS WHEN HE IS NOT SWINGING?
 * The man stands in front of you in a guard far longer than he swings, so if the guard
 * pose is the one with the arms up, that is what "the arms go over their head" means. */
export function poseSweep() {
  const act = makeActor({ tint: 0x2f6ea6, kind: 'sword', helm: 'kettle', shield: 'kite', shadows: false });
  const out = {};
  const g = (n) => { const b = act.bone(n); if (!b) return null; const p = new THREE.Vector3(); b.getWorldPosition(p); return p; };
  const measure = (label, pose, w) => {
    for (const n of ['clav.R', 'clav.L', 'arm.R', 'arm.L', 'fore.R', 'fore.L', 'hand.R', 'hand.L', 'chest', 'neck', 'head', 'spine']) {
      const b = act.bone(n); if (b) b.quaternion.identity();
    }
    animate(act.rig, 0.4, 'idle');
    act.root.updateMatrixWorld(true);
    if (pose) { applyPose(act.rig, pose, w === undefined ? 1 : w, { skip: Actor.LOWER }); act.root.updateMatrixWorld(true); }
    const head = g('head'), hr = g('hand.R'), hl = g('hand.L');
    const elr = g('fore.R'), ell = g('fore.L'), clr = g('clav.R');
    out[label] = {
      handR: hr && head ? +(hr.y - head.y).toFixed(3) : null,
      handL: hl && head ? +(hl.y - head.y).toFixed(3) : null,
      elbowR: elr && head ? +(elr.y - head.y).toFixed(3) : null,
      elbowL: ell && head ? +(ell.y - head.y).toFixed(3) : null,
      clavR: clr && head ? +(clr.y - head.y).toFixed(3) : null,
    };
  };
  measure('idle-bare', null);
  measure('guard-1.0', GUARD_POSE, 1);
  measure('guard-0.85', GUARD_POSE, 0.85);
  for (const id of ['Guard', 'BlockImpact', 'Riposte', 'Parry', 'Stagger', 'Fatigue', 'Taunt', 'Death']) {
    const st = stanceById(id);
    if (!st) continue;
    for (const ph of ['chamber', 'strike']) {
      const p = poseAt(st, 'release', ph === 'strike' ? 1 : 0);
      if (p) measure(id + ':' + ph, p, 1);
    }
  }
  return out;
}
export function armSweep(clipName, opts = {}) {
  const act = makeActor({ tint: 0x2f6ea6, kind: 'sword', helm: 'kettle', shield: 'kite', shadows: false });
  if (!SWINGS) loadSwings();
  const store = SWINGS;
  const c = store ? store[clipName] : null;
  if (!c) return { error: 'no clip ' + clipName, keys: store ? Object.keys(store) : null };
  const rows = [];
  const v = () => new THREE.Vector3();
  const mk = opts.resetClav !== false;
  for (let i = 0; i < c.frames.length; i++) {
    /* reset the upper body to rest each frame so nothing accumulates */
    if (mk) {
      for (const n of UPPER_MASK) { const b = act.bone(n); if (b) b.quaternion.identity(); }
      act.root.updateMatrixWorld(true);
    }
    applyMocapFrame(act.rig, c.frames[i], { mask: UPPER_MASK });
    act.root.updateMatrixWorld(true);
    const g = (n) => { const b = act.bone(n); if (!b) return null; const p = v(); b.getWorldPosition(p); return p; };
    const head = g('head'), hr = g('hand.R'), hl = g('hand.L'), elr = g('fore.R'), cl = g('clav.R'), ch = g('chest');
    if (!head || !hr) continue;
    let clavTilt = null;
    if (cl && ch) clavTilt = +((cl.y - ch.y)).toFixed(3);
    rows.push({ i, r: +(hr.y - head.y).toFixed(3), l: hl ? +(hl.y - head.y).toFixed(3) : null,
                elbowR: elr ? +(elr.y - head.y).toFixed(3) : null, clavTilt });
  }
  const pick = (k) => { const a = rows.map((r) => r[k]).filter((x) => x !== null); return a.length ? { min: Math.min(...a), max: Math.max(...a) } : null; };
  return { clip: clipName, frames: rows.length, handR: pick('r'), handL: pick('l'), elbowR: pick('elbowR'), clavTilt: pick('clavTilt'), rows };
}

export function makeActor(opts) {
  return new Actor(opts);
}
