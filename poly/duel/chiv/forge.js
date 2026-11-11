/* ===========================================================================
 * FORGE — a real armour kit, built onto the skeleton we already have
 * ===========================================================================
 * WHY NOT A NEW MODEL FROM SCRATCH. The KayKit knight reads cheap for two reasons
 * that have nothing to do with its triangle count: its entire texture is a 13 KB
 * 1024x1024 atlas (almost no information in the image), and its silhouette is one
 * smooth blob with no layers. 6,952 triangles is plenty for a soldier in a crowd.
 *
 * So this does not replace the body. It keeps the body, the skeleton and all 76
 * clips — which the whole melee system already drives — and LAYERS REAL ARMOUR on
 * top of it: pauldrons with articulate lames, a keeled breastplate, a great helm
 * with a visor and comb, gauntlets, tassets, greaves, a tabard carrying the realm
 * device, and a longsword in the fist.
 *
 * Pieces are BUILT IN METRES and then parented to the bone they belong to, scaled
 * by the inverse of the model's own scale so that "0.3" always means 300mm no
 * matter what autoFit decided this rig needed. Bone-parenting rather than skinning
 * is deliberate: a pauldron does not deform, it pivots with the arm, so it cannot
 * go wrong the way weights can.
 * =========================================================================== */

import * as THREE from 'three';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';
let this_mergeFailures = 0;

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ materials */
export class Atlas {
  constructor(loader, base = './texset/') {
    this.tex = {};
    this.loading = [];
    const get = (name, { srgb = true, repeat = 1, aniso = 4 } = {}) => {
      const p = new Promise((res) => {
        loader.load(base + name, (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(repeat, repeat);
          t.anisotropy = aniso;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
          res(t);
        }, undefined, () => res(null));
      });
      this.loading.push(p);
      return p;
    };
    this.p = {
      steel: get('steel_basecolor.jpg'),
      steelN: get('steel_normal.jpg', { srgb: false }),
      mail: get('mail_basecolor.jpg'),
      mailN: get('mail_normal.jpg', { srgb: false }),
      cloth: get('cloth_basecolor.jpg'),
      clothN: get('cloth_normal.jpg', { srgb: false }),
      leather: get('leather_basecolor.jpg'),
      leatherN: get('leather_normal.jpg', { srgb: false }),
      brass: get('brass_basecolor.jpg'),
      brassN: get('brass_normal.jpg', { srgb: false }),
      heraldry: get('heraldry.png'),
    };
  }
  async ready() {
    const [steel, steelN, mail, mailN, cloth, clothN, leather, leatherN, brass, brassN, heraldry] =
      await Promise.all(Object.values(this.p));
    const mk = (map, normalMap, o = {}) => new THREE.MeshStandardMaterial({
      map, normalMap, normalScale: new THREE.Vector2(o.ns ?? 1, o.ns ?? 1),
      roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.0,
      color: o.color ?? 0xffffff, envMapIntensity: o.env ?? 0.9,
      side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, alphaTest: o.alphaTest ?? 0,
      depthWrite: o.depthWrite ?? true,
    });
    this.m = {
      steel: mk(steel, steelN, { rough: 0.42, metal: 0.95, ns: 1.1, env: 1.15 }),
      steelDark: mk(steel, steelN, { rough: 0.55, metal: 0.9, color: 0x8d949c, ns: 1.1 }),
      mail: mk(mail, mailN, { rough: 0.62, metal: 0.85, ns: 1.3 }),
      brass: mk(brass, brassN, { rough: 0.34, metal: 1.0, env: 1.2 }),
      leather: mk(leather, leatherN, { rough: 0.78, metal: 0.0, ns: 1.2 }),
      cloth: mk(cloth, clothN, { rough: 0.9, metal: 0.0, color: 0xe8e4da, side: THREE.DoubleSide, ns: 0.9 }),
      clothBlue: mk(cloth, clothN, { rough: 0.9, metal: 0.0, color: 0x2f6f9e, side: THREE.DoubleSide }),
      clothRed: mk(cloth, clothN, { rough: 0.9, metal: 0.0, color: 0xa8432c, side: THREE.DoubleSide }),
      crest: mk(null, null, { rough: 0.75, metal: 0.05, color: 0x1b3f5e }),
    };
    this.m.heraldry = new THREE.MeshStandardMaterial({
      map: heraldry, transparent: true, alphaTest: 0.35, roughness: 0.9, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    });
    return this;
  }
}

