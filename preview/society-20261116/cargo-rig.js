/* A back-carried load is supported by a frame, shoulder straps and hip belt.
 * All offsets are chest-local metres. No animation or inventory authority here. */
import * as THREE from './lib/three.module.js?v=world-20261122-shovel1';
import {mergeGeometries} from './lib/BufferGeometryUtils.js?v=world-20261122-shovel1';
export const CARGO_FIT=Object.freeze({scale:.62,crate:[0,-.245,-.36],frameZ:-.18,railX:.16});
export function attachCargoToChest(pack,actor){
 const chest=actor.bone('chest');
 if(!chest)return false;
 if(pack.parent!==chest)chest.add(pack);
 pack.position.set(0,0,0);pack.quaternion.identity();pack.scale.setScalar(1);
 pack.updateWorldMatrix(true,true);return true;
}
export function makeCargoHarness(crate,wood){
 const pack=new THREE.Group();pack.name='framed-cargo';pack.userData.signature=crate.userData.signature;
 crate.scale.setScalar(CARGO_FIT.scale);crate.position.set(...CARGO_FIT.crate);pack.add(crate);
 const frame=new THREE.Group(),leather=new THREE.MeshStandardMaterial({color:'#503526',roughness:.86}),metal=new THREE.MeshStandardMaterial({color:'#a38b63',metalness:.65,roughness:.6}),pad=new THREE.MeshStandardMaterial({color:'#645846',roughness:1});
 const add=(geo,mat,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);frame.add(m);return m;};
 const bar=(x,y,z,w,h,d,mat=wood)=>add(new THREE.BoxGeometry(w,h,d),mat,x,y,z);
 for(const x of[-.16,.16]){bar(x,-.035,-.18,.032,.49,.035);bar(x,-.035,-.156,.046,.28,.018,pad);bar(x,-.265,-.345,.036,.033,.365);}
 for(const y of[-.255,.17])bar(0,y,-.18,.35,.035,.035);
 // Rectangular leather straps, not round ropes. Curve only describes the harness.
 function strap(x,points,width=.038){
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(x,p[0],p[1]))),pos=[],idx=[],segments=40;
  for(let i=0;i<=segments;i++){const p=path.getPoint(i/segments),t=path.getTangent(i/segments),n=new THREE.Vector3(0,-t.z,t.y).normalize();for(const [side,thick]of[[-1,-1],[1,-1],[1,1],[-1,1]])pos.push(p.x+side*width/2,p.y+n.y*thick*.004,p.z+n.z*thick*.004);if(i<segments)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4;idx.push(a,b,a+4,b,b+4,a+4);}}
  idx.push(0,2,1,0,3,2,segments*4,segments*4+1,segments*4+2,segments*4,segments*4+2,segments*4+3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3*2),2));g.setIndex(idx);g.computeVertexNormals();add(g,leather);
 }
 for(const x of[-.112,.112]){
  strap(x,[[.15,-.195],[.205,-.10],[.21,.035],[.13,.156],[-.05,.166],[-.245,.148],[-.25,-.02],[-.24,-.18]]);
  // Lash crate to its frame and support shelf, with visible hardware at the back.
  strap(x,[[-.23,-.18],[.055,-.215],[.04,-.51],[-.225,-.515],[-.27,-.36],[-.25,-.185]],.026);
  for(const y of[-.065,-.015])bar(x,y,.174,.047,.008,.009,metal);
  for(const sx of[-1,1])bar(x+sx*.020,-.04,.174,.007,.056,.009,metal);
 }
 const belt=new THREE.TorusGeometry(.165,.012,4,40);belt.rotateX(Math.PI/2);belt.scale(1,1,.91);add(belt,leather,0,-.245,0);bar(0,-.245,.16,.044,.028,.013,metal);
 const batches=new Map();for(const m of frame.children){m.updateMatrix();m.geometry.applyMatrix4(m.matrix);if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(m.geometry);}
 for(const[material,geos]of batches){const merged=mergeGeometries(geos);geos.forEach(g=>g.dispose());const mesh=new THREE.Mesh(merged,material);mesh.name='cargo-harness';mesh.castShadow=true;mesh.receiveShadow=true;pack.add(mesh);}
 return pack;
}
