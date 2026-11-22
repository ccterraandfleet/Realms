import {inside,P,invert} from './spur-pilot.js?v=world-20261122-anatomy3';
import {terrainHeight} from './world-terrain.js?v=world-20261122-anatomy3';
// Physical overhead rock, not a darkness, ventilation or housing measurement.
export function roofAt(s,x,z){if(!inside(s,x,z))return 'outside';return terrainHeight(x,z)>invert(x)+P.h+.001?'roofed':'open cut';}
export function trackCover(s,dt){for(const a of Object.values(s.actors)){if(!a.f.alive||a.f.hp<=0||a.mountId){if(a.cover)a.cover.streak=0;continue;}if(roofAt(s,a.x,a.z)!=='roofed'){if(a.cover)a.cover.streak=0;continue;}a.cover??={total:0,streak:0};a.cover.total+=dt;a.cover.streak+=dt;}}
export function coverCensus(s,house){let living=0,under=0,seconds=0;for(const a of Object.values(s.actors)){if(a.house!==house)continue;seconds+=a.cover?.total||0;if(!a.f.alive||a.f.hp<=0)continue;living++;if(!a.mountId&&roofAt(s,a.x,a.z)==='roofed')under++;}return{living,under,seconds};}