/* ------------------------------------------------------------------ helpers */
function bevelPlate(w, h, d, bevel = 0.012) {
  const s = new THREE.Shape();
  const x = w / 2, y = h / 2, r = Math.min(bevel, Math.min(w, h) * 0.35);
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  return g;
}

/* a curved lame, as used for pauldron and tasset plates: a section of a cylinder
   with a rolled lip, which is what makes layered armour read as layers */
function lame(radius, width, height, arc = Math.PI * 0.72, segs = 14) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.985, height, segs, 2, true, -arc / 2, arc);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    /* flare the bottom edge so plates overlap rather than stack like coins */
    const t = (height / 2 - y) / height;
    const k = 1 + t * t * 0.13;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function dome(r, segs = 18, rings = 12, a0 = 0, a1 = Math.PI * 0.62) {
  return new THREE.SphereGeometry(r, segs, rings, 0, Math.PI * 2, a0, a1);
}

/* a slab that follows a curve, for the breastplate's keel */
function keel(w, h, depth, keelAmount) {
  const g = new THREE.PlaneGeometry(w, h, 10, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const nx = x / (w / 2);
    const ny = y / (h / 2);
    /* barrel around the chest plus a central ridge */
    const z = Math.cos(nx * Math.PI * 0.5) * depth * (1 - 0.35 * ny * ny)
            + Math.exp(-Math.pow(nx * 3.2, 2)) * keelAmount;
    pos.setZ(i, z);
  }
  g.computeVertexNormals();
  return g;
}

function makeSword(steel, brass, leather) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0022, 0.86, 4, 6), steel);
  blade.scale.z = 2.6; blade.position.y = 0.50; blade.castShadow = true;
  g.add(blade);
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.70, 0.004), steel);
  fuller.position.set(0, 0.46, 0.008); g.add(fuller);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.016, 0.018), brass);
  guard.position.y = 0.065; guard.castShadow = true; g.add(guard);
  for (const s of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), brass);
    knob.position.set(s * 0.10, 0.065, 0); g.add(knob);
  }
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0135, 0.15, 8), leather);
  grip.position.y = -0.012; g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), brass);
  pommel.position.y = -0.093; pommel.castShadow = true; g.add(pommel);
  return g;
}

