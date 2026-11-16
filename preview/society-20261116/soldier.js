/* ===========================================================================
 * SOLDIER: original armour, clothing and rig with a CC0 anatomical head
 * ===========================================================================
 * Mason: "i didnt want you to take the models we have and alter them slightly.
 * use the models we have as a guide, and make a perfect middle man. something
 * that looks good in formation, can be easily animated for the marching and
 * other animations, im looking for characters that rival Mount and Blade
 * Bannerlord 2. not super realistic but at the same time it kind of is."
 *
 * The rig, armour and clothing are original. The head is derived from the
 * MakeHuman CC0 core asset, with provenance in anatomy/head.json. Movement
 * comes from CMU capture. No KayKit character is used.
 *
 * THE BANNERLORD READ, which is what makes it a "middle man":
 *   - Heroic but not cartoon proportions, 7.5 heads tall, real shoulder width.
 *   - LAYERS, in this order from the body out: flesh, wool, mail, surcoat, belt,
 *     plate. Layers are what separate Bannerlord from either toy soldiers or
 *     photoreal, because the silhouette breaks up in steps.
 *   - The face is partly hidden by a helm with a nasal or an aventail, which is
 *     how a game gets away with a simple face.
 *   - Realm colour on the surcoat and shield, so a formation reads as one side.
 *
 * WHY IT IS EASY TO ANIMATE: the whole man is ONE skeleton and every part is
 * skinned rigidly to the bone that owns it, with the joints covered by cops and
 * mail so nothing gaps. No clips, no retargeting: marching, walking, charging,
 * standing and dying are all generated from a phase number by animate().
 * =========================================================================== */

import * as THREE from 'three';
import {anatomicalHead,headCapSections,skinColor} from './anatomy.js';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ skeleton
 * Heights in metres for a 1.80m man. Bone rest positions are absolute here and
 * converted to parent-relative when the skeleton is built. */
export const RIG_DEF = [
  ['root',     null,        0,         0,     0],
  ['hips',     'root',      0,         0.98,  0],
  ['spine',    'hips',      0,         1.12,  0],
  ['chest',    'spine',     0,         1.30,  0],
  ['neck',     'chest',     0,         1.50,  0.006],
  ['head',     'neck',      0,         1.575, 0.008],
  ['clav.L',   'chest',    -0.055,     1.45,  0.004],
  ['arm.L',    'clav.L',   -0.196,     1.435, 0],
  ['fore.L',   'arm.L',    -0.206,     1.155, 0],
  ['hand.L',   'fore.L',   -0.211,     0.900, 0],
  ['clav.R',   'chest',     0.055,     1.45,  0.004],
  ['arm.R',    'clav.R',    0.196,     1.435, 0],
  ['fore.R',   'arm.R',     0.206,     1.155, 0],
  ['hand.R',   'fore.R',    0.211,     0.900, 0],
  ['thigh.L',  'hips',     -0.092,     0.965, 0],
  ['shin.L',   'thigh.L',  -0.098,     0.525, 0],
  ['foot.L',   'shin.L',   -0.100,     0.095, 0],
  ['toe.L',    'foot.L',   -0.100,     0.030, 0.10],
  ['thigh.R',  'hips',      0.092,     0.965, 0],
  ['shin.R',   'thigh.R',   0.098,     0.525, 0],
  ['foot.R',   'shin.R',    0.100,     0.095, 0],
  ['toe.R',    'foot.R',    0.100,     0.030, 0.10],
];

export function buildSkeleton() {
  const byName = new Map();
  const bones = [];
  for (const [name, parent, x, y, z] of RIG_DEF) {
    const b = new THREE.Bone();
    b.name = name;
    const p = parent ? byName.get(parent) : null;
    if (p) {
      b.position.set(x - p.userData.abs.x, y - p.userData.abs.y, z - p.userData.abs.z);
      p.add(b);
    } else {
      b.position.set(x, y, z);
    }
    b.userData.abs = { x, y, z };
    byName.set(name, b);
    bones.push(b);
  }
  return { bones, byName, root: byName.get('root') };
}

/* ------------------------------------------------------------------ geometry
 * A lofted surface: rings of elliptical cross sections joined into a tube. This
 * is what gives a real torso and head their shape, where a cylinder cannot. */
