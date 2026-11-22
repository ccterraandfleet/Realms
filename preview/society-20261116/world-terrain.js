import{naturalElevation}from'./natural-geography.js?v=world-20261122-shovel1';
// One sampled land surface for rendering, grounding, combat and cartography.
// This is initial geography. The separate excavation kernel is not yet a playable surface.
export const TERRAIN_REVISION='marches-natural-defences-1';
export const TERRAIN_GRID=Object.freeze({minX:-210,minZ:-190,width:420,depth:380,cell:2,nx:210,nz:190});
export const LANDFORMS=Object.freeze([{name:'Northwatch rise',x:-22,z:-118,height:10,rx:62,rz:48},{name:'Quarry ridge',x:137,z:-114,height:17,rx:58,rz:61},{name:'Western woodlands',x:-139,z:-61,height:12,rx:66,rz:77},{name:'Southfield shoulders',x:-130,z:136,height:9,rx:68,rz:56},{name:'Eastern downs',x:158,z:115,height:11,rx:64,rz:77}]);
const towns=[[-58,28],[66,-40],[75,87]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
export function terrainSeedHeight(x,z){let h=0;for(const p of LANDFORMS)h+=p.height*Math.exp(-(((x-p.x)/p.rx)**2+((z-p.z)/p.rz)**2));let distance=Math.hypot(x,z)-18;for(const p of towns){distance=Math.min(distance,Math.hypot(x-p[0],z-p[1])-48,segmentDistance(x,z,[0,0],p)-5);}const cap=Math.max(0,distance)*.22,blend=Math.max(1-Math.abs(h-cap),0);return naturalElevation(x,z,Math.max(0,Math.min(h,cap)-blend*blend*.25));}

const{nx,nz,cell,minX,minZ}=TERRAIN_GRID,grid=new Float64Array((nx+1)*(nz+1));for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)grid[j*(nx+1)+i]=terrainSeedHeight(minX+i*cell,minZ+j*cell);
export function terrainHeight(x,z){const gx=clamp((x-minX)/cell,0,nx),gz=clamp((z-minZ)/cell,0,nz),i=Math.min(nx-1,Math.floor(gx)),j=Math.min(nz-1,Math.floor(gz)),u=gx-i,v=gz-j,k=j*(nx+1)+i,a=grid[k],b=grid[k+1],c=grid[k+nx+1],d=grid[k+nx+2];return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);}
export function terrainGradient(x,z,span=.5){return{x:(terrainHeight(x+span,z)-terrainHeight(x-span,z))/(2*span),z:(terrainHeight(x,z+span)-terrainHeight(x,z-span))/(2*span)};}
export function terrainNormal(x,z,span=.5){const g=terrainGradient(x,z,span),len=Math.hypot(g.x,1,g.z);return[-g.x/len,1/len,-g.z/len];}
export function groundBasis(x,z,yaw,ground=terrainHeight,span=.65){const gx=(ground(x+span,z)-ground(x-span,z))/(2*span),gz=(ground(x,z+span)-ground(x,z-span))/(2*span),norm=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],up=norm([-gx,1,-gz]),forward=norm([Math.sin(yaw),gx*Math.sin(yaw)+gz*Math.cos(yaw),Math.cos(yaw)]),right=norm(cross(up,forward));return{right,up,forward};}
// Surface camera obstruction. Tunnels will use the future solid-volume query.
export function terrainCameraLimit(from,to,margin=.12,surface=terrainHeight){const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,n=Math.max(1,Math.ceil(Math.hypot(dx,dy,dz)/.15));let safe=0;for(let i=1;i<=n;i++){const t=i/n;if(from.y+dy*t<surface(from.x+dx*t,from.z+dz*t)+margin){let a=safe,b=t;for(let j=0;j<10;j++){const m=(a+b)/2;if(from.y+dy*m>=surface(from.x+dx*m,from.z+dz*m)+margin)a=m;else b=m;}return{x:from.x+dx*a,y:from.y+dy*a,z:from.z+dz*a,fraction:a};}safe=t;}return{x:to.x,y:to.y,z:to.z,fraction:1};}