/* ------------------------------------------------------------------ the kit */
export function buildKit(M, opts = {}) {
  const side = opts.side ?? 'R';
  const kit = new THREE.Group();
  const add = (mesh, bone, pos, rot, ) => { kit.attachList.push({ mesh, bone, pos, rot }); return mesh; };
  kit.attachList = [];

  const S = M.steel, SD = M.steelDark, MA = M.mail, BR = M.brass, LE = M.leather;

  /* ---- GREAT HELM: dome, side plates, visor with a sight slit, comb, plume ---- */
  const head = new THREE.Group();
  const skull = new THREE.Mesh(dome(0.128, 20, 14, 0, Math.PI * 0.66), S);
  skull.castShadow = true; head.add(skull);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.132, 0.13, 20, 1, true), S);
  skirt.position.y = -0.062; skirt.castShadow = true; head.add(skirt);
  /* faceplate, angled back at the chin */
  const face = new THREE.Mesh(keel(0.20, 0.20, 0.055, 0.022), S);
  face.position.set(0, -0.035, 0.104); face.scale.y = 1.0; face.castShadow = true; head.add(face);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.016, 0.03), SD);
  brow.position.set(0, 0.055, 0.122); head.add(brow);
  /* the sight slit: two dark bars leave a gap that reads at any distance */
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.012, 0.014), M.crest);
    bar.position.set(s * 0.05, 0.028, 0.134); head.add(bar);
  }
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 6), M.crest);
    hole.rotation.x = Math.PI / 2; hole.position.set(s * (0.032 + i * 0.026), -0.058 - i * 0.012, 0.124 - i * 0.006);
    head.add(hole);
  }
  /* comb along the crown */
  const combShape = new THREE.Shape();
  combShape.moveTo(-0.11, 0); combShape.lineTo(0.11, 0); combShape.lineTo(0.085, 0.030); combShape.lineTo(-0.085, 0.030);
  const comb = new THREE.Mesh(new THREE.ExtrudeGeometry(combShape, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }),
    S); comb.rotation.y = Math.PI / 2; comb.position.set(0.007, 0.118, 0); head.add(comb);
  /* plume crest */
  const plume = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10, 0, Math.PI, 0, Math.PI * 0.75), opts.plumeMat ?? M.clothRed);
  plume.scale.set(0.45, 2.0, 1.5); plume.position.set(0, 0.135, -0.01); plume.castShadow = true; head.add(plume);
  add(head, 'head', V(0, 0.075, 0.008), V(0, 0, 0));

  /* ---- GORGET + BREASTPLATE + BACKPLATE ---- */
  const chest = new THREE.Group();
  const gorget = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.135, 0.085, 18, 1, true), S);
  gorget.position.y = 0.175; gorget.castShadow = true; chest.add(gorget);
  const breast = new THREE.Mesh(keel(0.34, 0.36, 0.115, 0.030), S);
  breast.position.set(0, 0.02, 0.055); breast.castShadow = true; chest.add(breast);
  const back = new THREE.Mesh(keel(0.32, 0.34, -0.095, -0.018), S);
  back.position.set(0, 0.02, -0.055); back.castShadow = true; chest.add(back);
  /* mail showing at the joins, which is what stops plate looking like plastic */
  const mailShirt = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.185, 0.22, 16, 1, true), MA);
  mailShirt.position.y = -0.16; chest.add(mailShirt);
  /* rivets along the plate margins */
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 6, 5), BR);
    r.position.set(s * (0.10 + i * 0.028), 0.155 - i * 0.028, 0.115 - i * 0.012); chest.add(r);
  }
  add(chest, 'chest', V(0, 0.02, 0.01), V(0, 0, 0));

  /* ---- PAULDRONS: three articulate lames each, the top one domed ---- */
  const addPauldron = (bone) => {
    const g = new THREE.Group();
    const cap = new THREE.Mesh(dome(0.105, 14, 10, 0, Math.PI * 0.52), S);
    cap.castShadow = true; g.add(cap);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(lame(0.098 + i * 0.011, 0.052, 0.052), S);
      l.position.y = -0.052 - i * 0.040; l.rotation.y = Math.PI * 0.5;
      l.castShadow = true; g.add(l);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.007, 6, 16, Math.PI), BR);
    band.rotation.set(Math.PI / 2, 0, Math.PI * 0.5); band.position.y = -0.03; g.add(band);
    add(g, bone, V(0, 0.012, 0), V(0.18, 0, 0));
  };
  addPauldron('upperarm.r'); addPauldron('upperarm.l');

  /* ---- REREBRACES + VAMBRACES (upper and lower arm) ---- */
  for (const s of ['r', 'l']) {
    const upper = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.050, 0.20, 12, 2, true), S);
    tube.position.y = -0.10; tube.castShadow = true; upper.add(tube);
    add(upper, 'upperarm.' + s, V(0, 0, 0), V(0, 0, 0));
    const lower = new THREE.Group();
    const vt = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.043, 0.20, 12, 2, true), S);
    vt.position.y = -0.10; vt.castShadow = true; lower.add(vt);
    const cope = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.050, 0.05, 12, 1, true), SD);
    cope.position.y = -0.19; lower.add(cope);
    add(lower, 'lowerarm.' + s, V(0, 0, 0), V(0, 0, 0));
  }

  /* ---- GAUNTLETS: cuff, back plate, knuckle row ---- */
  for (const s of ['r', 'l']) {
    const g = new THREE.Group();
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.040, 0.07, 12, 1, true), S);
    cuff.position.y = 0.02; g.add(cuff);
    const backp = new THREE.Mesh(bevelPlate(0.070, 0.055, 0.014, 0.008), S);
    backp.position.set(0, -0.028, 0.020); g.add(backp);
    const knuckles = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.062, 8, 1, false, 0, Math.PI), SD);
    knuckles.rotation.set(Math.PI / 2, 0, Math.PI / 2); knuckles.position.set(0, -0.052, 0.012); g.add(knuckles);
    add(g, 'hand.' + s, V(0, 0.005, 0), V(0, 0, 0));
  }

  /* ---- FAULD / TASSETS over the hips ---- */
  const hips = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.155 + i * 0.012, 0.163 + i * 0.014, 0.055, 18, 1, true), S);
    l.position.y = 0.035 - i * 0.052; l.castShadow = true; hips.add(l);
  }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.018, 8, 22), LE);
  belt.rotation.x = Math.PI / 2; belt.position.y = 0.07; hips.add(belt);
  add(hips, 'hips', V(0, 0.02, 0), V(0, 0, 0));

  /* ---- CUIESSES, GREAVES, SABATONS ---- */
  for (const s of ['r', 'l']) {
    const th = new THREE.Group();
    const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.24, 12, 2, true), S);
    cuisse.position.y = -0.12; cuisse.castShadow = true; th.add(cuisse);
    add(th, 'upperleg.' + s, V(0, 0, 0), V(0, 0, 0));
    const sh = new THREE.Group();
    const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.048, 0.22, 12, 2, true), S);
    greave.position.y = -0.11; greave.castShadow = true; sh.add(greave);
    const poleyn = new THREE.Mesh(dome(0.052, 12, 8, 0, Math.PI * 0.6), SD);
    poleyn.position.y = 0.01; poleyn.rotation.y = Math.PI * 0.5; sh.add(poleyn);
    add(sh, 'lowerleg.' + s, V(0, 0, 0), V(0, 0, 0));
    const ft = new THREE.Group();
    const sab = new THREE.Mesh(bevelPlate(0.088, 0.075, 0.15, 0.014), S);
    sab.rotation.x = Math.PI * 0.5; sab.position.set(0, 0.012, 0.055); sab.castShadow = true; ft.add(sab);
    add(ft, 'foot.' + s, V(0, 0, 0), V(0, 0, 0));
  }

  /* ---- TABARD: cloth over the breastplate carrying the realm device ---- */
  const tabard = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.52, 6, 10), opts.tabardMat ?? M.clothBlue);
  const fp = front.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) {           /* let the cloth hang and curl */
    const y = fp.getY(i), x = fp.getX(i);
    fp.setZ(i, Math.cos((x / 0.15) * Math.PI * 0.5) * 0.038 + Math.sin((y / 0.26) * 2.2) * 0.008);
  }
  front.geometry.computeVertexNormals();
  front.position.set(0, -0.16, 0.135); front.castShadow = true; tabard.add(front);
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), M.heraldry);
  decal.position.set(0, -0.055, 0.176); tabard.add(decal);
  const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.46, 5, 8), opts.tabardMat ?? M.clothBlue);
  backPanel.position.set(0, -0.18, -0.125); backPanel.rotation.y = Math.PI; tabard.add(backPanel);
  add(tabard, 'chest', V(0, 0.0, 0), V(0, 0, 0));

  /* ---- CAPE from the shoulders ---- */
  const cape = new THREE.Group();
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.92, 8, 14), opts.capeMat ?? M.clothRed);
  const cp = cm.geometry.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i), x = cp.getX(i);
    const droop = (0.46 - y) / 0.92;
    cp.setZ(i, -droop * droop * 0.16 + Math.cos((x / 0.2) * Math.PI * 0.5) * 0.05);
    cp.setX(i, x * (1 + droop * 0.28));
  }
  cm.geometry.computeVertexNormals();
  cm.position.set(0, -0.30, -0.13); cm.castShadow = true; cape.add(cm);
  add(cape, 'chest', V(0, 0.06, 0), V(0, 0, 0));

  /* ---- the sword, in the fist ---- */
  const sword = makeSword(M.steel, M.brass, M.leather);
  const handBone = side === 'R' ? 'hand.r' : 'hand.l';
  const slot = side === 'R' ? 'handslot.r' : 'handslot.l';
  add(sword, slot, V(0, 0, 0), V(Math.PI * 0.5, 0, 0));

  return kit;
}