function loft(sections, segs = 18, capTop = true, capBottom = true) {
  const pos = [], idx = [];
  for (const s of sections) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push((s.x || 0) + Math.cos(a) * s.rx, s.y, (s.z || 0) + Math.sin(a) * s.rz);
    }
  }
  const n = sections.length;
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < segs; i++) {
      const a = r * segs + i, b = r * segs + (i + 1) % segs;
      const c = (r + 1) * segs + i, d = (r + 1) * segs + (i + 1) % segs;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capBottom) {
    const base = pos.length / 3;
    const s0 = sections[0];
    pos.push(s0.x || 0, s0.y, s0.z || 0);
    for (let i = 0; i < segs; i++) idx.push(base, i, (i + 1) % segs);
  }
  if (capTop) {
    const base = pos.length / 3;
    const sN = sections[n - 1];
    pos.push(sN.x || 0, sN.y, sN.z || 0);
    const off = (n - 1) * segs;
    for (let i = 0; i < segs; i++) idx.push(base, off + (i + 1) % segs, off + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  /* a plain planar UV so tiling materials sit sensibly on a lofted surface */
  const uv = [];
  const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
  const size = bb.getSize(new THREE.Vector3());
  for (let i = 0; i < g.attributes.position.count; i++) {
    const p = g.attributes.position;
    uv.push((p.getX(i) - bb.min.x) / (size.x || 1), (p.getY(i) - bb.min.y) / (size.y || 1));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const limb = (rTop, rBot, len) => loft([
  { y: 0, rx: rTop, rz: rTop * 0.92 },
  { y: -len * 0.5, rx: (rTop + rBot) / 2, rz: (rTop + rBot) * 0.46 },
  { y: -len, rx: rBot, rz: rBot * 0.92 },
], 12, true, true);

/* A LIMB THAT RUNS PAST BOTH OF ITS OWN JOINTS.
 * The gap problem was structural, not a weighting problem: thigh and shin were
 * built end-to-end (thigh ends at 0.525, shin begins at 0.525), so the instant the
 * knee bends the two flat caps swing apart and open a wedge. Every segment now
 * reaches ext metres BEYOND its bone at each end, so the segment below rotates
 * through the one above instead of away from it. Same radii at the seam, so the
 * overlap is invisible until a joint bends, and then it is what fills the hole. */
const limbO = (rTop, rBot, len, extTop, extBot) => loft([
  { y: extTop, rx: rTop * 1.01, rz: rTop * 0.93 },
  { y: 0, rx: rTop, rz: rTop * 0.92 },
  { y: -len * 0.5, rx: (rTop + rBot) / 2, rz: (rTop + rBot) * 0.46 },
  { y: -len, rx: rBot, rz: rBot * 0.92 },
  { y: -len - extBot, rx: rBot * 0.98, rz: rBot * 0.90 },
], 12, true, true);

const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);

/* ------------------------------------------------------------------ materials */
export function soldierMaterials(M, realm = 0x2f6f9e) {
  const cloth = M.cloth.clone();
  cloth.color = new THREE.Color(realm);
  // A wooden shield is not dark leather. Use low-contrast grain so its face stays readable.
  if (!soldierMaterials.woodMap && typeof document !== 'undefined') {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
    const cx=canvas.getContext('2d'),im=cx.createImageData(128,256);
    for(let y=0;y<256;y++)for(let x=0;x<128;x++){
      const i=(y*128+x)*4,grain=Math.sin(x*.51+Math.sin(y*.027)*.8)*5+Math.sin(x*1.81+y*.033)*2;
      const seam=x%32<2?-15:0;
      im.data[i]=157+grain+seam;im.data[i+1]=119+grain+seam;im.data[i+2]=75+grain+seam;im.data[i+3]=255;
    }
    cx.putImageData(im,0,0);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;soldierMaterials.woodMap=tex;
  }
  const shieldWood=new THREE.MeshStandardMaterial({map:soldierMaterials.woodMap || null,color:soldierMaterials.woodMap?0xffffff:0x9d774b,roughness:.93,metalness:0});
  const steel=M.steel.clone();steel.roughness=.58;steel.metalness=.72;steel.normalScale.setScalar(.32);
  const steelDark=M.steelDark.clone();steelDark.roughness=.65;steelDark.metalness=.65;steelDark.normalScale.setScalar(.28);
  const mail=M.mail.clone();mail.roughness=.76;mail.metalness=.55;mail.normalScale.setScalar(.25);
  if(!M.woolMap){M.woolMap=M.cloth.map.clone();M.woolNormal=M.cloth.normalMap.clone();M.woolMap.repeat.set(6,6);M.woolNormal.repeat.set(6,6);M.woolMap.needsUpdate=true;M.woolNormal.needsUpdate=true;}const woolMap=M.woolMap,woolNormal=M.woolNormal;
  const wool=new THREE.MeshPhysicalMaterial({map:woolMap,normalMap:woolNormal,normalScale:new THREE.Vector2(.12,.12),color:0x4b453a,roughness:.96,sheen:.32,sheenColor:new THREE.Color(0x686159),sheenRoughness:.94});
  const woolDark=wool.clone();woolDark.color.set(0x33302a);
  return {
    skin: new THREE.MeshStandardMaterial({ color: 0xc2916b, roughness: 0.72, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2a1d15, roughness: 0.88 }),
    wool,woolDark,
    mail,
    steel,
    steelDark,
    leather: M.leather.clone(),
    cloth,
    shieldWood,
    brass: M.brass.clone(),
    heraldry: M.heraldry.clone(),
  };
}

/* =========================================================================
 * THE MAN. Every part is registered with the bone that owns it, so the whole
 * body can be merged and skinned in one pass at the end.
 * ========================================================================= */
export function buildSoldier(rig, mats, spec = {}) {
  const parts = [];              /* { geo, mat, bone } */
  const P = (geo, mat, bone) => parts.push({ geo, mat, bone });
  mats.skin.color.set(skinColor(spec.skinStyle));const kind = spec.kind || 'spear';       /* spear | sword | knight */
  const helm = spec.helm || (kind === 'knight' ? 'great' : 'nasal');
  const has = (k) => (spec.layers || 'flesh wool mail surcoat').includes(k);

  /* ---------------- torso: one lofted body, the anchor of the silhouette */
  P(loft([
    { y: 0.94, rx: 0.150, rz: 0.100 },
    { y: 1.02, rx: 0.163, rz: 0.110 },
    { y: 1.13, rx: 0.146, rz: 0.098 },
    { y: 1.24, rx: 0.173, rz: 0.112 },
    { y: 1.34, rx: 0.203, rz: 0.128 },
    { y: 1.42, rx: 0.199, rz: 0.124 },
    { y: 1.47, rx: 0.152, rz: 0.104 },
  ], 20), mats[has('mail') ? 'mail' : 'wool'], 'chest');

  /* Open, skinned collar: the clean neckline continues beneath the garment. */
  parts.push({geo:loft([{y:1.449,rx:.133,rz:.103},{y:1.474,rx:.104,rz:.094},{y:1.508,rx:.077,rz:.083},{y:1.535,rx:.066,rz:.076}],32,false,false),mat:mats[has('mail')?'mail':'wool'],bone:'chest',skinChain:[{upper:'neck',lower:'chest',y:1.510,band:.026}]});
  /* Connected anatomical head and neck, rather than a rigid cylinder. */
  parts.push(...anatomicalHead(mats,helm==='great',spec.skinStyle));

  /* ---------------- helmet variants */
  const helmetStart=parts.length,cap=headCapSections(helm==='coif'),rim=cap[0];
  if(helm==='coif'){P(loft(cap,32,false,true),mats.wool,'head');}
  else if(helm==='nasal'){
    P(loft(cap,28,false,true),mats.steel,'head');
    P(cyl(rim.rx+.002,rim.rx+.003,.014,32).scale(1,1,rim.rz/rim.rx).translate(0,rim.y,rim.z),mats.steelDark,'head');
    const top=new THREE.Vector3(0,rim.y,rim.z+rim.rz-.004),bottom=new THREE.Vector3(0,1.623,.155),dir=top.clone().sub(bottom);
    P(box(.017,dir.length(),.014).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize())).translate(...top.add(bottom).multiplyScalar(.5).toArray()),mats.steel,'head');
  } else if(helm==='kettle'){
    P(loft(cap,28,false,true),mats.steel,'head');
    const rx=rim.rx+.047,rz=rim.rz+.047;
    P(cyl(rx,rx+.003,.014,32).scale(1,1,rz/rx).translate(0,rim.y-.005,rim.z),mats.steelDark,'head');
  } else {
    /* great helm: the knight's read, a cylinder with a faceplate and sight slit */
    P(loft([
      { y: 1.560, rx: 0.098, rz: 0.104 },
      { y: 1.600, rx: 0.104, rz: 0.112 },
      { y: 1.700, rx: 0.106, rz: 0.114 },
      { y: 1.760, rx: 0.096, rz: 0.104 },
      { y: 1.795, rx: 0.048, rz: 0.052 },
    ], 18), mats.steel, 'head');
    P(box(0.170, 0.016, 0.030).translate(0, 1.686, 0.104), mats.steelDark, 'head');
    for (const s of [-1, 1]) P(box(0.062, 0.012, 0.016).translate(s * 0.050, 1.664, 0.110), mats.hair, 'head');
    P(cyl(0.108, 0.108, 0.012, 18).scale(1, 1, 1.10).translate(0, 1.560, 0), mats.brass, 'head');
  }

  for(let i=helmetStart;i<parts.length;i++){parts[i].rigid=true;parts[i].headwear=helm;}

  /* Continuous, weighted cloth surfaces. Joint masses are anatomical, not separate balls. */
  const soft=(geo,mat,bone,joint)=>parts.push({geo,mat,bone,softJoint:joint});
  const segment=(A,B,r,mat,bone)=>{const av=new THREE.Vector3(...A),bv=new THREE.Vector3(...B),d=bv.clone().sub(av),g=new THREE.CylinderGeometry(r*.92,r,d.length(),7,1);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());P(g,mat,bone);};
  for(const side of ['L','R']){
    const sign=side==='L'?-1:1,arm='arm.'+side,fore='fore.'+side,hand='hand.'+side;
    const rings=[{y:1.485,rx:.038,rz:.041,x:sign*.196},{y:1.455,rx:.067,rz:.067,x:sign*.196},{y:1.405,rx:.073,rz:.068,x:sign*.197},{y:1.34,rx:.063,rz:.058,x:sign*.199},{y:1.24,rx:.052,rz:.049,x:sign*.203},{y:1.20,rx:.047,rz:.046,x:sign*.205},{y:1.165,rx:.044,rz:.043,x:sign*.206},{y:1.13,rx:.045,rz:.044,x:sign*.207},{y:1.10,rx:.049,rz:.046,x:sign*.208},{y:1.02,rx:.045,rz:.041,x:sign*.210},{y:.945,rx:.032,rz:.034,x:sign*.211},{y:.895,rx:.030,rz:.031,x:sign*.211}];
    soft(loft(rings,20),has('mail')?mats.mail:mats.wool,arm,{upper:arm,lower:fore,y:1.155,band:.065});
    P(loft([{y:1.115,rx:.050,rz:.046,x:sign*.207},{y:1.02,rx:.046,rz:.044,x:sign*.21},{y:.934,rx:.035,rz:.037,x:sign*.211}],16),mats.leather,fore);
    if(!spec.civilian)P(loft([{y:1.456,rx:.061,rz:.063,x:sign*.2},{y:1.431,rx:.078,rz:.075,x:sign*.203},{y:1.381,rx:.073,rz:.069,x:sign*.211}],20),mats.steel,arm);
    const armed=kind!=='none';
    if(armed){
      const tx=sign*.253,ty=.900,tz=.004;
      const handMatrix=new THREE.Matrix4().makeTranslation(tx,ty,tz).multiply(new THREE.Matrix4().makeRotationZ(sign*-.20)).multiply(new THREE.Matrix4().makeRotationX(.22));
      const hp=(g,mat)=>{P(g.applyMatrix4(handMatrix),mat,hand);parts[parts.length-1].rigid=true;};
      hp(sph(.045,14,10).scale(.68,1.0,.65).translate(-sign*.039,-.006,.014),mats.leather);
      for(let finger=0;finger<4;finger++){
        const y=-.044+finger*.023,R=.026,points=[.9,-.25,-1.45,-2.65].map(a=>new THREE.Vector3(-sign*Math.cos(a)*R,y,Math.sin(a)*R));
        const curve=new THREE.CatmullRomCurve3(points);hp(new THREE.TubeGeometry(curve,9,.0095,7,false),mats.leather);hp(sph(.010,8,6).translate(...points[0].toArray()),spec.civilian?mats.leather:mats.steel);
      }
      hp(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-sign*.045,.035,.018),new THREE.Vector3(-sign*.024,.031,.036),new THREE.Vector3(sign*.004,.017,.028)]),8,.012,7,false),mats.leather);
    }else{
      P(sph(.048,14,10).scale(.52,1.0,.87).translate(sign*.213,.866,.005),mats.leather,hand);
      for(let finger=0;finger<4;finger++){const z=-.027+finger*.019,len=[.060,.079,.081,.069][finger],A=[sign*.211,.832,z],B=[sign*.218,.832-len*.6,z+.003],C=[sign*.233,.832-len,z+.004];segment(A,B,.0088,mats.leather,hand);segment(B,C,.008,mats.leather,hand);P(sph(.008,7,5).translate(...C),mats.skin,hand);}
      segment([sign*.211,.886,.045],[sign*.223,.851,.059],.011,mats.leather,hand);segment([sign*.223,.851,.059],[sign*.236,.829,.048],.009,mats.skin,hand);
    }
    const thigh='thigh.'+side,shin='shin.'+side;
    soft(loft([{y:1.02,rx:.073,rz:.077,x:sign*.092},{y:.965,rx:.089,rz:.081,x:sign*.092},{y:.87,rx:.086,rz:.078,x:sign*.093},{y:.74,rx:.074,rz:.069,x:sign*.095},{y:.62,rx:.062,rz:.059,x:sign*.097},{y:.56,rx:.058,rz:.058,x:sign*.098},{y:.525,rx:.058,rz:.057,x:sign*.098},{y:.49,rx:.060,rz:.057,x:sign*.098},{y:.43,rx:.065,rz:.060,x:sign*.099},{y:.33,rx:.059,rz:.054,x:sign*.100},{y:.23,rx:.047,rz:.046,x:sign*.100},{y:.13,rx:.043,rz:.043,x:sign*.100}],20),mats.wool,thigh,{upper:thigh,lower:shin,y:.525,band:.075});
    if(!spec.civilian)P(sph(.080,16,12).scale(.84,1.05,.30).translate(sign*.098,.525,.073),mats.steel,shin);
    P(loft([{y:.245,rx:.050,rz:.049,x:sign*.100},{y:.17,rx:.051,rz:.053,x:sign*.100},{y:.09,rx:.053,rz:.085,x:sign*.100,z:.021},{y:.042,rx:.052,rz:.123,x:sign*.100,z:.054},{y:.024,rx:.047,rz:.122,x:sign*.100,z:.056}],20),mats.leather,'foot.'+side);parts[parts.length-1].rigid=true;
  }

  /* ---------------- the mail skirt and the surcoat: the layers that read */
  if (has('mail')) {
    P(loft([
      { y: 1.00, rx: 0.170, rz: 0.118 },
      { y: 0.86, rx: 0.180, rz: 0.126 },
      { y: 0.70, rx: 0.176, rz: 0.124 },
      { y: 0.62, rx: 0.168, rz: 0.118 },
    ], 20, false, false), mats.mail, 'hips');
  }
  if (has('surcoat')) {
    /* front and back panels, split so the legs can swing through it */
    for (const [zc, rz] of [[1, 0.130], [-1, -0.130]]) {
      P(loft([
        { y: 1.42, rx: 0.160, rz: 0.022, z: zc * 0.113 },
        { y: 1.10, rx: 0.170, rz: 0.022, z: zc * 0.119 },
        { y: 0.92, rx: 0.172, rz: 0.022, z: zc * 0.121 },
        { y: 0.74, rx: 0.152, rz: 0.020, z: zc * 0.119 },
      ], 16), mats.cloth, 'hips');
    }
    /* the device sits on the chest, where it reads from the front */
    const dev = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), mats.heraldry);
    dev.position.set(0, 1.27, 0.148);
    parts.push({ mesh: dev, bone: 'chest' });
  }
  /* belt */
  P(cyl(0.175, 0.175, 0.034, 20).scale(1, 1, 0.72).translate(0, 0.995, 0), mats.leather, 'hips');
  P(box(0.052, 0.044, 0.012).translate(0, 0.995, 0.156), mats.brass, 'hips');
  P(box(0.070, 0.090, 0.046).translate(0.130, 0.945, 0.122), mats.leather, 'hips');

  /* ---------------- weapons
   * THESE ARE SKINNED TO hand.R BUT AUTHORED IN ABSOLUTE BIND SPACE, so they have
   * to be built around the hand and angled clear of the arm. Authored at the world
   * origin instead, the sword hung straight through the torso and down into the
   * shin (10 of 43 verts inside the torso, up to 97mm deep) and the spear stood on
   * the ground through the centre of the body. Each weapon is now built with its
   * GRIP at the local origin and then transformed into the hand: tilted outboard
   * so the blade clears the forearm and the pauldron, and forward so it clears the
   * torso. */
  const HAND = { x: 0.211, y: 0.900, z: 0.004 };
  const putInHand = (m) => (geo) => geo.applyMatrix4(m);
  if (kind === 'spear') {
    const M = new THREE.Matrix4().makeTranslation(HAND.x + 0.040, HAND.y, HAND.z + 0.010);
    const at = putInHand(M);
    parts.push({ geo: at(cyl(0.011, 0.011, 2.05, 8).translate(0, 0.225, 0)), mat: mats.leather, bone: 'hand.R' });
    parts.push({ geo: at(new THREE.ConeGeometry(0.028, 0.20, 6).translate(0, 1.35, 0)), mat: mats.steel, bone: 'hand.R' });
    parts.push({ geo: at(cyl(0.016, 0.016, 0.05, 8).translate(0, 1.18, 0)), mat: mats.brass, bone: 'hand.R' });
  } else if (kind !== 'none') {
    /* the outboard tilt pivots about the GRIP, so the pommel (below the grip)
     * swings back IN toward the thigh and ended up 50% buried in it. Easing the
     * tilt and moving the whole weapon outboard keeps both ends clear: pommel
     * 0.205-0.243 against a thigh that reaches 0.182, blade tip 0.34 against a
     * pauldron that reaches 0.311. */
    const M = new THREE.Matrix4().makeTranslation(HAND.x + 0.042, HAND.y, HAND.z)
      .multiply(new THREE.Matrix4().makeRotationZ(-0.20))
      .multiply(new THREE.Matrix4().makeRotationX(0.22));
    const at = putInHand(M);
    const blade = new THREE.CylinderGeometry(0.007, 0.0025, 0.78, 4, 4).translate(0, 0.45, 0);
    blade.scale(2.4, 1, 1);                     /* width across the edge, thin through the flat */
    parts.push({ geo: at(blade), mat: mats.steel, bone: 'hand.R' });
    parts.push({ geo: at(box(0.130, 0.014, 0.020).translate(0, 0.055, 0)), mat: mats.brass, bone: 'hand.R' });
    parts.push({ geo: at(cyl(0.012, 0.013, 0.115, 8).translate(0, -0.005, 0)), mat: mats.leather, bone: 'hand.R' });
    parts.push({ geo: at(sph(0.019, 8, 6).translate(0, -0.085, 0)), mat: mats.brass, bone: 'hand.R' });
  }
  /* shield pieces are tagged so actor equipment can use an explicit grip transform. */
  const shieldStart=parts.length;
  /* shield on the left forearm */
  const sh = spec.shield || 'kite';
  /* 'none' has to mean none: the else branch below builds a SHIELD, so a spec of
   * 'none' silently produced a 0.52m round shield and wrecked every silhouette
   * measurement taken off it */
  if (sh === 'none') { /* no shield */ }
  else if (sh === 'kite') {
    const s = new THREE.Shape();
    s.moveTo(-0.20, 0.34); s.lineTo(0.20, 0.34);
    s.lineTo(0.185, -0.10); s.quadraticCurveTo(0.14, -0.34, 0, -0.44);
    s.quadraticCurveTo(-0.14, -0.34, -0.185, -0.10);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 5 });
    parts.push({ geo: g.translate(-0.160, 0.86, 0.335), mat: mats.shieldWood, bone: 'fore.L' });
    parts.push({ geo: sph(0.032, 10, 8).translate(-0.160, 0.90, 0.365), mat: mats.steel, bone: 'fore.L' });
  } else {
    parts.push({ geo: cyl(0.26, 0.26, 0.022, 22).rotateX(Math.PI / 2).translate(-0.160, 1.00, 0.335), mat: mats.shieldWood, bone: 'fore.L' });
    parts.push({ geo: sph(0.040, 10, 8).translate(-0.160, 1.00, 0.360), mat: mats.steel, bone: 'fore.L' });
  }

  for(let i=shieldStart;i<parts.length;i++)parts[i].equipment='shield';
  return parts;
}

