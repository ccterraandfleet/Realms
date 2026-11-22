// Vertical footing corrections and spawn/teleport snaps are not strides.
export function gaitSpeed(last,now,dt){if(!last||!(dt>0))return 0;const v=Math.hypot(now.x-last.x,now.z-last.z)/dt;return v>12?0:Math.min(9,v);}