/* ------------------------------------------------------------------ attach */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function indexBones(root) {
  const idx = new Map();
  root.traverse((o) => { if (o.name && !idx.has(norm(o.name))) idx.set(norm(o.name), o); });
  return idx;
}

/* parent every piece to its bone. Offsets are metres, converted into the model's
   own units by measuring its world scale, so this works at any autoFit size. */
export function dressRig(root, kit, opts = {}) {
  const idx = indexBones(root);
  const ws = root.getWorldScale(new THREE.Vector3());
  const unit = 1 / (ws.x || 1);
  let placed = 0;

  /* MERGE BY BONE AND MATERIAL BEFORE ATTACHING. The kit is 71 little meshes, which
   * is fine for one knight and ruinous for a crowd: six soldiers would be 426 draw
   * calls. Everything that shares a bone and a material can be one buffer, so the
   * same armour costs a couple of dozen draws instead. */
  const buckets = new Map();
  for (const { mesh, bone, pos, rot } of kit.attachList) {
    const b = idx.get(norm(bone));
    if (!b) continue;
    mesh.position.copy(pos).multiplyScalar(unit);
    mesh.rotation.set(rot.x, rot.y, rot.z);
    mesh.scale.setScalar(unit);
    mesh.updateMatrixWorld(true);

    /* The piece is still unparented here, so its own matrixWorld IS the transform it
     * should have in BONE-LOCAL space, and each leaf's matrixWorld already includes
     * the piece transform on top of the leaf's offset. So baking the leaf by its own
     * matrixWorld puts the geometry exactly where the piece belongs relative to the
     * bone, which is what the merged mesh needs, because it is attached with an
     * identity transform. Using the piece's INVERSE here instead threw every merged
     * piece back to its bone origin and the kit came out a metre tall. */
    mesh.traverse((leaf) => {
      if (!leaf.isMesh || !leaf.geometry) return;
      if (leaf.isSkinnedMesh) return;
      let g = leaf.geometry.clone();
      g.applyMatrix4(leaf.matrixWorld);
      if (!g.attributes.uv) {
        const n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      for (const k of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      }
      /* INDEXED AND NON-INDEXED GEOMETRY CANNOT BE MERGED. Three's primitives are
       * indexed, ExtrudeGeometry's output here is not, and mergeGeometries refuses
       * the bucket silently: it logs and returns null, so the catch below dropped
       * whole pieces of armour and the kit came out a metre tall instead of 1.72.
       * Everything is normalised to non-indexed first, then it merges cleanly. */
      const flat = g.index ? g.toNonIndexed() : g;
      if (flat !== g) g = flat;
      const mat = leaf.material;
      const key = bone + '|' + (mat && mat.uuid ? mat.uuid : 'none');
      if (!buckets.has(key)) buckets.set(key, { bone, mat, geos: [] });
      buckets.get(key).geos.push(g);
    });
    placed++;
  }

  const meshes = [];
  let merged = 0;
  for (const { bone, mat, geos } of buckets.values()) {
    const b = idx.get(norm(bone));
    if (!b) continue;
    let geo;
    try {
      geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    } catch (e) {
      geo = geos[0];
      this_mergeFailures = (typeof this_mergeFailures === 'number' ? this_mergeFailures : 0) + 1;
    }
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    m.userData.isKit = true;   /* so a cloned body can find and strip inherited plate */
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    b.add(m);
    meshes.push(m);
    merged += geos.length;
  }
  return { placed, of: kit.attachList.length, unit, meshes, pieces: merged, draws: meshes.length, mergeErrors: this_mergeFailures };
}

/* count what the kit actually is, so claims about it are measurable */
export function kitStats(kit) {
  /* COUNT THE ATTACH LIST, not the group. Every piece is registered for a bone and
   * then reparented onto it, so by the time you would inspect the group it is empty
   * and every count comes back zero. */
  let tris = 0, meshes = 0;
  const mats = new Set();
  for (const { mesh } of kit.attachList) {
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (o.material && o.material.uuid) mats.add(o.material.uuid);
      const g = o.geometry;
      if (g) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
  }
  return { meshes, tris: Math.round(tris), materials: mats.size };
}
