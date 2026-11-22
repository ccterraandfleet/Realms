import{onDeck}from'./westmere-bridge.js?v=world-20261122-shovel1';
import{naturalFeatureAt}from'./natural-geography.js?v=world-20261122-shovel1';
import {terrainHeight} from './world-terrain.js?v=world-20261122-shovel1';
export const WORLD_BOUNDS=Object.freeze({minX:-170,maxX:170,minZ:-150,maxZ:150});
export const groundHeight=terrainHeight;
export const worldRoads=s=>Object.values(s.houses).map(h=>({id:'road:'+h.id,points:[{x:h.x,z:h.z},{x:0,z:0}]}));
export const visibleTrees=s=>(s.trees||[]).filter(t=>!naturalFeatureAt(t)&&Object.values(s.houses).every(h=>Math.hypot(h.x-t.x,h.z-t.z)>38));
export const inWorld=p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=-170&&p.x<=170&&p.z>=-150&&p.z<=150;
export const validOrderPoint=(p,s)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=165&&Math.abs(p.z)<=145&&(!naturalFeatureAt(p)||onDeck(s,p,1.8));
export function regionAt(s,p){return s.regions.slice().sort((a,b)=>((a.x-p.x)**2+(a.z-p.z)**2)-((b.x-p.x)**2+(b.z-p.z)**2)||a.id.localeCompare(b.id))[0]||null;}
// Survey districts are the deterministic nearest-control-point partition. They are not walls.
export function districtPolygons(s){return s.regions.map(r=>{let poly=[{x:-170,z:-150},{x:170,z:-150},{x:170,z:150},{x:-170,z:150}];for(const q of s.regions){if(q===r)continue;const nx=q.x-r.x,nz=q.z-r.z,c=(q.x*q.x+q.z*q.z-r.x*r.x-r.z*r.z)/2;if(Math.abs(nx)+Math.abs(nz)<1e-9){if(q.id<r.id)poly=[];continue;}const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=a.x*nx+a.z*nz-c,db=b.x*nx+b.z*nz-c,ia=da<=1e-8,ib=db<=1e-8;if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}}poly=out;}const center=poly.length?{x:poly.reduce((n,p)=>n+p.x,0)/poly.length,z:poly.reduce((n,p)=>n+p.z,0)/poly.length}:{x:r.x,z:r.z};return{id:r.id,points:poly,center};});}
export class MapViewport{
 constructor(){this.x=0;this.z=0;this.zoom=1;this.width=900;this.height=650;}
 resize(w,h){this.width=Math.max(1,w);this.height=Math.max(1,h);this.clamp();}
 get scale(){return Math.max(.01,Math.min((this.width-56)/340,(this.height-56)/300))*this.zoom;}
 project(p){return{x:this.width/2+(p.x-this.x)*this.scale,y:this.height/2+(p.z-this.z)*this.scale};}
 unproject(p){return{x:this.x+(p.x-this.width/2)/this.scale,z:this.z+(p.y-this.height/2)/this.scale};}
 fit(){this.x=0;this.z=0;this.zoom=1;}
 clamp(){this.x=Math.max(-170,Math.min(170,this.x));this.z=Math.max(-150,Math.min(150,this.z));if(this.zoom===1){this.x=0;this.z=0;}}
 zoomAt(factor,p={x:this.width/2,y:this.height/2}){const before=this.unproject(p);this.zoom=Math.max(1,Math.min(8,this.zoom*factor));const after=this.unproject(p);this.x+=before.x-after.x;this.z+=before.z-after.z;this.clamp();}
 pan(dx,dy){this.x-=dx/this.scale;this.z-=dy/this.scale;this.clamp();}
 focus(p,zoom=3){this.zoom=Math.max(1,Math.min(8,zoom));this.x=p.x;this.z=p.z;this.clamp();}
}
export function companiesInBox(s,house,v,a,b){return s.formations.filter(f=>{const p=v.project(f);return f.house===house&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);}).map(f=>f.id);}
export function mapHits(s,v,p,layer={residents:true,supplies:true}){const candidates=[];const add=(kind,o,r,rank)=>{const q=v.project(o),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<r)candidates.push({kind,id:o.id,object:o,d,rank});};for(const f of s.formations)add('formation',f,15,0);if(layer.supplies){for(const m of s.mounts||[])add('mount',m,10,2);for(const t of s.shipments||[])if(t.status==='travelling')add('shipment',t,12,1);}if(layer.residents)for(const a of Object.values(s.actors))if(a.f.hp>0)add('actor',a,7,3);for(const h of Object.values(s.houses))add('house',h,17,4);const natural=naturalFeatureAt(v.unproject(p));return candidates.sort((a,b)=>a.rank-b.rank||a.d-b.d)[0]||(natural?{kind:'natural',id:natural.id,object:natural}:null)||{kind:'region',id:regionAt(s,v.unproject(p))?.id};}
