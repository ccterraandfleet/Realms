import{inside,invert}from'./spur-pilot.js?v=world-20261122-residents1';
import{delta}from'./surface-dig.js?v=world-20261122-residents1';
import {NATURAL_FEATURES} from './natural-geography.js?v=world-20261122-residents1';
import {terrainHeight} from './world-terrain.js?v=world-20261122-residents1';
export const B=Object.freeze({west:-156,east:-88,z:94,half:4,height:1.5,seconds:40,cost:Object.freeze({timber:36,iron:6,bricks:10})});
export const open=s=>!!s?.westmereBridge&&s.time>=s.westmereBridge.finish;
export const onDeck=(s,p,r=0)=>open(s)&&p.x>=B.west&&p.x<=B.east&&Math.abs(p.z-B.z)<=B.half-r;
export function floorHeight(s,x,z){if(inside(s,x,z))return invert(x);let y=terrainHeight(x,z)+delta(s,x,z);if(!onDeck(s,{x,z}))return y;const t=Math.min(1,(x-B.west)/5,(B.east-x)/5);return Math.max(y,y+(B.height-y)*t);}
// Split the convex lake at both deck edges. Keep original bank clearance,
// accounting for the extra buffer the navigation graph puts around each piece.
function halfLake(lake,sign){const edge=B.z+sign*(B.half+lake.margin),polygon=[];for(let i=0;i<lake.polygon.length;i++){let a=lake.polygon[i],b=lake.polygon[(i+1)%lake.polygon.length],da=sign*(a.z-edge),db=sign*(b.z-edge);if(da>=0)polygon.push(a);if(da*db<0)polygon.push({x:a.x+(b.x-a.x)*da/(da-db),z:edge});}return {...lake,id:lake.id+sign,polygon,minZ:Math.min(...polygon.map(p=>p.z)),maxZ:Math.max(...polygon.map(p=>p.z))};}
const crossed=NATURAL_FEATURES.flatMap(f=>f.id==='mere'?[halfLake(f,-1),halfLake(f,1)]:[f]);
export const landBarriers=s=>open(s)?crossed:NATURAL_FEATURES;
