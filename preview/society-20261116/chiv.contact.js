// Swept, rendered blade segments against a body capsule. No radius-only sword hits.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b,t=1)=>a.map((x,i)=>x+b[i]*t),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function distance2(p,q,a,b){
 const d1=sub(q,p),d2=sub(b,a),r=sub(p,a),A=dot(d1,d1),E=dot(d2,d2),F=dot(d2,r);let s=0,t=0;
 if(A<1e-9&&E<1e-9)return dot(r,r);
 if(A<1e-9)t=clamp(F/E,0,1);else{const C=dot(d1,r);if(E<1e-9)s=clamp(-C/A,0,1);else{const B=dot(d1,d2),D=A*E-B*B;s=D?clamp((B*F-C*E)/D,0,1):0;t=(B*s+F)/E;if(t<0){t=0;s=clamp(-C/A,0,1);}else if(t>1){t=1;s=clamp((B-C)/A,0,1);}}}
 const v=sub(add(p,d1,s),add(a,d2,t));return dot(v,v);
}
export function traceKey(a){return a.type==='stab'||/^Stab/.test(a.name)?'stab:R':a.type==='overhead'||/^Overhead/.test(a.name)?'overhead:R':a.type==='slash'||/^Slash/.test(a.name)?'slash:'+(a.dir==='Right'?'R':'L'):null;}
export function bladeAt(traces,attack,u,space){
 const list=traces?.[space.view==='fp'?'fp':'body']?.[traceKey(attack)];if(!list)return null;
 const f=clamp(u,0,1)*(list.length-1),i=Math.floor(f),j=Math.min(i+1,list.length-1),v=list[i].map((x,k)=>x+(list[j][k]-x)*(f-i));
 const c=Math.cos(space.yaw),s=Math.sin(space.yaw),cp=Math.cos(space.pitch||0),sp=Math.sin(space.pitch||0),scale=space.scale||1;
 const world=(v)=>{let[x,y,z]=v;if(space.view==='fp'){const Y=y*cp-z*sp;z=y*sp+z*cp;y=Y;}return[space.x+(x*c+z*s)*scale,(space.y||0)+y*scale,space.z+(-x*s+z*c)*scale];};
 return[world(v.slice(0,3)),world(v.slice(3,6))];
}
export function bladeContact(traces,attack,from,to,att,def){
 const key=traceKey(attack),gap=Math.hypot(att.x-def.x,att.z-def.z);
 if(!key)return gap<=(attack.type==='kick'||attack.type==='jab'?1.12:1.5) && (attack.release<=0 || to>=.4);
 if(!traces)return false;
 const A=[def.x,(def.y||0)+.48,def.z],B=[def.x,(def.y||0)+1.48,def.z],radius=.29;
 const steps=Math.max(1,Math.ceil(Math.abs(to-from)*120));
 for(let n=0;n<=steps;n++){const u=from+(to-from)*n/steps,seg=bladeAt(traces,attack,u,att);if(seg&&distance2(seg[0],seg[1],A,B)<=radius*radius)return{u,blade:seg};}
 return false;
}
export function faces(att,def){const dx=att.x-def.x,dz=att.z-def.z;return dx*Math.sin(def.facing??def.yaw)+dz*Math.cos(def.facing??def.yaw)>0;}