/* =========================================================================
 * SKINNING. One mesh per material, all bound to the same skeleton, with each
 * vertex weighted rigidly to the bone that owns its part and BLENDED at the
 * joints so elbows and knees bend instead of snapping.
 * ========================================================================= */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function assemble(rig, parts, opts = {}) {
  const { bones, byName } = rig;
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));

  /* group by material so a soldier costs a handful of draws, not eighty */
  const byMat = new Map();
  for (const p of parts) {
    const mat = p.mat || (p.mesh && p.mesh.material);
    if (!mat) continue;
    const key = mat.uuid;
    if (!byMat.has(key)) byMat.set(key, { mat, items: [] });
    byMat.get(key).items.push(p);
  }

  const group = new THREE.Group();
  const skinned = [];
  const boneMatrices = bones.map((b) => b.matrixWorld);

  for (const { mat, items } of byMat.values()) {
    const geos = [];
    const owner = [];
    for (const p of items) {
      let g;
      if (p.mesh) {
        /* a plain mesh contributes its geometry; its transform is baked in */
        p.mesh.updateMatrix();
        g = p.mesh.geometry.clone().applyMatrix4(p.mesh.matrix);
      } else {
        g = p.geo.clone();
      }
      if (!g.attributes.uv) {
        const n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      const flat = g.index ? g.toNonIndexed() : g;
      const count = flat.attributes.position.count;
      owner.push({ headwear:p.headwear,skinChain:p.skinChain,softJoint:p.softJoint,rigid:p.rigid,bone: p.bone, start: geos.reduce((a, x) => a + x.attributes.position.count, 0), count });
      geos.push(flat);
    }
    if (!geos.length) continue;
    let geo;
    try { geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); }
    catch (e) { geo = geos[0]; }
    if (!geo) continue;

    const count = geo.attributes.position.count;
    const si = new Uint16Array(count * 4);
    const sw = new Float32Array(count * 4);
    /* rigid weights from the owning bone, then smooth across the joint planes */
    const jointBlend = opts.jointBlend ?? 0.085;
    const parentOf = new Map(bones.map((b) => [b.name, b.parent && boneIndex.has(b.parent.name) ? b.parent.name : null]));
    for (const o of owner) {
      const bi = boneIndex.get(o.bone) ?? 0;
      const parentName = parentOf.get(o.bone);
      const pi = parentName ? boneIndex.get(parentName) : null;
      const boneAbs = byName.get(o.bone) ? byName.get(o.bone).userData.abs : null;
      const parAbs = parentName ? byName.get(parentName).userData.abs : null;
      for (let v = o.start; v < o.start + o.count; v++) {
        if(o.skinChain){const y=geo.attributes.position.getY(v),j=o.skinChain.find(j=>y>=j.y-j.band)||o.skinChain[o.skinChain.length-1],u=THREE.MathUtils.clamp((y-j.y+j.band)/(2*j.band),0,1),w=u*u*(3-2*u);si[v*4]=boneIndex.get(j.upper);sw[v*4]=w;si[v*4+1]=boneIndex.get(j.lower);sw[v*4+1]=1-w;continue;}
        if(o.softJoint){const j=o.softJoint,y=geo.attributes.position.getY(v),u=THREE.MathUtils.clamp((y-(j.y-j.band))/(2*j.band),0,1),upper=u*u*(3-2*u);si[v*4]=boneIndex.get(j.upper);sw[v*4]=upper;si[v*4+1]=boneIndex.get(j.lower);sw[v*4+1]=1-upper;continue;}
        if(o.rigid){si[v*4]=bi;sw[v*4]=1;continue;}
        let wSelf = 1, wPar = 0;
        if (pi !== null && boneAbs && parAbs) {
          /* distance above the bone's own origin, toward its parent */
          const y = geo.attributes.position.getY(v);
          const d = y - boneAbs.y;
          if (d > -jointBlend && d < jointBlend) {
            const t = (d + jointBlend) / (2 * jointBlend);   /* 0 at parent side */
            wSelf = 0.5 + 0.5 * t;
            wPar = 1 - wSelf;
          }
        }
        si[v * 4] = bi; sw[v * 4] = wSelf;
        if (wPar > 0.001) { si[v * 4 + 1] = pi; sw[v * 4 + 1] = wPar; }
      }
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.userData.headwearParts=owner.filter(o=>o.headwear).map(o=>({style:o.headwear,start:o.start,count:o.count}));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    group.add(mesh);
    skinned.push(mesh);
  }

  /* ================= ORDER MATTERS MORE THAN ANYTHING ELSE HERE =================
   * THREE.Skeleton computes its boneInverses ONCE, at construction, by reading each
   * bone's matrixWorld at that instant. If the bone hierarchy has not been attached
   * and its world matrices have never been updated, every bone reads an IDENTITY
   * matrix, every inverse comes out identity, and at render time the skinned vertex
   * gets its bone's REST TRANSLATION ADDED A SECOND TIME. The symptom is not an
   * error: it is a body assembled from fragments, each part flung upward by its own
   * bone height, so the torso floats above the legs and the feet float below them,
   * with empty bands in between. That is what "gaps between every joint" actually
   * was, and no amount of joint overlap could ever have fixed it.
   *
   * So: attach the bones, UPDATE THE WORLD MATRICES, and only then build the
   * skeleton and bind. One bind, no DetachedBindMode, no second pass.
   * ========================================================================== */
  const root = new THREE.Group();
  root.add(byName.get('root'));
  group.add(root);
  group.updateMatrixWorld(true);            /* <- bones now hold their real rest matrices */

  const skeleton = new THREE.Skeleton(bones);   /* inverses computed from those matrices */
  for (const m of skinned) { m.bind(skeleton); }

  return { root: group, skeleton, meshes: skinned, rig };
}

