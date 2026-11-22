import{terrainHeight}from'./world-terrain.js?v=world-20261122-marches1';
// Game-space pilot on the western approach. A completed slice removes only
// solid material between the sloping invert and crown, never its overburden.
export const P={x:104,z:-110,w:2.4,h:2.3,step:.5,max:20};
const base=terrainHeight(P.x,P.z);export const invert=x=>base-.18*Math.max(0,x-P.x),end=s=>P.x+(s.highstoneYard?.pilot?.slices||0)*P.step;
export const inside=(s,x,z)=>end(s)>P.x&&x>=P.x&&x<=end(s)&&Math.abs(z-P.z)<=P.w/2;
export function cost(i){let v=0;for(let a=0;a<8;a++)for(let b=0;b<12;b++){const x=P.x+(i+(a+.5)/8)*P.step,z=P.z+P.w*((b+.5)/12-.5);v+=Math.min(P.h,Math.max(0,terrainHeight(x,z)-invert(x)));}return Math.max(1,Math.round(1000*v*P.step*P.w/96));}
export function pilotMove(s,a,b,r){const e=end(s),limit=e-r;if(limit<=P.x||a.x< P.x-1||a.x>e+.001||Math.abs(a.z-P.z)>P.w/2-r+.02||b.x<P.x)return null;return{x:Math.min(b.x,limit),z:Math.max(P.z-P.w/2+r,Math.min(b.z,P.z+P.w/2-r))};}
export function startPilot(s,a){const y=s.highstoneYard;if(!y?.prepared||y.cuts!==8||y.rockLitres<1000)throw Error('Prepare the yard and deliver its loose stone first.');if(a.quarryLoad||Math.hypot(a.x-end(s),a.z-P.z)>2.4)throw Error('Work with an empty barrow at the pilot face.');if((y.pilot?.slices||0)>=P.max)throw Error('The blind pilot is complete.');if(a.f.stam<5)throw Error('Rest before cutting rock.');}
export function finishPilot(s,a){startPilot(s,a);const p=s.highstoneYard.pilot??={slices:0,partial:0,removed:0};const n=Math.min(125,cost(p.slices)-p.partial);p.partial+=n;p.removed+=n;a.quarryLoad=n;a.f.stam-=5;if(p.partial===cost(p.slices)){p.slices++;p.partial=0;}}