/* =========================================================================
 * ANIMATION, GENERATED. No clips: a phase number and a mode is the whole input.
 * ========================================================================= */
export function animate(rig, t, mode = 'march', extra = {}) {
  const B = rig.byName;
  const set = (n, x, y, z) => { const b = B.get(n); if (b) b.rotation.set(x, y, z); };
  const TWO_PI = Math.PI * 2;

  /* reset everything so modes never leak into each other */
  for (const b of rig.bones) b.rotation.set(0, 0, 0);
  const hips = B.get('hips');
  if (hips) hips.position.y = hips.userData.abs.y;

  if (mode === 'idle' || mode === 'stand') {
    const s = Math.sin(t * 1.6), s2 = Math.sin(t * 1.6 + 0.7);
    set('spine', 0.02 + s * 0.014, 0, s2 * 0.010);
    set('chest', 0.01, s * 0.02, 0);
    set('head', -0.01, Math.sin(t * 0.7) * 0.06, 0);
    set('arm.L', 0.06, 0, 0.10);
    set('arm.R', 0.04, 0, -0.08);
    set('fore.L', -0.16, 0, 0);
    set('fore.R', -0.16, 0, 0);
    for (const s2n of ['L', 'R']) {
      set('thigh.' + s2n, 0.01, 0, (s2n === 'L' ? -1 : 1) * 0.03);
      set('shin.' + s2n, 0.02, 0, 0);
    }
  } else if (mode === 'march' || mode === 'walk' || mode === 'charge') {
    const p = mode === 'charge' ? t * 6.4 : mode === 'walk' ? t * 4.4 : t * 5.2;
    const amp = mode === 'charge' ? 1.15 : mode === 'walk' ? 0.62 : 0.82;
    const lean = mode === 'charge' ? 0.14 : mode === 'walk' ? 0.03 : 0.06;
    const sL = Math.sin(p), sR = Math.sin(p + Math.PI);
    /* legs: hip swing with a knee that only bends forward */
    set('thigh.L', sL * 0.72 * amp, 0, -0.02);
    set('thigh.R', sR * 0.72 * amp, 0, 0.02);
    set('shin.L', Math.max(0, -Math.sin(p + 0.9)) * 0.95 * amp + 0.05, 0, 0);
    set('shin.R', Math.max(0, -Math.sin(p + Math.PI + 0.9)) * 0.95 * amp + 0.05, 0, 0);
    set('foot.L', -0.12 - sL * 0.18, 0, 0);
    set('foot.R', -0.12 - sR * 0.18, 0, 0);
    /* arms counter-swing, spear arm held high and steadier */
    set('arm.L', sR * 0.11 * amp + 0.05, 0, 0.14);
    set('fore.L', -0.26 - Math.max(0, sR) * 0.10, 0, 0);
    const spearArm = extra.spearArm !== false;
    set('arm.R', spearArm ? 0.30 + sL * 0.10 : sL * 0.44 * amp + 0.08, 0, spearArm ? -0.16 : -0.10);
    set('fore.R', spearArm ? -0.95 : -0.40, 0, 0);
    /* torso lean and counter-rotation, the thing that sells weight */
    set('hips', lean * 0.4, -sL * 0.10, 0);
    set('spine', lean * 0.5, sL * 0.09, Math.sin(p * 2) * 0.018);
    set('chest', lean * 0.3, sL * 0.06, 0);
    set('head', -lean * 0.8, -sL * 0.05, 0);
    /* vertical bob on the hips, twice per stride */
    if (hips) hips.position.y = hips.userData.abs.y - 0.022 + Math.abs(Math.sin(p)) * 0.030 * amp;
  } else if (mode === 'dead') {
    set('hips', -1.2, 0, 0.3);
    set('spine', 0.2, 0, 0);
    set('head', 0.4, 0.3, 0);
    set('arm.L', 0.4, 0, 0.5);
    set('arm.R', 0.2, 0, -0.6);
    set('thigh.L', -0.4, 0, 0);
    set('thigh.R', -0.2, 0, 0);
    set('shin.L', 0.9, 0, 0);
    set('shin.R', 0.5, 0, 0);
    if (hips) hips.position.y = hips.userData.abs.y - 0.62;
  }
  /* ASYMMETRY, applied last so every mode inherits it: real bodies are never
   * mirrored. Slight head yaw, one shoulder dropped, hips off level. */
  const B2 = rig.byName;
  const tilt = (n, dx, dy, dz) => { const b = B2.get(n); if (b) { b.rotation.x += dx; b.rotation.y += dy; b.rotation.z += dz; } };
  tilt('head', 0.012, 0.052, -0.014);
  tilt('neck', 0.006, 0.018, -0.008);
  tilt('chest', 0, 0.010, 0.011);
  tilt('arm.R', 0.020, 0, -0.014);
  tilt('arm.L', -0.010, 0, 0.008);
  tilt('thigh.L', 0.018, 0.030, 0.010);
  tilt('thigh.R', -0.008, -0.020, -0.008);
  rig.root.updateMatrixWorld(true);
  return rig;
}

/* a cloned soldier needs its own bone lookup for animate() */
export function bindClone(root) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) { o.userData.abs = o.userData.abs || { x: o.position.x, y: o.position.y, z: o.position.z }; bones.push(o); } });
  const byName = new Map(bones.map((b) => [b.name, b]));
  return { root, bones, byName };
}

export function soldierStats(parts, assembled) {
  let tris = 0;
  for (const p of parts) {
    const g = p.geo || (p.mesh && p.mesh.geometry);
    if (!g) continue;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  return { parts: parts.length, tris: Math.round(tris), draws: assembled.meshes.length, bones: assembled.skeleton.bones.length };
}
